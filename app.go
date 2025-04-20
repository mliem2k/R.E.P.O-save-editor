package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"hash"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	// Default password used in the Python version
	defaultPassword = "Why would you want to cheat?... :o It's no fun. :') :'D"
)

// App struct
type App struct {
	ctx context.Context
}

// SaveData represents the structure of the save file
type SaveData struct {
	// Add specific fields based on the save file structure
	RawData    []byte
	Decrypted  []byte
	JSONString string
}

// SteamPlayerSummary represents the player data from Steam API
type SteamPlayerSummary struct {
	SteamID      string `json:"steamid"`
	PersonaName  string `json:"personaname"`
	ProfileURL   string `json:"profileurl"`
	Avatar       string `json:"avatar"`
	AvatarMedium string `json:"avatarmedium"`
	AvatarFull   string `json:"avatarfull"`
	PersonaState int    `json:"personastate"`
}

type SteamPlayerResponse struct {
	Response struct {
		Players []SteamPlayerSummary `json:"players"`
	} `json:"response"`
}

// SteamProfile represents the Steam Community XML profile data
type SteamProfile struct {
	XMLName      xml.Name `xml:"profile"`
	SteamID64    string   `xml:"steamID64"`
	SteamID      string   `xml:"steamID"`
	OnlineState  string   `xml:"onlineState"`
	StateMessage string   `xml:"stateMessage"`
	AvatarIcon   string   `xml:"avatarIcon"`
	AvatarMedium string   `xml:"avatarMedium"`
	AvatarFull   string   `xml:"avatarFull"`
	RealName     string   `xml:"realname"`
	Summary      string   `xml:"summary"`
	InGameInfo   struct {
		GameName      string `xml:"gameName"`
		GameLink      string `xml:"gameLink"`
		GameIcon      string `xml:"gameIcon"`
		GameLogo      string `xml:"gameLogo"`
		GameLogoSmall string `xml:"gameLogoSmall"`
	} `xml:"inGameInfo"`
	CustomURL   string `xml:"customURL"`
	MemberSince string `xml:"memberSince"`
	Location    string `xml:"location"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// PBKDF2 implementation based on Go's crypto/pbkdf2 package
// but modified to match the Python implementation
func pbkdf2(password, salt []byte, iterations, keyLen int, h func() hash.Hash) []byte {
	prf := func(key, data []byte) []byte {
		hm := hmac.New(h, key)
		hm.Write(data)
		return hm.Sum(nil)
	}

	// Match the Python implementation which uses HMAC-SHA1
	derivedKey := make([]byte, 0, keyLen)
	blockCount := (keyLen + h().Size() - 1) / h().Size()

	for i := 1; i <= blockCount; i++ {
		block := prf(password, append(salt, byte(i>>24), byte(i>>16), byte(i>>8), byte(i)))
		temp := block

		for j := 1; j < iterations; j++ {
			block = prf(password, block)
			for k := 0; k < len(temp); k++ {
				temp[k] ^= block[k]
			}
		}

		derivedKey = append(derivedKey, temp...)
	}

	return derivedKey[:keyLen]
}

// decryptES3 decrypts an ES3 file using the provided password
// It returns the decrypted data as bytes
func decryptES3(filePath, password string) ([]byte, error) {
	// Read encrypted file
	encryptedData, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("error reading file: %w", err)
	}

	// Extract the IV (first 16 bytes)
	if len(encryptedData) < 16 {
		return nil, fmt.Errorf("encrypted data too short")
	}
	iv := encryptedData[:16]
	encryptedData = encryptedData[16:]

	// Derive the key using PBKDF2 with HMAC-SHA1
	key := pbkdf2([]byte(password), iv, 100, 16, sha1.New)

	// Decrypt the data using AES-128-CBC
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("error creating AES cipher: %w", err)
	}

	// Create CBC decrypter
	mode := cipher.NewCBCDecrypter(block, iv)
	decryptedData := make([]byte, len(encryptedData))
	mode.CryptBlocks(decryptedData, encryptedData)

	// Remove padding (PKCS#7)
	paddingLen := int(decryptedData[len(decryptedData)-1])
	if paddingLen > aes.BlockSize || paddingLen == 0 {
		return nil, fmt.Errorf("invalid padding")
	}
	decryptedData = decryptedData[:len(decryptedData)-paddingLen]

	// Check if the data is GZip compressed (GZip magic number: 0x1f 0x8b)
	if len(decryptedData) >= 2 && decryptedData[0] == 0x1f && decryptedData[1] == 0x8b {
		// Decompress GZip data
		reader, err := gzip.NewReader(bytes.NewReader(decryptedData))
		if err != nil {
			return nil, fmt.Errorf("error creating gzip reader: %w", err)
		}
		defer reader.Close()

		decompressedData, err := io.ReadAll(reader)
		if err != nil {
			return nil, fmt.Errorf("error decompressing data: %w", err)
		}
		return decompressedData, nil
	}

	return decryptedData, nil
}

// extractJSON finds valid JSON content by looking for the first opening curly brace
// This is needed because the decrypted data may have a binary header before the JSON content
func extractJSON(data []byte) []byte {
	jsonStart := bytes.IndexByte(data, '{')
	if jsonStart == -1 {
		return data // No JSON object found, return original data
	}
	return data[jsonStart:]
}

// cleanJSON cleans and formats the JSON data
func cleanJSON(jsonData []byte) []byte {
	// Convert to string for easier manipulation
	jsonStr := string(jsonData)

	// Handle line breaks for consistent parsing
	jsonStr = strings.ReplaceAll(jsonStr, "\r\n", "\n")

	// Split into lines and find the main JSON object
	lines := strings.Split(jsonStr, "\n")
	var jsonLines []string
	var depth int
	var started bool

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Count opening and closing braces
		for _, char := range line {
			if char == '{' {
				depth++
				if !started {
					started = true
				}
			} else if char == '}' {
				depth--
			}
		}

		if started {
			jsonLines = append(jsonLines, line)
			// If we've found a complete JSON object, stop
			if depth == 0 {
				break
			}
		}
	}

	if len(jsonLines) == 0 {
		return []byte("{}")
	}

	// Join the lines and clean up
	jsonStr = strings.Join(jsonLines, "\n")

	// Remove any trailing commas before closing braces/brackets
	jsonStr = strings.ReplaceAll(jsonStr, ",}", "}")
	jsonStr = strings.ReplaceAll(jsonStr, ",]", "]")

	// Remove any trailing whitespace
	jsonStr = strings.TrimSpace(jsonStr)

	return []byte(jsonStr)
}

// convertDotNetJSON converts .NET serialized JSON to regular JSON
func (a *App) convertDotNetJSON(jsonData []byte) ([]byte, error) {
	// First clean the JSON
	cleanedJSON := cleanJSON(jsonData)

	// Parse the JSON to validate and normalize it
	var data map[string]interface{}
	if err := json.Unmarshal(cleanedJSON, &data); err != nil {
		// Try to extract just the first complete JSON object
		var depth int
		var buffer bytes.Buffer
		var inString bool
		var escaped bool

		for i := 0; i < len(cleanedJSON); i++ {
			char := cleanedJSON[i]
			buffer.WriteByte(char)

			if escaped {
				escaped = false
				continue
			}

			if char == '\\' {
				escaped = true
				continue
			}

			if char == '"' && !escaped {
				inString = !inString
				continue
			}

			if !inString {
				if char == '{' {
					depth++
				} else if char == '}' {
					depth--
					if depth == 0 {
						// Found a complete JSON object
						break
					}
				}
			}
		}

		// Try parsing again with the extracted object
		cleanedJSON = buffer.Bytes()
		if err := json.Unmarshal(cleanedJSON, &data); err != nil {
			return nil, fmt.Errorf("error parsing JSON: %w", err)
		}
	}

	// Convert .NET types to regular JSON
	converted := make(map[string]interface{})

	// Helper function to convert values recursively
	var convertValue func(interface{}) interface{}
	convertValue = func(v interface{}) interface{} {
		switch val := v.(type) {
		case map[string]interface{}:
			// Check if it's a .NET type
			if typeStr, ok := val["__type"].(string); ok {
				// If it has a value field, extract and convert it
				if value, hasValue := val["value"]; hasValue {
					return convertValue(value)
				}
				// For dictionary types
				if strings.Contains(typeStr, "Dictionary") {
					if items, ok := val["value"].(map[string]interface{}); ok {
						result := make(map[string]interface{})
						for k, v := range items {
							result[k] = convertValue(v)
						}
						return result
					}
				}
				return nil
			}

			// Regular map, convert all values
			result := make(map[string]interface{})
			for k, v := range val {
				result[k] = convertValue(v)
			}
			return result

		case []interface{}:
			result := make([]interface{}, len(val))
			for i, v := range val {
				result[i] = convertValue(v)
			}
			return result

		default:
			return v
		}
	}

	// Convert each top-level field
	for k, v := range data {
		converted[k] = convertValue(v)
	}

	// Convert back to JSON bytes
	return json.Marshal(converted)
}

// OpenSaveFile opens a file dialog and reads the selected save file
func (a *App) OpenSaveFile() (string, error) {
	// Open file dialog
	file, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select R.E.P.O Save File",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "R.E.P.O Save Files (*.es3)",
				Pattern:     "*.es3",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		},
	})

	if err != nil {
		return "", fmt.Errorf("error opening file dialog: %w", err)
	}

	if file == "" {
		return "", nil // User cancelled
	}

	// Decrypt the file
	decryptedData, err := decryptES3(file, defaultPassword)
	if err != nil {
		return "", fmt.Errorf("error decrypting file: %w", err)
	}

	// Extract JSON content
	jsonData := extractJSON(decryptedData)
	if len(jsonData) == 0 {
		return "", fmt.Errorf("no JSON data found in file")
	}

	// Convert .NET JSON to regular JSON
	convertedJSON, err := a.convertDotNetJSON(jsonData)
	if err != nil {
		return "", fmt.Errorf("error converting JSON: %w", err)
	}

	return string(convertedJSON), nil
}

// SaveFile saves the modified data back to a file
func (a *App) SaveFile(jsonData string, targetPath string) error {
	// TODO: Implement save file functionality
	// 1. Convert JSON back to proper format
	// 2. Encrypt data
	// 3. Save to file
	return fmt.Errorf("save functionality not yet implemented")
}

// GetSteamPlayerInfo fetches player info from Steam Community XML API
func (a *App) GetSteamPlayerInfo(steamID string) (*SteamProfile, error) {
	url := fmt.Sprintf("https://steamcommunity.com/profiles/%s/?xml=1", steamID)

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Steam profile: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %v", err)
	}

	var profile SteamProfile
	if err := xml.Unmarshal(body, &profile); err != nil {
		return nil, fmt.Errorf("failed to parse XML response: %v", err)
	}

	// If no SteamID64 is returned, the profile doesn't exist
	if profile.SteamID64 == "" {
		return nil, fmt.Errorf("no player found with Steam ID: %s", steamID)
	}

	return &profile, nil
}

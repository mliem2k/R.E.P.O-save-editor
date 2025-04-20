import { useState, useEffect, useCallback, useRef } from 'react';
import { OpenSaveFile } from '../wailsjs/go/main/App';
import { GetSteamPlayerInfo } from '../wailsjs/go/main/App';
import { WindowMinimise, WindowToggleMaximise, Quit } from '../wailsjs/runtime/runtime';
import './App.css';
import Editor from "@monaco-editor/react";

// Helper component for displaying key-value pairs in a grid
function DataGrid({ title, data }) {
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return <div className="data-section"><h3 className="data-section-title">{title}</h3><p>No data available.</p></div>;
  }
  return (
    <div className="data-section">
      <h3 className="data-section-title">{title}</h3>
      <div className="data-grid">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="data-item">
            <span className="data-key">{key}:</span>
            <span className="data-value">{JSON.stringify(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper component for displaying simple list
function DataList({ title, data }) {
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return <div className="data-section"><h3 className="data-section-title">{title}</h3><p>No data available.</p></div>;
  }
   return (
    <div className="data-section">
      <h3 className="data-section-title">{title}</h3>
      <ul className="data-list">
        {Object.entries(data).map(([key, value]) => (
          <li key={key} className="data-list-item">
             <span className="data-key">{key}:</span> <span className="data-value">{JSON.stringify(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Helper Functions ---
function formatKeyName(key) {
  if (typeof key !== 'string') return key;

  // Special case handling for common prefixes
  const prefixes = ['items', 'item', 'currency'];
  let formattedKey = key;

  // Handle prefixes first
  for (const prefix of prefixes) {
    if (formattedKey.toLowerCase().startsWith(prefix)) {
      // Remove the prefix and keep the rest
      formattedKey = formattedKey.slice(prefix.length);
      // Add back the prefix with proper capitalization
      formattedKey = prefix.charAt(0).toUpperCase() + prefix.slice(1) + formattedKey;
      break;
    }
  }

  // Remove "player" prefix if present (case insensitive)
  formattedKey = formattedKey.replace(/^player\s*/i, '');

  // Add spaces before capital letters (except the first one)
  formattedKey = formattedKey.replace(/([A-Z])/g, ' $1').trim();
  
  // Capitalize the first letter
  formattedKey = formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);

  // Handle specific cases
  formattedKey = formattedKey
    .replace(/ Id /g, ' ID ')  // Fix ID capitalization
    .replace(/S Purchased/g, 's Purchased')  // Fix sPurchased
    .replace(/S Upgrades/g, 's Upgrades')   // Fix sUpgrades
    .replace(/Items /g, 'Items ')  // Ensure "Items" stays plural
    .replace(/Mapplayercount/g, 'Map Player Count'); // Fix mapplayercount

  return formattedKey;
}

// --- Editable Field Component ---
function EditableField({ label, value, path, onUpdate }) {
  const [currentValue, setCurrentValue] = useState(String(value)); // Store as string locally

  // Update local state if parent state changes (e.g., JSON edit updates this field)
  useEffect(() => {
    const stringValue = String(value);
    if (stringValue !== currentValue) {
       setCurrentValue(stringValue);
    }
     // Keep ESLint happy, but avoid infinite loops if onUpdate causes re-render
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    setCurrentValue(e.target.value);
  };

  const tryUpdate = () => {
    let newValue = currentValue.trim(); // Trim whitespace
    const originalType = typeof value;
    const originalValueString = String(value);

    // Attempt type conversion back to original type
    if (originalType === 'number') {
      if (currentValue === '' || isNaN(Number(currentValue))) {
        // Revert if empty or not a valid number for a number field
        setCurrentValue(originalValueString);
        return;
      }
      newValue = Number(currentValue);
    } else if (originalType === 'boolean') {
      const lowerCaseValue = currentValue.toLowerCase();
      if (lowerCaseValue === 'true') {
        newValue = true;
      } else if (lowerCaseValue === 'false') {
        newValue = false;
      } else {
        // Revert if not true/false for a boolean field
        setCurrentValue(originalValueString);
        return;
      }
    } // Keep as string otherwise

    // Only call update if the final typed value actually changed
    if (newValue !== value) {
      onUpdate(path, newValue);
    } else if (currentValue !== originalValueString) {
      // If the input string is different but the typed value is the same,
      // reset the display to the canonical string form (e.g., user typed "01", value is 1)
      setCurrentValue(originalValueString);
    }
  };

  const handleBlur = () => {
    tryUpdate();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      tryUpdate();
      e.target.blur(); // Optional: remove focus after Enter
    }
     if (e.key === 'Escape') {
       setCurrentValue(String(value)); // Revert on Escape
       e.target.blur();
     }
  };

  return (
    <div className="editable-item">
      <label className="editable-key">{label}:</label>
      <input
        type="text"
        className="editable-value-input"
        value={currentValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyPress} // Use onKeyDown for Escape
      />
    </div>
  );
}

// Steam Profile Component with Editable Fields
function PlayerCard({ steamId, playerData, onUpdate }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await GetSteamPlayerInfo(steamId);
        setProfile(data);
        setError(null);
      } catch (err) {
        setError(err.message);
        setProfile(null);
      }
    };

    if (steamId) {
      fetchProfile();
    }
  }, [steamId]);

  if (error) {
    return <div className="steam-profile-error">{error}</div>;
  }

  if (!profile) {
    return <div className="steam-profile-loading">Loading profile...</div>;
  }

  return (
    <div className="player-card">
      <div className="player-header">
        <img src={profile.AvatarMedium} alt="Steam avatar" className="steam-avatar" />
        <h3 className="player-name">{profile.SteamID}</h3>
      </div>
      <div className="player-stats">
        {Object.entries(playerData).map(([key, value]) => (
          <EditableField
            key={key}
            label={formatKeyName(key)}
            value={value}
            path={['value', key, steamId]}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

// Define item categories (matching Python's grouping)
const ITEM_CATEGORIES = {
  "Carts": ["Cart Medium", "Cart Small"],
  "Drones": ["Drone Battery", "Drone Feather", "Drone Indestructible", 
            "Drone Torque", "Drone Zero Gravity"],
  "Grenades": ["Grenade Duct Taped", "Grenade Explosive", "Grenade Human",
              "Grenade Shockwave", "Grenade Stun"],
  "Guns": ["Gun Handgun", "Gun Shotgun", "Gun Tranq"],
  "Health": ["Health Pack Large", "Health Pack Medium", "Health Pack Small"],
  "Melee": ["Melee Baseball Bat", "Melee Frying Pan", "Melee Inflatable Hammer",
           "Melee Sledge Hammer", "Melee Sword"],
  "Mines": ["Mine Explosive", "Mine Shockwave", "Mine Stun"],
  "Upgrades": ["Upgrade Map Player Count", "Upgrade Player Energy", 
              "Upgrade Player Extra Jump", "Upgrade Player Grab Range",
              "Upgrade Player Grab Strength", "Upgrade Player Health",
              "Upgrade Player Sprint Speed", "Upgrade Player Tumble Launch"],
  "Other": ["Orb Zero Gravity", "Power Crystal", "Rubber Duck", 
           "Extraction Tracker", "Valuable Tracker"]
};

// Helper function to group item data
function groupItemData(data) {
  const groups = {};
  
  // Initialize all categories
  Object.entries(ITEM_CATEGORIES).forEach(([category, items]) => {
    groups[category] = {};
    items.forEach(itemName => {
      const fullItemName = `Item ${itemName}`;
      groups[category][itemName] = {
        count: {},
        statBattery: {},
        purchased: data.itemsPurchased?.[fullItemName] || 0,
        purchasedTotal: data.itemsPurchasedTotal?.[fullItemName] || 0,
        upgrades: {}
      };
    });
  });

  // Fill in the data
  Object.entries(data).forEach(([key, value]) => {
    if (!key.startsWith('item') && !key.startsWith('Item')) return;
    
    const originalKey = key.replace(/^item/, 'Item');
    const itemName = originalKey.replace(/^Item\s+/, '');
    
    // Find which category this item belongs to
    for (const [category, items] of Object.entries(ITEM_CATEGORIES)) {
      if (items.includes(itemName)) {
        if (!groups[category][itemName]) continue;

        if (key.startsWith('itemStatBattery')) {
          groups[category][itemName].statBattery = value;
        } else if (key.startsWith('itemsPurchased')) {
          groups[category][itemName].purchased = value;
        } else if (key.startsWith('itemsPurchasedTotal')) {
          groups[category][itemName].purchasedTotal = value;
        } else if (key.startsWith('itemUpgrades')) {
          groups[category][itemName].upgrades = value;
        } else if (key.startsWith('item') && !key.includes('Upgrade')) {
          groups[category][itemName].count = value;
        }
        break;
      }
    }
  });

  return groups;
}

// Item Card Component
function ItemCard({ itemName, data, onUpdate }) {
  return (
    <div className="item-card">
      <div className="item-header">
        <h3 className="item-name">{formatKeyName(itemName)}</h3>
      </div>
      <div className="item-stats">
        <div className="item-section">
          <EditableField
            key="purchased"
            label="Items Purchased"
            value={data.purchased}
            path={['value', 'itemsPurchased', `Item ${itemName}`]}
            onUpdate={onUpdate}
          />
          <EditableField
            key="purchasedTotal"
            label="Total Purchased"
            value={data.purchasedTotal}
            path={['value', 'itemsPurchasedTotal', `Item ${itemName}`]}
            onUpdate={onUpdate}
          />
          {Object.entries(data.count).map(([id, count]) => (
            <EditableField
              key={`count-${id}`}
              label={`Count`}
              value={count}
              path={['value', `item${itemName}`, id]}
              onUpdate={onUpdate}
            />
          ))}
          {Object.entries(data.statBattery).map(([id, battery]) => (
            <EditableField
              key={`battery-${id}`}
              label={`Battery`}
              value={battery}
              path={['value', `itemStatBattery`, `Item ${itemName}`]}
              onUpdate={onUpdate}
            />
          ))}
        </div>
        {Object.keys(data.upgrades).length > 0 && (
          <div className="item-section">
            <h4 className="item-section-title">Upgrades</h4>
            {Object.entries(data.upgrades).map(([id, level]) => (
              <EditableField
                key={`upgrade-${id}`}
                label={`Upgrade ${id}`}
                value={level}
                path={['value', `itemUpgrade${itemName}`, id]}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [saveData, setSaveData] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('advanced');
  const [jsonError, setJsonError] = useState('');
  const [editedJsonString, setEditedJsonString] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const jsonEditorRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (isDropdownOpen && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Function to highlight JSON syntax
  const highlightJson = (text) => {
    if (!text) return text;
    return text.replace(
      /"([^"]+)":|"([^"]+)"|(-?\d+\.?\d*)|(\btrue\b|\bfalse\b|\bnull\b)/g,
      (match, key, string, number, keyword) => {
        if (key) return `<span class="json-key">"${key}":</span>`;
        if (string) return `<span class="json-string">"${string}"</span>`;
        if (number) return `<span class="json-number">${number}</span>`;
        if (keyword) return `<span class="json-boolean">${keyword}</span>`;
        return match;
      }
    );
  };

  // Function to handle search
  const handleSearch = useCallback((direction = 'next') => {
    if (!searchQuery || !jsonEditorRef.current) return;

    // Get CodeMirror instance
    const editor = jsonEditorRef.current.editor;
    if (!editor) return;

    // Create a CodeMirror search cursor
    const cursor = editor.getSearchCursor(new RegExp(searchQuery, 'gi'));
    
    // Find all matches
    const matches = [];
    while (cursor.findNext()) {
      matches.push(cursor.pos);
    }
    
    if (matches.length === 0) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    setSearchResults(matches);
    
    let newIndex;
    if (direction === 'next') {
      newIndex = currentSearchIndex + 1 >= matches.length ? 0 : currentSearchIndex + 1;
    } else {
      newIndex = currentSearchIndex - 1 < 0 ? matches.length - 1 : currentSearchIndex - 1;
    }
    
    setCurrentSearchIndex(newIndex);
    
    // Scroll to match and select it
    const match = matches[newIndex];
    editor.setSelection(match.from, match.to);
    editor.scrollIntoView({ from: match.from, to: match.to }, 20);
  }, [searchQuery, currentSearchIndex]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('json-search');
        if (searchInput) searchInput.focus();
      }
      if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
        e.preventDefault();
        handleSearch('next');
      }
      if (e.key === 'F3' && e.shiftKey) {
        e.preventDefault();
        handleSearch('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, currentSearchIndex, searchResults, handleSearch]); // Include handleSearch in dependencies

  // Update Textarea when saveData changes from other tabs
  useEffect(() => {
    if (saveData && !saveData.error) {
      const newJsonString = JSON.stringify(saveData, null, 2);
      // Avoid unnecessary updates if the string hasn't changed
      if (newJsonString !== editedJsonString) {
          setEditedJsonString(newJsonString);
          // Clear JSON error only if the update comes from valid non-JSON edits
          if (jsonError && activeTab !== 'advanced') { 
             setJsonError('');
          }
      }
    } else if (saveData && saveData.error) {
      setEditedJsonString(saveData.raw || ''); // Show raw data on initial load error
      setJsonError(saveData.error);
    }
    // Avoid including editedJsonString in dependencies to prevent loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveData, activeTab]); // Re-run if activeTab changes too

  const handleFileOpen = async () => {
    try {
      const result = await OpenSaveFile();
      if (result) {
        try {
          const parsedData = JSON.parse(result);
          setSaveData(parsedData);
          setActiveTab('world');
          setJsonError(''); // Clear error on successful load
          setEditedJsonString(JSON.stringify(parsedData, null, 2)); // Initialize textarea
        } catch (parseError) {
          console.error("Failed to parse JSON:", parseError);
          const errorMsg = `Failed to parse save file JSON: ${parseError.message}`;
          setSaveData({ error: errorMsg, raw: result });
          setActiveTab('advanced');
          setJsonError(errorMsg);
          setEditedJsonString(result); // Show raw invalid data in textarea
        }
      }
      setIsDropdownOpen(false);
    } catch (error) {
      console.error('Error opening save file:', error);
      setJsonError(`Error opening file: ${error.message}`);
      setActiveTab('advanced');
    }
  };

  // Update State Handler (using useCallback for performance)
  const handleUpdateData = useCallback((path, newValue) => {
    setSaveData(prevData => {
      // Ignore updates if data hasn't loaded or there was a parse error initially
      if (!prevData || prevData.error) return prevData;

      try {
        // Deep copy using structuredClone for better performance and reliability
        const newData = structuredClone(prevData);

        let current = newData;
        for (let i = 0; i < path.length - 1; i++) {
          const segment = path[i];
          if (current[segment] === undefined || current[segment] === null) {
            console.error("Invalid path for update:", path, `Segment '${segment}' not found.`);
            return prevData; // Path doesn't exist
          }
          current = current[segment];
        }

        const finalKey = path[path.length - 1];
        if (current[finalKey] !== newValue) {
          current[finalKey] = newValue;
          return newData; // Return the updated object
        }

        return prevData; // No actual change needed
      } catch (cloneError) {
         console.error("Error cloning state for update:", cloneError);
         return prevData;
      }
    });
  }, []); // No dependencies, safe to memoize

  // Handler for JSON Textarea Changes
  const handleJsonChange = (e) => {
    const newJsonString = e.target.value;
    setEditedJsonString(newJsonString); // Update local state immediately

    try {
      const parsedJson = JSON.parse(newJsonString);
      // Update main state only if parsed object is different
      if (JSON.stringify(parsedJson) !== JSON.stringify(saveData)) {
        setSaveData(parsedJson);
      }
      setJsonError(''); // Clear error on valid JSON
    } catch (error) {
      setJsonError(`Invalid JSON: ${error.message}`);
      // Don't update saveData if JSON is invalid
    }
  };

  const handleTitlebarDoubleClick = () => {
    try {
      WindowToggleMaximise();
    } catch (error) {
      console.error('Error toggling window state:', error);
    }
  };

  const handleMaximizeToggle = () => {
    try {
      WindowToggleMaximise();
    } catch (error) {
      console.error('Error toggling maximize:', error);
    }
  };

  const renderAdvancedTab = () => {
    if (saveData?.error && !editedJsonString) {
      setEditedJsonString(saveData.raw || '');
    }

    const handleEditorChange = (value) => {
      setEditedJsonString(value);
      try {
        const parsedJson = JSON.parse(value);
        if (JSON.stringify(parsedJson) !== JSON.stringify(saveData)) {
          setSaveData(parsedJson);
        }
        setJsonError('');
      } catch (error) {
        setJsonError(`Invalid JSON: ${error.message}`);
      }
    };

    const handleEditorDidMount = (editor, monaco) => {
      // Set up Ctrl+F to use Monaco's built-in search
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
        editor.getAction('actions.find').run();
      });
    };

    return (
      <div className="tab-content advanced-tab">
        <h2>Save Data (Raw JSON)</h2>
        {jsonError && <p className="error-message json-error">{jsonError}</p>}
        <div className="editor-container">
          <Editor
            height="100%"
            defaultLanguage="json"
            theme="vs-dark"
            value={editedJsonString}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              formatOnPaste: true,
              formatOnType: true,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              wrappingIndent: "same",
              automaticLayout: true,
              tabSize: 2,
              scrollbar: {
                vertical: 'visible',
                horizontal: 'visible',
                useShadows: true,
                verticalHasArrows: false,
                horizontalHasArrows: false,
              }
            }}
          />
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    if (!saveData) {
      return (
        <div className="no-data">
          <p>No save file loaded. Click "File {'>'} Open Save" to begin.</p>
        </div>
      );
    }
    
    // Handle potential parse error state
    if (saveData.error) {
       return (
         <div className="tab-content">
           <h2>Error Loading Save</h2>
           <p className="error-message">{saveData.error}</p>
           <h3>Raw Data:</h3>
           <pre>{saveData.raw}</pre>
         </div>
       );
    }
    
    // Assuming the main data is nested under 'value' based on the .NET structure
    const data = saveData.value || {};

    switch (activeTab) {
      case 'world':
        const runStatsPath = ['value', 'runStats'];
        return (
          <div className="tab-content scrollable">
            <h2>World Settings</h2>
            <div className="data-section">
               <h3 className="data-section-title">Run Stats</h3>
               {data.runStats && typeof data.runStats === 'object' ? (
                 Object.entries(data.runStats).map(([key, value]) => (
                   <EditableField
                     key={key}
                     label={formatKeyName(key)}
                     value={value}
                     path={[...runStatsPath, key]}
                     onUpdate={handleUpdateData}
                   />
                 ))
               ) : (
                 <p>No run stats available.</p>
               )}
             </div>
          </div>
        );
      case 'player': {
        // Get all player IDs from playerHealth
        const playerIds = data.playerHealth ? Object.keys(data.playerHealth) : [];

        return (
          <div className="tab-content">
            <h2>Player Settings</h2>
            <div className="players-grid">
              {playerIds.map(playerId => {
                const playerStats = Object.entries(data)
                  .filter(([key, value]) => 
                    typeof value === 'object' && 
                    value !== null && 
                    value[playerId] !== undefined
                  )
                  .reduce((acc, [key, value]) => {
                    acc[key] = value[playerId];
                    return acc;
                  }, {});

                return (
                  <PlayerCard
                    key={playerId}
                    steamId={playerId}
                    playerData={playerStats}
                    onUpdate={handleUpdateData}
                  />
                );
              })}
            </div>
          </div>
        );
      }
      case 'items': {
        const itemGroups = groupItemData(data);

        return (
          <div className="tab-content scrollable">
            <h2>Items</h2>
            {Object.entries(itemGroups).map(([category, items]) => (
              <div key={category} className="item-category">
                <h3 className="category-title">{category}</h3>
                <div className="items-grid">
                  {Object.entries(items).map(([itemName, itemData]) => (
                    <ItemCard
                      key={itemName}
                      itemName={itemName}
                      data={itemData}
                      onUpdate={handleUpdateData}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }
      case 'advanced':
        return renderAdvancedTab();
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <div className="titlebar" data-wails-drag>
        <div className="titlebar-menu">
          <div className="dropdown" ref={dropdownRef}>
            <button 
              className="dropdown-button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              File
            </button>
            {isDropdownOpen && (
              <div className="dropdown-content">
                <button onClick={handleFileOpen}>Open Save</button>
                {/* Disable save buttons if initial load had error OR json textarea has error */}
                <button disabled={!saveData || saveData.error || !!jsonError}>Save</button>
                <button disabled={!saveData || saveData.error || !!jsonError}>Save As...</button>
              </div>
            )}
          </div>
        </div>
        {/* <div className="titlebar-title" onDoubleClick={handleTitlebarDoubleClick}>R.E.P.O Save Editor</div> */}
        {/* <div className="titlebar-controls">
          <button className="control-button" onClick={() => WindowMinimise()}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="5" width="8" height="2" fill="currentColor" />
            </svg>
          </button>
          <button className="control-button" onClick={handleMaximizeToggle}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button className="control-button close" onClick={() => Quit()}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div> */}
      </div>
      <main>
        <div className="tab-bar">
          {/* Disable tabs if initial load failed */}
          <button className={`tab-button ${activeTab === 'world' ? 'active' : ''}`} onClick={() => setActiveTab('world')} disabled={!saveData || saveData.error}>World</button>
          <button className={`tab-button ${activeTab === 'player' ? 'active' : ''}`} onClick={() => setActiveTab('player')} disabled={!saveData || saveData.error}>Player</button>
          <button className={`tab-button ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')} disabled={!saveData || saveData.error}>Items</button>
          {/* Allow switching to Advanced tab even on error */}
          <button className={`tab-button ${activeTab === 'advanced' ? 'active' : ''}`} onClick={() => setActiveTab('advanced')} disabled={!saveData}>Advanced</button>
        </div>
        <div className="content-area">
          {renderTabContent()}
        </div>
      </main>
    </div>
  );
}

export default App; 
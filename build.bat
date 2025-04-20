@echo off
echo Preparing to build R.E.P.O Save Editor...

echo Copying icon files...
copy /Y icon.ico build\windows\icon.ico
if not exist build\appicon.png copy /Y icon.ico build\appicon.png

echo Running wails build...
wails build

echo Build completed!
pause 
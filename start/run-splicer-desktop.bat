@echo off
REM run-splicer-desktop.bat - Launch the Electron desktop wrapper for the splicer panel.
REM   First run installs deps via `npm install`; subsequent runs go straight to electron.
cd /d "%~dp0..\hub-bus-panel-desktop"
if not exist "node_modules\electron" (
  echo [run-splicer-desktop] node_modules missing - running npm install (one-time)...
  call npm install
)
call npm start
echo.
pause

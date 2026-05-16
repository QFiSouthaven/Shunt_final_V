@echo off
REM ===================================================================
REM open-app.bat
REM
REM ONE-CLICK LAUNCHER for the Aether Shunt app.
REM Starts the SPA dev server in a new window, waits for it to be ready,
REM then opens your browser to it.
REM
REM Double-click this file. The app opens in your browser. That is all.
REM ===================================================================

echo Starting the Aether Shunt app...
echo.

REM Start the SPA dev server in a new window so it keeps running.
REM Use the parent directory of this script as the project root.
start "Aether Shunt SPA" cmd /k "cd /d %~dp0.. && npm run dev"

echo Waiting 8 seconds for the app to start up...
timeout /t 8 /nobreak >nul

echo Opening the app in your browser...
start "" "http://127.0.0.1:3000"

echo.
echo Done. If the page says "site can't be reached", give it another
echo 10 seconds and refresh - npm sometimes takes longer on first boot.
echo.
echo To stop the app: close the "Aether Shunt SPA" window.
echo.
timeout /t 4 /nobreak >nul

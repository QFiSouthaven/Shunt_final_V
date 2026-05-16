@echo off
REM ===================================================================
REM start-everything.bat
REM Launches NEXUS-PRIME, then the bus, then opens the chatroom panel.
REM Best for fresh-boot.
REM ===================================================================
echo Step 1/3: Starting NEXUS-PRIME...
start "" "%~dp0start-nexus-prime.bat"
timeout /t 5 /nobreak >nul

echo Step 2/3: Starting the file-bus orchestrator...
start "" "%~dp0start-bus.bat"
timeout /t 8 /nobreak >nul

echo Step 3/3: Opening the chatroom panel...
start "" "%~dp0open-chatroom.bat"

echo.
echo All three launchers fired. Check each new window for status.
timeout /t 3 /nobreak >nul

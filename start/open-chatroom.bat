@echo off
REM open-chatroom.bat - Opens the live panel chatroom at http://localhost:7777 in default browser.
echo Opening chatroom at http://localhost:7777 ...
start "" "http://localhost:7777"
timeout /t 2 /nobreak >nul

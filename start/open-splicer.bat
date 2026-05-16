@echo off
REM open-splicer.bat - Opens the splicer panel (hub-bus-panel/splicer.html) in default browser.
echo Opening splicer panel...
start "" "%~dp0..\hub-bus-panel\splicer.html"
timeout /t 2 /nobreak >nul

@echo off
REM refresh-conversation-history.bat - Re-runs the conversation-history organizer.
cd /d "%~dp0..\"
call npm run history
echo.
pause

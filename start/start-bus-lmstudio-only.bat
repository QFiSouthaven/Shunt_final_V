@echo off
REM start-bus-lmstudio-only.bat - Starts only the LM Studio bridge (lightweight, no Gemini).
cd /d "%~dp0..\"
call npm run bus:start:lmstudio-only

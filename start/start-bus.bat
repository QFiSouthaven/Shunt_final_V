@echo off
REM start-bus.bat - Starts the full file-bus orchestrator (all bridges + retry daemon + panel server).
cd /d "%~dp0..\"
call npm run bus:start

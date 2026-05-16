@echo off
REM start-bus-with-adam.bat - Starts the bus orchestrator with the @adam (NEXUS-PRIME) bridge enabled.
cd /d "%~dp0..\"
node hub-bus-tools/orchestrator.mjs --enable=adam-bridge

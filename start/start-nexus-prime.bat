@echo off
REM start-nexus-prime.bat - Launches NEXUS-PRIME backend + frontend via its own start.bat.
set "NEXUS_START=C:\Users\Falki\websiteAgents\websiteAgents\start.bat"
if exist "%NEXUS_START%" (
    echo Launching NEXUS-PRIME from %NEXUS_START%
    start "" "%NEXUS_START%"
) else (
    echo NEXUS-PRIME not found at expected path; please verify
    echo Expected: %NEXUS_START%
    pause
)

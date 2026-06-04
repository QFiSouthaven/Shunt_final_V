@echo off
REM ====================================================================
REM start.bat - One double-click starts the ENTIRE Aether stack:
REM
REM   1. LM Studio server   (:1234) - local AI models
REM   2. NEXUS-PRIME        (:8000) - Journal / Goals / A2A / Evolution tabs
REM   3. Hub bus            (:7777/:7779/:7780) - bridges + aggregator (Pattern Z)
REM   4. SPA dev server     (:3000) - the Aether Shunt app itself
REM   5. Your browser, pointed at the app
REM
REM Safe to run twice: anything already running is detected and skipped.
REM To stop everything: close the spawned windows (or Ctrl+C in them).
REM ====================================================================

setlocal EnableExtensions
title Aether - Full Stack Launcher
cd /d "%~dp0"

echo.
echo  ==============================================
echo   Aether - starting the full stack
echo  ==============================================
echo.

REM --- Pre-flight: node_modules --------------------------------------
if not exist "node_modules\.bin\vite.cmd" (
    echo  [pre-flight] node_modules missing. Running 'npm install' first...
    call npm install
    if errorlevel 1 (
        echo  [pre-flight] npm install failed. Fix the error above and re-run.
        pause
        exit /b 1
    )
)

REM --- 1) LM Studio server (:1234) ------------------------------------
netstat -an | findstr /C:":1234 " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (
    echo  [1/5] LM Studio server already up on :1234 - skipping.
) else (
    where lms >nul 2>&1
    if %errorlevel%==0 (
        echo  [1/5] Starting LM Studio server via 'lms server start'...
        call lms server start >nul 2>&1
    ) else (
        echo  [1/5] LM Studio is NOT running and the 'lms' CLI was not found.
        echo        Opening the LM Studio app - load a model and enable the
        echo        local server, then the @lmstudio peer will come online.
        start "" "LM Studio://" 2>nul || start "" "%LOCALAPPDATA%\LM-Studio\LM Studio.exe" 2>nul
        echo        ^(Claude/Gemini bridges work without it - this only affects
        echo         the local-model peer and the SPA's default AI endpoint.^)
    )
)

REM --- 2) NEXUS-PRIME backend (:8000) ----------------------------------
netstat -an | findstr /C:":8000 " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (
    echo  [2/5] NEXUS-PRIME already up on :8000 - skipping.
) else (
    set "NEXUS_START=C:\Users\Falki\websiteAgents\websiteAgents\start.bat"
    if exist "C:\Users\Falki\websiteAgents\websiteAgents\start.bat" (
        echo  [2/5] Launching NEXUS-PRIME...
        start "Aether - NEXUS-PRIME" "C:\Users\Falki\websiteAgents\websiteAgents\start.bat"
    ) else (
        echo  [2/5] NEXUS-PRIME not found at C:\Users\Falki\websiteAgents\websiteAgents\start.bat
        echo        Journal / Goals / A2A / Evolution tabs will show offline.
    )
)

REM --- 3) Hub bus (orchestrator + bridges + aggregator) ----------------
netstat -an | findstr /C:":7779 " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (
    echo  [3/5] Hub bus already up on :7779 - skipping.
) else (
    echo  [3/5] Spawning hub-bus orchestrator window...
    start "Aether - Hub Bus" cmd /k "cd /d %~dp0 && npm run bus:start"
)

REM --- 4) SPA dev server (:3000) ----------------------------------------
netstat -an | findstr /C:":3000 " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (
    echo  [4/5] SPA already up on :3000 - skipping.
) else (
    echo  [4/5] Spawning SPA dev server window...
    start "Aether - SPA" cmd /k "cd /d %~dp0 && npm run dev"
)

REM --- 5) Open the app ---------------------------------------------------
echo  [5/5] Waiting ~12s for services to come up...
timeout /t 12 /nobreak >nul
start "" "http://127.0.0.1:3000"

echo.
echo  Done. The stack:
echo    LM Studio    http://localhost:1234   (local models)
echo    NEXUS-PRIME  http://localhost:8000   (agent backend)
echo    Bus panel    http://127.0.0.1:7777   (chatroom / transcript)
echo    Orchestrator http://127.0.0.1:7779   (bridge supervision)
echo    Aggregator   http://127.0.0.1:7780   (Pattern Z fan-out)
echo    Aether Shunt http://127.0.0.1:3000   (the app - opened in browser)
echo.
echo  Pattern Z: flip it ON in Settings -^> Pattern Z to get multi-AI answers.
echo  If a tab says offline, give it 10 more seconds and refresh.
echo.
timeout /t 6 /nobreak >nul
endlocal

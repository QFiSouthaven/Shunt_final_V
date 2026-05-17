@echo off
REM ====================================================================
REM Aether.bat — One-click launcher for the full Aether Shunt stack.
REM
REM Double-click this file. It:
REM   1. Opens a window for the hub-bus orchestrator (npm run bus:start)
REM   2. Opens a window for the SPA dev server      (npm run dev)
REM   3. Waits for both to be ready
REM   4. Opens your browser to the SPA
REM
REM Close either spawned window to stop that part. Run again to restart.
REM
REM Optional real .exe: feed this file to https://bat-to-exe.com or the
REM `b2e` tool — purely cosmetic, same behavior.
REM ====================================================================

setlocal EnableExtensions
title Aether Shunt — Launcher

cd /d "%~dp0"

echo.
echo  ============================================
echo   Aether Shunt — starting full stack
echo  ============================================
echo.

REM --- Sanity: node_modules present? ---------------------------------
if not exist "node_modules\.bin\vite.cmd" (
    echo  [pre-flight] node_modules looks missing. Running 'npm install' first...
    call npm install
    if errorlevel 1 (
        echo.
        echo  [pre-flight] npm install failed. Fix the error above and re-run.
        pause
        exit /b 1
    )
)

REM --- 1) Bus orchestrator -------------------------------------------
echo  [1/3] Spawning hub-bus orchestrator window...
start "Aether — Hub Bus" cmd /k "cd /d %~dp0 && npm run bus:start"

REM --- 2) SPA dev server ---------------------------------------------
echo  [2/3] Spawning SPA dev server window...
start "Aether — SPA" cmd /k "cd /d %~dp0 && npm run dev"

REM --- 3) Wait, then open browser ------------------------------------
echo  [3/3] Waiting ~10s for both to be ready...
timeout /t 10 /nobreak >nul

REM Vite defaults to :3000 but falls through to :3001 if 3000 is taken.
REM Open :3000 — if the user has a zombie node on :3000 the browser will
REM hit the wrong server, but that's the operator's signal to clean up.
start "" "http://127.0.0.1:3000"

echo.
echo  Done. Two new windows should be open:
echo    1. "Aether — Hub Bus"  — orchestrator + bridges
echo    2. "Aether — SPA"      — Vite dev server
echo.
echo  Browser tab opened to http://127.0.0.1:3000
echo.
echo  If the page says "site can't be reached", give it another 5-10s and refresh.
echo  If the SPA landed on :3001 instead, check the "Aether — SPA" window for the URL.
echo.
echo  To stop everything: close BOTH spawned windows. (Or run stop-bus.bat
echo  to stop only the bus, leaving the SPA running.)
echo.
timeout /t 4 /nobreak >nul
endlocal

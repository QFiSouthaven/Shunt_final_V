@echo off
REM Aether Shunt — one-click Worker deploy.
REM Double-click this file from File Explorer, or run from cmd/PowerShell.
REM Output saved to hub-cloudflare\last-deploy.log.

setlocal
set "WORKER_DIR=%~dp0hub-cloudflare"
set "LOG_FILE=%WORKER_DIR%\last-deploy.log"
set "URL_FILE=%WORKER_DIR%\deployed-url.txt"

echo [deploy] cd %WORKER_DIR%
cd /d "%WORKER_DIR%" || goto :error

echo [deploy] running: npx wrangler deploy
echo [deploy] (full output captured to %LOG_FILE%)
echo.

call npx wrangler deploy > "%LOG_FILE%" 2>&1
set "DEPLOY_RC=%ERRORLEVEL%"

REM Stream the captured log to this terminal so the user sees it now.
type "%LOG_FILE%"

if not "%DEPLOY_RC%"=="0" (
    echo.
    echo [deploy] FAILED with exit code %DEPLOY_RC%. See %LOG_FILE%.
    pause
    exit /b %DEPLOY_RC%
)

echo.
echo [deploy] OK. Extracting Worker URL...

REM Pull the workers.dev URL out of the log into a single-line file.
for /f "usebackq tokens=*" %%U in (`powershell -NoProfile -Command "Select-String -Path '%LOG_FILE%' -Pattern 'https://[A-Za-z0-9\-\._]+\.workers\.dev' -AllMatches | Select-Object -First 1 -ExpandProperty Matches | Select-Object -First 1 -ExpandProperty Value"`) do (
    > "%URL_FILE%" echo|set /p="%%U"
    echo [deploy] DEPLOYED: %%U
    echo [deploy] URL saved to %URL_FILE%
    goto :done
)

echo [deploy] No workers.dev URL detected in log. Check %LOG_FILE%.
:done
echo.
pause
exit /b 0

:error
echo [deploy] could not change to %WORKER_DIR%
pause
exit /b 1

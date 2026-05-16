@echo off
REM fix-ui-duplicate-route.bat - Removes the duplicate (authed)/page.tsx that
REM conflicts with app/page.tsx in UI/. A sub-agent created it in error and
REM no tool available to me at build time could delete it. One-time fix.
setlocal
set "TARGET=%~dp0..\UI\app\(authed)\page.tsx"
if not exist "%TARGET%" (
  echo [fix-ui-duplicate-route] Already gone — nothing to do.
  goto :done
)
echo [fix-ui-duplicate-route] Deleting "%TARGET%"...
del /f /q "%TARGET%"
if exist "%TARGET%" (
  echo [fix-ui-duplicate-route] FAILED to delete — try running this script as Administrator.
) else (
  echo [fix-ui-duplicate-route] Deleted. UI build should now succeed.
)
:done
echo.
pause

@echo off
REM run-bus-tests.bat - Runs every __test-*.mjs file under hub-bus-tools, hub-cloudflare, and hub-bus-panel.
setlocal enabledelayedexpansion
cd /d "%~dp0..\"
set PASS=0
set FAIL=0
echo === Running bus tests ===
echo.
for %%D in (hub-bus-tools hub-cloudflare hub-bus-panel) do (
    if exist "%%D" (
        for %%F in ("%%D\__test-*.mjs") do (
            echo --- %%F ---
            node "%%F"
            if errorlevel 1 (
                echo [FAIL] %%F
                set /a FAIL+=1
            ) else (
                echo [PASS] %%F
                set /a PASS+=1
            )
            echo.
        )
    )
)
echo === Summary: !PASS! passed, !FAIL! failed ===
endlocal
echo.
pause

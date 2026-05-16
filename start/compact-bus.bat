@echo off
REM compact-bus.bat - Dry-runs the bus compaction, then prompts to actually execute it.
cd /d "%~dp0..\"
echo --- Dry run (preview only) ---
call npm run bus:compact:dry
echo.
set /p CONFIRM="Run real compaction now? [y/n]: "
if /i "%CONFIRM%"=="y" (
    echo --- Executing compaction ---
    call npm run bus:compact
) else (
    echo Skipped real compaction.
)
echo.
pause

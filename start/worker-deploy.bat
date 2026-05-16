@echo off
REM worker-deploy.bat - Deploys the Cloudflare Worker (hub-relay) via wrangler.
cd /d "%~dp0..\hub-cloudflare"
call npx wrangler deploy
echo.
pause

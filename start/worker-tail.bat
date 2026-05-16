@echo off
REM worker-tail.bat - Streams live Cloudflare Worker logs via wrangler tail. Ctrl+C to stop.
cd /d "%~dp0..\hub-cloudflare"
call npx wrangler tail

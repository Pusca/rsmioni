@echo off
rem ─────────────────────────────────────────────────────────────────────
rem  RS Mioni — avvio ambiente demo locale (doppio click e sei pronto)
rem  Apre 3 finestre: server web, queue worker, receptionist AI.
rem  Per fermare tutto: chiudi le 3 finestre.
rem ─────────────────────────────────────────────────────────────────────
cd /d "%~dp0"

start "RS Mioni - Server (localhost:8000)" cmd /k php artisan serve --port=8000
start "RS Mioni - Queue worker"            cmd /k php artisan queue:work --tries=1 --timeout=0
start "RS Mioni - Receptionist AI"         cmd /k "cd ai-receptionist && .venv\Scripts\python.exe agent.py dev"

echo.
echo  Avviati: server, queue, receptionist AI (3 finestre).
echo  Apri il browser su http://localhost:8000
echo.
pause

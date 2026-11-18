@echo off
cd /d "%~dp0"
echo.
echo  Catalogo de ventas
echo  Abre en el navegador: http://localhost:8080
echo  Para detener el servidor pulsa Ctrl + C.
echo.
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8080'"
node servidor.js
pause

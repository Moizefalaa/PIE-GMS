@echo off
setlocal
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org
  pause
  exit /b 1
)
start "" /min "%NODE%" "%~dp0server.js"
timeout /t 2 >nul
start "" http://localhost:3000/host.html
echo Servidor iniciado. Cierra esta ventana para detenerlo.
echo Alumnos: abre http://<IP-de-este-PC>:3000/player.html
pause

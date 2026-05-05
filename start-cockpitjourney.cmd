@echo off
cd /d "%~dp0"

echo.
echo ============================================================
echo   CockpitJourney v1.0 - Atlas Studio
echo   Pilotez votre journee.
echo ============================================================
echo.

REM Free port 5400 if a previous instance is still holding it
powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 5400 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1

if not exist "node_modules" (
  echo [1/3] Installation des dependances ^(premiere execution^)...
  call npm install
  if errorlevel 1 goto :error
)

if not exist "dist\index.html" (
  echo [2/3] Compilation de l'application...
  call npm run build
  if errorlevel 1 goto :error
)

echo [3/3] Lancement du serveur local sur http://localhost:5400
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur.
echo.

call npm run start
goto :eof

:error
echo.
echo ERREUR : impossible de demarrer CockpitJourney.
pause
exit /b 1

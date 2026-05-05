@echo off
cd /d "%~dp0"
echo Recompilation de CockpitJourney...
call npm run build
if errorlevel 1 (
  echo Echec de la compilation.
  pause
  exit /b 1
)
echo Build OK. Lancez start-cockpitjourney.cmd pour demarrer.
pause

@echo off
REM Vide le cache Vite + libère le port 5400 + relance le dev server
cd /d "%~dp0"

echo [1/3] Liberation du port 5400 (si occupe)...
powershell.exe -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 5400 -ErrorAction SilentlyContinue; if ($c) { $c | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }" >nul 2>&1

echo [2/3] Vidage du cache Vite (node_modules/.vite)...
if exist "node_modules\.vite" (
  powershell.exe -NoProfile -Command "Remove-Item -Recurse -Force 'node_modules\.vite' -ErrorAction SilentlyContinue" >nul 2>&1
)

echo [3/3] Demarrage du dev server sur http://localhost:5400
echo.
echo Si le navigateur affiche encore une vieille version : Ctrl+Shift+R
echo.

call npm run dev

@echo off
REM Tue tout processus qui squatte le port 5400 (Vite dev server / preview)
powershell.exe -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 5400 -ErrorAction SilentlyContinue; if ($conn) { $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force; Write-Host \"Killed PID $_\" } } else { Write-Host 'Port 5400 already free' }"
pause

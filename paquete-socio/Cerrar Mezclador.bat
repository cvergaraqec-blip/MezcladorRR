@echo off
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*servidor.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Mezclador cerrado.
timeout /t 2 >nul

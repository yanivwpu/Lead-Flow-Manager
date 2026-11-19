@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-Probe.ps1"
echo.
echo You can close this window after copying the result or final error message.
pause

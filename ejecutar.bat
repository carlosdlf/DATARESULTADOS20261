@echo off
setlocal enabledelayedexpansion
echo ONPE Scraper
echo Presiona Ctrl+Break para detener
echo.

:loop
echo [%date% %time%] Ejecutando scraper...
node scraper.js
if errorlevel 1 (
    echo [%date% %time%] Error en scraper, reintentando en 1 min...
    timeout /t 60 /nobreak >nul
) else (
    echo [%date% %time%] Esperando 20 minutos...
    timeout /t 1200 /nobreak >nul
)
goto loop

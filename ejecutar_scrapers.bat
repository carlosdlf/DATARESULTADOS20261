@echo off
echo ========================================
echo ONPE - Ejecucioncada 20 minutos
echo ========================================

:loop
echo.
echo [%date% %time%] Ejecutando scrapers...
echo.

node scraper-global.js
node scraper-region-v2.js
node scraper-extranjero-v2.js

echo.
echo [%date% %time%] Subiendo a GitHub...
git add .
if errorlevel 1 (
    echo Error en 'git add'.
    goto wait_loop
)

git diff-index --quiet --cached HEAD --
if errorlevel 1 (
    echo Hay cambios para commitear.
    git commit -m "Actualizacion resultados %date% %time%"
    if errorlevel 1 (
        echo Error en 'git commit'.
        goto wait_loop
    )
    git push
    if errorlevel 1 (
        echo Error en 'git push'.
        goto wait_loop
    )
    echo Push a GitHub exitoso.
) else (
    echo No hay cambios para commitear.
)


:wait_loop
echo.
echo [%date% %time%] Esperando 20 minutos...
timeout /t 1200 /nobreak >nul

goto loop
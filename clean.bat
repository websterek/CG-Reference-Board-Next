@echo off
setlocal enabledelayedexpansion

REM GridBoard - full clean (Windows). Wipes local DB, uploaded assets,
REM build output, and node_modules. After this, run dev.bat to start fresh.

cd /d "%~dp0"

echo [clean] Removing local.db, local.db-shm, local.db-wal...
if exist "local.db"     del /F /Q "local.db"
if exist "local.db-shm" del /F /Q "local.db-shm"
if exist "local.db-wal" del /F /Q "local.db-wal"

echo [clean] Removing uploads/...
if exist "uploads" rmdir /S /Q "uploads"

echo [clean] Removing dist/ outputs...
if exist "packages\domain\dist" rmdir /S /Q "packages\domain\dist"
if exist "packages\server\dist" rmdir /S /Q "packages\server\dist"
if exist "packages\client\dist" rmdir /S /Q "packages\client\dist"

set /p KEEP_NM="[clean] Also remove node_modules? (y/N) "
if /I "%KEEP_NM%"=="y" (
    echo [clean] Removing node_modules...
    if exist "node_modules" rmdir /S /Q "node_modules"
    if exist "packages\domain\node_modules"  rmdir /S /Q "packages\domain\node_modules"
    if exist "packages\server\node_modules"  rmdir /S /Q "packages\server\node_modules"
    if exist "packages\client\node_modules"  rmdir /S /Q "packages\client\node_modules"
)

echo [clean] Done.
endlocal

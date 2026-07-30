@echo off
setlocal enabledelayedexpansion

REM GridBoard - reset the local SQLite database (Windows).
REM Deletes ./local.db* and re-runs migrations. Safe to run any time.

cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
    echo [reset-db] ERROR: pnpm is not on PATH. Install it with: npm i -g pnpm
    exit /b 1
)

REM Load .env so any custom DATABASE_URL / JWT_SECRET are honored.
if exist ".env" (
    for /f "usebackq tokens=*" %%i in (`node "%~dp0scripts\load-env.mjs" "%~dp0.env" cmd`) do %%i
)

echo [reset-db] Removing local.db, local.db-shm, local.db-wal...
if exist "local.db"     del /F /Q "local.db"
if exist "local.db-shm" del /F /Q "local.db-shm"
if exist "local.db-wal" del /F /Q "local.db-wal"

echo [reset-db] Re-running migrations...
REM Drizzle-kit needs `file:` URL form; we restore the server-expected
REM `sqlite:` form once migrations finish so it doesn't leak into the shell.
set "OPSX_DIALECT=sqlite"
set "DATABASE_URL=file:%~dp0local.db"
pushd "packages\server"
call "node_modules\.bin\drizzle-kit.CMD" migrate --config "drizzle.config.ts"
set "DRIZZLE_EXIT=!ERRORLEVEL!"
popd
set "DATABASE_URL=sqlite:%~dp0local.db"
if not "!DRIZZLE_EXIT!"=="0" (
    echo [reset-db] ERROR: migrations failed.
    exit /b 1
)

echo [reset-db] Done. Database reset complete.
endlocal

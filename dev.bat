@echo off
setlocal enabledelayedexpansion

REM GridBoard - local development launcher (Windows / cmd.exe)
REM Boots server (http://localhost:3000) and client (http://localhost:5173)
REM using the zero-infra SQLite + LocalStorage path. Requires Node 20+ and pnpm.

cd /d "%~dp0"

REM 1. Verify tooling
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [dev] ERROR: pnpm is not on PATH. Install it with: npm i -g pnpm
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [dev] ERROR: node is not on PATH. Install Node 20 or newer.
    exit /b 1
)

REM 2. Install workspace deps on first run
if not exist "node_modules" (
    echo [dev] Installing workspace dependencies (first run, this may take a minute^)...
    call pnpm install
    if errorlevel 1 (
        echo [dev] ERROR: pnpm install failed.
        exit /b 1
    )
)

REM 3. Create .env from .env.example if missing
if not exist ".env" (
    if exist ".env.example" (
        echo [dev] Creating .env from .env.example
        copy /Y ".env.example" ".env" >nul
    ) else (
        echo [dev] WARNING: .env.example not found; using server defaults.
    )
)

REM 3b. Load .env into this shell. The server itself does not auto-load .env,
REM     and several env vars (JWT_SECRET, DATABASE_URL) are required for boot.
for /f "usebackq tokens=*" %%i in (`node "%~dp0scripts\load-env.mjs" "%~dp0.env" cmd`) do %%i

REM 4. Ensure the SQLite DB is initialized (no-op if it already exists).
REM    We call the pnpm-generated `drizzle-kit.CMD` shim directly because:
REM      (a) pnpm on this host does not translate POSIX-style `KEY=val`
REM          prefixes in scripts, and
REM      (b) `pnpm --filter X exec drizzle-kit` does not resolve the binary.
REM
REM    The shim is the same one `pnpm run` would invoke and points at the
REM    correct bin.cjs. Drizzle-kit needs the `file:` URL form because its
REM    better-sqlite3 path strips the `file:` prefix; the server itself
REM    expects the `sqlite:` form, so we restore DATABASE_URL afterwards.
if not exist "local.db" (
    echo [dev] First boot: running database migrations...
    set "OPSX_DIALECT=sqlite"
    set "DATABASE_URL=file:%~dp0local.db"
    pushd "packages\server"
    call "node_modules\.bin\drizzle-kit.CMD" migrate --config "drizzle.config.ts"
    set "DRIZZLE_EXIT=!ERRORLEVEL!"
    popd
    set "DATABASE_URL=sqlite:%~dp0local.db"
    if not "!DRIZZLE_EXIT!"=="0" (
        echo [dev] ERROR: migrations failed.
        exit /b 1
    )
)

echo.
echo [dev] Starting GridBoard...
echo [dev]   Server: http://localhost:3000
echo [dev]   Client: http://localhost:5173
echo [dev]   Press Ctrl+C to stop.
echo.

call pnpm dev
endlocal

## MODIFIED Requirements

### Requirement: Development workflow
The system SHALL support development without Docker for faster iteration. The dev loop runs entirely on the host with SQLite + LocalStorage; no background services required.

#### Scenario: pnpm dev starts all packages
- **WHEN** user runs "pnpm dev" from the project root
- **THEN** the server starts on port 3000 with hot reload (tsx watch)
- **THEN** the server uses a SQLite database at `./local.db` (no Postgres needed)
- **THEN** the client starts on port 5173 with Vite dev server and HMR
- **THEN** no Docker daemon is required

#### Scenario: Development without MinIO and without Postgres
- **WHEN** running in development mode without Docker
- **THEN** the server uses a SQLite-backed Drizzle dialect
- **THEN** the server uses a local filesystem StorageProvider instead of MinIO
- **THEN** uploaded images are stored in a local `./uploads` directory
- **THEN** the Yjs Hocuspocus extension round-trips through SQLite

#### Scenario: Switching to Postgres for staging
- **WHEN** the developer wants Postgres parity without Docker
- **THEN** they run `docker compose -f docker-compose.dev.yml up -d` to start a real Postgres
- **THEN** setting `DATABASE_URL=postgres://gridboard:gridboard@localhost:5432/gridboard` switches the driver
- **THEN** migrations apply cleanly to the Postgres database
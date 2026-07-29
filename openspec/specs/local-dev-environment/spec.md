# local-dev-environment Specification

## Purpose
TBD - created by archiving change local-dev-and-dockerize. Update Purpose after archive.
## Requirements
### Requirement: Zero-infra local dev loop
The system SHALL run end-to-end on a developer machine without requiring Docker, Postgres, MinIO, or any background service. The default `pnpm dev` script SHALL start the server with a SQLite-backed database and the existing LocalStorage asset provider.

#### Scenario: Fresh clone + pnpm dev
- **WHEN** a developer clones the repo, runs `pnpm install`, then `pnpm dev`
- **THEN** the server boots without external services
- **THEN** the server's `/health` endpoint returns 200 within 5 seconds
- **THEN** the Vite dev server starts on port 5173

#### Scenario: Create a board against SQLite
- **WHEN** the developer navigates to `http://localhost:5173`
- **WHEN** they click "New Board"
- **THEN** the server inserts a board row into a SQLite file at `./local.db`
- **THEN** the response includes a `{id, token}` payload
- **THEN** the browser navigates to `/board/:id`

#### Scenario: Round-trip a Yjs document through SQLite
- **WHEN** the developer edits a board in the browser
- **WHEN** they refresh the page
- **THEN** the Yjs document is reloaded from SQLite
- **THEN** the rectangles reappear at their last persisted positions

#### Scenario: Reset the local database
- **WHEN** the developer wants a clean slate
- **THEN** deleting `./local.db` and restarting the server re-creates the schema via migrations
- **THEN** no manual `psql` or `docker` step is required

### Requirement: Driver-agnostic data layer
The server package SHALL select between the SQLite dialect and the Postgres dialect at boot time based on the `DATABASE_URL` scheme. The selection SHALL be transparent to the rest of the application code.

#### Scenario: SQLite dialect for `sqlite:` URLs
- **WHEN** `DATABASE_URL` starts with `sqlite:`
- **THEN** the server uses `better-sqlite3` + `drizzle-orm/better-sqlite3`
- **THEN** the migration runner picks the SQLite migrations folder

#### Scenario: Postgres dialect for `postgres://` URLs
- **WHEN** `DATABASE_URL` starts with `postgres://`
- **THEN** the server uses `pg` + `drizzle-orm/node-postgres`
- **THEN** the migration runner picks the Postgres migrations folder
- **THEN** this is the production default (unchanged from first-milestone)

#### Scenario: Same migration set applied to both
- **WHEN** a developer adds a new table or column
- **THEN** they write the migration once
- **THEN** a Vitest integration test boots both dialects and applies the migration
- **THEN** any dialect-specific failure (e.g. unsupported column type) fails the test

### Requirement: LocalStorage remains the default asset backend
The system SHALL keep `LocalStorage` as the default asset provider for local development. The `STORAGE_BACKEND` env var remains the switch; default `local` for dev, `minio` for prod.

#### Scenario: No MinIO required for dev
- **WHEN** `STORAGE_BACKEND` is unset (or `local`)
- **THEN** the server uses `./uploads` on the local filesystem
- **THEN** uploaded assets persist across server restarts
- **THEN** no MinIO connection is attempted


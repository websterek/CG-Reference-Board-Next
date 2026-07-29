# GridBoard

A self-hosted, free Miro-style collaborative reference board.
The editor is custom-built (PixiJS) with an infinite, snap-friendly grid.
Multi-user collaboration runs over Yjs + Hocuspocus, persistence lives in
Postgres (production) or SQLite (local dev), and assets are served by an
S3-compatible store with a LocalStorage fallback for zero-infra development.

## Quick start (zero infra)

```bash
pnpm install
pnpm dev
```

This boots:
- the server on `http://localhost:3000` against a SQLite file (`./local.db`)
- the client (Vite) on `http://localhost:5173`

No Docker, no Postgres, no MinIO required. Uploaded images go to
`./uploads` (the LocalStorage backend is the default).

Reset the local database at any time:

```bash
pnpm db:reset      # deletes ./local.db and re-runs migrations
```

## Docker path (production stack)

```bash
docker compose up --build
```

Brings up Postgres + MinIO + the server (with a `migrate` sidecar) + the
client. Both the server and the client have multi-stage Dockerfiles and run
as non-root.

## End-to-end tests

```bash
docker compose up -d
pnpm e2e
```

The Playwright suite (`e2e/*.spec.ts`) covers multi-browser sync, concurrent
drag convergence, viewer-token rejection, 1000-rectangle pan/zoom, and the
image upload path. The Playwright `globalSetup` will boot the compose stack
on demand if Docker is available; otherwise it expects the stack to already
be reachable on `http://localhost:3000`.

## Driver switch: SQLite vs Postgres

The server selects its database driver from the `DATABASE_URL` scheme at
boot time:

| `DATABASE_URL`                    | Driver                                     |
|-----------------------------------|--------------------------------------------|
| `sqlite:./local.db`               | SQLite (`better-sqlite3`)                  |
| `sqlite::memory:`                 | SQLite in-memory (test only)               |
| `postgres://user:pw@host:5432/db` | Postgres (`pg`) — production default       |

The Drizzle schema is split into per-dialect files (`src/db/schema.pg.ts`,
`src/db/schema.sqlite.ts`) and re-exported by `src/db/schema.ts` based on the
detected driver. The Hocuspocus extension talks to a small `YjsByteStore`
interface (`PgYjsByteStore` or `SqliteYjsByteStore`) so the collab path is
driver-agnostic.

For the production stack, set:

```env
DATABASE_URL=postgres://gridboard:gridboard@postgres:5432/gridboard
STORAGE_BACKEND=minio
```

For local dev, omit the env file — the server defaults to SQLite + Local.

## Local data: where things live

| Path                                | What                                       |
|-------------------------------------|--------------------------------------------|
| `./local.db` (and `-wal`, `-shm`)   | SQLite database file (boards, yjs, assets metadata) |
| `./uploads/`                        | LocalStorage-backed uploaded assets        |
| `node_modules/`                     | Dependencies (excluded via `.dockerignore`) |
| `dist/`                             | TypeScript build output                    |

Wipe everything for a fresh slate:

```bash
rm -rf local.db local.db-shm local.db-wal uploads/
pnpm db:reset
```

## Project structure

```
packages/
  domain/   Shared types (board, layer, item, JWT payload)
  server/   Fastify + Drizzle + Hocuspocus
  client/   Vite + React + PixiJS

e2e/        Playwright multi-user scenarios

openspec/   Active and archived changes (specs, design, tasks)
```

## More docs

- `AGENTS.md` — agent operating rules and architectural constraints
- `openspec/changes/local-dev-and-dockerize/` — the change that introduced
  the SQLite path and the compose smoke test
- `openspec/changes/archive/2026-07-28-first-milestone-vertical-slice/` —
  the first vertical slice that shipped (D1–D10, 129 tasks)
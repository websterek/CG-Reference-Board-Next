## ADDED Requirements

### Requirement: Production Docker image builds and boots
The system SHALL build a production Docker image of the server package and verify it boots the Fastify process inside the container. The build is reproducible from a clean checkout on any machine with Docker installed.

#### Scenario: docker build succeeds
- **WHEN** a developer runs `docker build -f packages/server/Dockerfile .`
- **THEN** the multi-stage build completes
- **THEN** the runtime image is non-root
- **THEN** the image size is reasonable (target: <500MB)

#### Scenario: Container /health responds
- **WHEN** the container is started with `docker run --rm ...`
- **WHEN** the developer curls `http://localhost:3000/health`
- **THEN** the response is HTTP 200 with `{ok: true}`
- **THEN** the server log shows no fatal errors

### Requirement: docker compose stack boots end-to-end
The system SHALL bring the full stack (Postgres + MinIO + server + client) online via `docker compose up --build`. The server's migrate sidecar SHALL complete before the app service starts (D10).

#### Scenario: All four services come up healthy
- **WHEN** the developer runs `docker compose up --build`
- **THEN** the `postgres` healthcheck passes within 30 seconds
- **THEN** the `migrate` sidecar exits 0 (DB migrations applied)
- **THEN** the `server` healthcheck at `/health` passes
- **THEN** the `client` healthcheck (port 8080) responds

#### Scenario: Stopping and restarting preserves data
- **WHEN** the developer runs `docker compose down`
- **WHEN** the developer runs `docker compose up` (no rebuild)
- **THEN** existing boards, assets, and Yjs documents are restored
- **THEN** the `postgres_data` and `minio_data` volumes persist across restarts

### Requirement: Playwright e2e suite runs against the compose stack
The system SHALL execute the Playwright e2e specs (`e2e/*.spec.ts`) against the running compose stack and report pass/fail per scenario.

#### Scenario: Two-browser sync verifies
- **WHEN** the e2e suite runs `two-browser-sync.spec.ts`
- **THEN** both browser contexts open the same board
- **THEN** user A creates a rectangle
- **THEN** user B's view reflects the new rectangle within 5 seconds

#### Scenario: Concurrent drag converges (D1 nested-pos fix)
- **WHEN** the e2e suite runs `two-browser-concurrent-drag.spec.ts`
- **THEN** both users drag the same rectangle simultaneously
- **THEN** the final position on both clients is identical
- **THEN** the position is "all A" or "all B" — never torn (one axis from each)

#### Scenario: Viewer rejection (D9 readOnly enforcement)
- **WHEN** the e2e suite runs `viewer-token.spec.ts`
- **THEN** a viewer-issued token connects with `readOnly: true`
- **THEN** any mutation attempt is rejected by Hocuspocus before it reaches the document
- **THEN** the client reverts to the server's authoritative state

#### Scenario: 1000-rectangle board pan/zoom (8A spatial index acceptance)
- **WHEN** the e2e suite runs `1000-rect-fps.spec.ts`
- **THEN** the board is seeded with 1000 rectangles
- **THEN** panning for 2 seconds keeps frame interval below 33ms (the relaxed target for CI)
- **THEN** no console errors appear during the pan

#### Scenario: Image upload end-to-end
- **WHEN** the e2e suite runs `image-upload.spec.ts`
- **THEN** a PNG is uploaded to `/api/boards/:id/assets`
- **THEN** the asset is fetchable via `GET /api/assets/:key` (server-mediated, JWT-required)
- **THEN** the response body matches the uploaded bytes
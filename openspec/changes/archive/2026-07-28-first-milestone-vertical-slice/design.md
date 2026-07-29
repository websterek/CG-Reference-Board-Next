## Context

GridBoard is a greenfield self-hosted collaborative reference board. The first milestone delivers a vertical slice through the full stack: a custom PixiJS grid canvas with rectangle items, real-time collaboration via Yjs/Hocuspocus, board persistence to PostgreSQL, local image upload to MinIO, and Docker Compose deployment. The architecture council (6 models) validated the key design decisions documented here.

## Goals / Non-Goals

**Goals:**
- Working `docker compose up --build` that starts all services
- Create and open a board via the web UI
- Add, move, snap to grid, and delete rectangle items on a PixiJS canvas
- Save board state and reload it after page refresh
- Synchronize board state between two browser tabs in real time
- Upload a local image and place it on the board
- All data survives container restart (persistent volumes)
- Architecture supports future item types (image, text, PDF, video, audio) without core rewrites

**Non-Goals:**
- User accounts and login system (board-level tokens only)
- PDF rendering, video downloading, or audio playback
- Comments, sticky notes, or text items
- Advanced tools (pen, arrow, connector, shape library)
- Undo/redo history
- Board sharing UI or permission management UI
- Production hardening (rate limiting, monitoring, backup strategy)

## Decisions

### D1: Domain Model — Hybrid with Yjs Adapter

**Decision:** Domain model is pure TypeScript (types, Zod schemas, pure functions) with zero Yjs imports. The Yjs document *schema* (the names and structure of Y.Map/Y.Array fields used to represent the board) lives in `packages/domain/src/collab-schema.ts` as a documented contract importable by both client and server. A `YjsBoardAdapter` (implementation) lives in `packages/client/src/collab/` and is the only file in the workspace that imports the Yjs runtime. PixiJS renders from domain snapshots, never from Yjs types directly.

**Rationale:** Keeps domain logic testable without Yjs setup. Allows swapping the sync mechanism later. Avoids re-implementing CRDT merge logic (Option A) and avoids coupling business logic to Yjs's mutable, untyped API (Option B). Putting the schema contract in `domain` (not in the adapter) lets the server's Hocuspocus hooks reference the same structure that the adapter writes, preventing silent drift between client and server.

**Position model (torn-position fix):** Each item's position is stored as a nested `Y.Map<{x, y}>` — `item.attrs.pos: Y.Map<{x: number, y: number}>`. This makes the whole position one LWW unit on conflict rather than independent per-field LWW, which would otherwise produce torn positions (e.g., `x` from user A, `y` from user B) when two users drag the same rectangle simultaneously. Per-field LWW on individual scalar fields (e.g., `width`, `rotation`) is still correct; only the *position vector* is bundled.

**Alternatives considered:**
- *Option A (domain is truth, Yjs is transport)*: Requires maintaining two parallel object graphs and a diff engine. Rejected as over-engineered for the first milestone.
- *Option B (Yjs types ARE domain)*: Couples domain logic to Yjs API. Makes unit testing harder. Rejected by 5/6 councillors.
- *Per-field LWW for position*: Torn-position bug under simultaneous drag. Rejected; nested `pos` Y.Map is a low-cost fix.

### D2: Item Type Registry — Static Typed Map

**Decision:** Define an `ItemDefinition` interface (schema, bounds, hitTest, render, initialState) and export a `const ITEM_TYPES` map. Domain registry (what an item is) and render registry (how to draw it) are separate — render registry lives in the client package.

**Rationale:** One type (rectangle) for v1. A static const map is type-safe, trivially extensible, and avoids plugin infrastructure overhead. The interface is the contract; dynamic registration can be added later if needed.

### D3: Grid Snapping — Continuous Local Snap, Yjs Commit on Drop

**Decision:** Snap the pointer position continuously during drag for immediate visual feedback. Only commit the final snapped position to Yjs on mouseup. The grid service is a pure function: `snapPoint(point, config) → Point`. The drag-queue (`queueUpdate`) is owned by the *Tool*, not the adapter — the adapter is a stateless translator between Y.Doc and domain snapshots.

**`queueUpdate` semantics:** Last-write-wins single-slot buffer. The pointermove stream never enters Yjs. On `pointerup`, the Tool writes a single Yjs transaction containing the final snapped position (one `item.attrs.pos` write per affected item). This makes each drag exactly one undo step in a future `Y.UndoManager` (deferred to a later milestone per the non-goal list).

**Known UX debt (documented, not fixed in v1):**
- Remote collaborators see the item *teleport* from start to end position on drop, not a smooth drag. Smooth presence requires throttled Yjs commits (~50ms) during drag, which is tracked for the production-hardening milestone.
- Undo granularity is "one step per drag" not "one step per grid cell." This is acceptable for v1's rectangle-only board.

**Rationale:** Continuous snap provides the tactile feel users expect from Miro-style tools. Deferring Yjs commit to drop avoids update storms on the collaboration channel during drag. Keeping the queue in the Tool (not the adapter) preserves D1's stateless translator contract.

### D4: Monorepo — pnpm Workspaces

**Decision:** Three packages: `packages/domain` (pure TS, zero framework deps), `packages/client` (React + Vite + PixiJS), `packages/server` (Fastify + Hocuspocus + Drizzle). Domain is a workspace dependency of both client and server.

**Rationale:** Workspaces enforce dependency direction at the package manager level. Domain cannot accidentally import React or Fastify. Server cannot import client. Each package has independent build/test configs.

### D5: React ↔ PixiJS Bridge — CanvasController via Ref

**Decision:** A `CanvasController` class owns the PixiJS Application, exposes imperative methods (`addItem`, `moveItem`, `removeItem`, `clear`), and emits events for React to consume. React passes a ref via a `<PixiCanvas>` component. Zustand is used exclusively for UI chrome state (active tool, panel visibility, selection summary for inspector).

**Rationale:** Canvas state must never live in React state — React re-renders are poison for 60 FPS canvas interaction. The controller pattern keeps imperative canvas code clean and React code minimal. Zustand for UI chrome is appropriate because tool state changes are infrequent and React-owned.

### D6: Docker Services — PostgreSQL, Fastify+Hocuspocus, MinIO, Client

**Decision:** Four services in Docker Compose. Hocuspocus is embedded in the Fastify process (same Node.js server, same port). Redis and BullMQ are deferred until background media processing is needed.

**Rationale:** Hocuspocus can run as middleware in the same process. A separate Hocuspocus container adds orchestration complexity for zero gain in the first milestone. MinIO is included because the vertical slice requires image upload and Docker Compose makes it trivial.

### D7: Image Storage — MinIO from Start

**Decision:** MinIO behind a `StorageProvider` interface. A local filesystem fallback is available for development without Docker.

**Interface (revised):**
```ts
interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  putStream(key: string, readable: Readable, contentType: string, size?: number): Promise<void>
  get(key: string): Promise<Buffer>
  getStream(key: string): Promise<Readable>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

`StorageProvider` is intentionally *not* the place where access URLs are issued. Asset URLs are a routing concern, not a storage concern — and they depend on the runtime topology (MinIO presigned URLs vs server proxy vs nginx reverse-proxy). Asset access goes through `GET /api/assets/:key` with JWT validation, server-mediated by an `AssetUrlService` in the server package. The MinIO implementation may issue presigned URLs internally for upstream fetches but the *public* contract is the server proxy. This satisfies `AGENTS.md:46` ("Enforce authorization on every... asset request") regardless of backend.

The `putStream` variant exists so that future background jobs (yt-dlp piping a 200 MB video) don't have to buffer through memory.

**Rationale:** MinIO is in the locked stack. Docker Compose makes it a one-line service definition. The `StorageProvider` interface means switching storage backends is one implementation change. Starting with local FS would require a migration path later.

### D8: Board URL — POST /api/boards → /board/:id

**Decision:** `POST /api/boards` creates a board and returns `{ id }`. Client navigates to `/board/:id`. Hocuspocus document name is `board:${id}`, passed as a query parameter in the WebSocket handshake.

**Rationale:** Simple, direct, no slug complexity for v1. The Hocuspocus document name is the board ID — no separate "room ID" concept.

### D9: Hocuspocus Auth — JWT from Fastify

**Decision:** Fastify issues a board-scoped JWT on board creation/access. Hocuspocus validates the JWT in its `onAuthenticate` hook. For the first milestone, the JWT contains `{ boardId, role }` claims without a full user system.

**Token issuance paths (revised):**
- `POST /api/boards` — creates a board, inserts a single `board_members` row with `role: 'owner'`, returns `{ id, token }` (owner token).
- `POST /api/boards/:id/join` — checks `board_members` for the requesting identity, returns a `{ token }` (role looked up from the table, not signed into the request). This is the path that scales to real users — replacing "look up the only row" with "look up the row for this user" is a contained change in one place.

**`readOnly` enforcement:** The Hocuspocus `readOnly: true` flag returned from `onAuthenticate` is the correct hook for viewer enforcement. The `onChange` hook may be used to log rejected mutations but should not duplicate the enforcement. This is verified by a spike (task 6.0) before locking in D9.

**`board_members` table (revised):** Even with no user system, a `(board_id, role)` table exists from day one. The owner row is inserted on board creation; future user migration adds `(user_id, ...)` and replaces the "look up only row" query with "look up by user_id."

**Rationale:** JWT is stateless, includes permissions in claims, and scales to user accounts later. A simple shared token would work but JWT is not significantly more complex and avoids a migration. The two-path issuance model means the auth model is *exercised* in v1, not just wired.

### D10: Yjs Persistence — Hocuspocus PG Extension + Drizzle Metadata

**Decision:** Use `@hocuspocus/extension-database` with a PostgreSQL adapter to store binary Yjs documents. Maintain separate Drizzle-managed tables for board metadata (title, owner, permissions, timestamps) and per-board `board_members` rows for durable grants.

**Yjs document schema (defined in `packages/domain/src/collab-schema.ts`):**
```ts
// Top-level Y.Doc shape for a board document named "board:{id}"
{
  items:   Y.Map<itemId, Y.Map>            // per-item fields; pos is nested Y.Map<{x,y}>
  layers:  Y.Array<Y.Map>                  // ordered layer descriptors
  meta:    Y.Map<string, unknown>          // board-level metadata (name, createdAt mirror, etc.)
}
```

Server Hocuspocus hooks reference the same schema module for `onChange` permission checks (e.g., rejecting viewer mutations). The schema is the contract; the adapter (`client/src/collab/YjsBoardAdapter`) is the only place that imports the Yjs runtime.

**Rationale:** The Hocuspocus extension is production-ready and avoids custom binary storage logic. Separate metadata tables keep application data queryable without parsing Yjs binary blobs. Binary BYTEA storage follows AGENTS.md: "Persist the Yjs document in its binary format; JSON snapshots are exports/read models." A 30-minute spike (task 6.0) verifies the extension's BYTEA round-trip before locking in this decision.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DOCKER COMPOSE                               │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │  PostgreSQL   │    │   App Server     │    │     MinIO        │   │
│  │  (port 5432)  │    │  (port 3000)     │    │   (port 9000)    │   │
│  │              │    │                  │    │                  │   │
│  │  boards      │    │  Fastify HTTP    │    │  /assets/        │   │
│  │  yjs_docs    │◄───│  Hocuspocus WS   │◄───│  (S3-compat)     │   │
│  │  assets      │    │  BullMQ (future) │    │                  │   │
│  └──────────────┘    └────────┬─────────┘    └──────────────────┘   │
│                              │                                      │
│                              │ HTTP/WS                              │
│                              ▼                                      │
│                    ┌──────────────────┐                              │
│                    │  Client (nginx)  │                              │
│                    │  (port 5173 dev) │                              │
│                    │  (port 80 prod)  │                              │
│                    └──────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT ARCHITECTURE                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  React Shell (Zustand for UI chrome)                        │   │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐   │   │
│  │  │Toolbar  │ │ Layers   │ │ Inspector│ │ BoardPage      │   │   │
│  │  │(tool)   │ │ Panel    │ │ Panel    │ │ (creates ctrl) │   │   │
│  │  └─────────┘ └──────────┘ └──────────┘ └───────┬────────┘   │   │
│  └──────────────────────────────────────────────────┼───────────┘   │
│                                                      │               │
│  ┌──────────────────────────────────────────────────┼───────────┐   │
│  │  CanvasController (ref)                          │           │   │
│  │  ┌──────────────┐  ┌──────────────────┐         │           │   │
│  │  │ PixiJS App   │  │ YjsBoardAdapter  │◄────────┘           │   │
│  │  │ (scene graph)│  │ (Y.Doc ↔ domain) │                    │   │
│  │  └──────────────┘  └────────┬─────────┘                    │   │
│  └─────────────────────────────┼──────────────────────────────┘   │
│                                │                                   │
│                    ┌───────────┴───────────┐                        │
│                    │  HocuspocusProvider   │                        │
│                    │  (WebSocket)          │                        │
│                    └───────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    PACKAGE STRUCTURE                                 │
│                                                                     │
│  packages/                                                          │
│  ├── domain/        # Pure TS. No React, PixiJS, Yjs, Fastify.     │
│  │   ├── src/                                                        │
│  │   │   ├── board.ts          # Board, BoardItem, Layer types      │
│  │   │   ├── grid.ts           # GridConfig, snapPoint, snapRect    │
│  │   │   ├── items/            # ItemTypeDefinition, registry       │
│  │   │   │   └── rectangle.ts  # RectangleItem schema, bounds, hit  │
│  │   │   ├── camera.ts         # CameraState, viewport calculations │
│  │   │   └── index.ts          # Barrel exports                     │
│  │   ├── package.json          # name: @gridboard/domain            │
│  │   └── tsconfig.json                                              │
│  │                                                                   │
│  ├── client/        # React + Vite + PixiJS + Yjs                   │
│  │   ├── src/                                                        │
│  │   │   ├── main.tsx           # React entry                       │
│  │   │   ├── app/               # React shell, routing, pages       │
│  │   │   ├── canvas/            # CanvasController, PixiJS setup    │
│  │   │   │   ├── controller.ts  # CanvasController class            │
│  │   │   │   ├── renderers/     # Per-item-type PixiJS renderers    │
│  │   │   │   └── tools/         # SelectTool, CreateRectTool, etc.  │
│  │   │   ├── collab/            # YjsBoardAdapter, HocuspocusProv.  │
│  │   │   └── ui/                # React components (Toolbar, etc.)  │
│  │   ├── index.html                                                  │
│  │   ├── vite.config.ts                                              │
│  │   └── package.json          # name: @gridboard/client             │
│  │                                                                   │
│  └── server/        # Fastify + Hocuspocus + Drizzle                │
│      ├── src/                                                        │
│      │   ├── index.ts           # Server entry, Fastify setup       │
│      │   ├── api/               # REST routes                       │
│      │   │   ├── boards.ts      # Board CRUD                        │
│      │   │   └── assets.ts      # Image upload/serve                │
│      │   ├── collab/            # Hocuspocus server config          │
│      │   ├── db/                # Drizzle schema, migrations        │
│      │   │   ├── schema.ts      # boards, yjs_documents, assets     │
│      │   │   └── index.ts       # DB client setup                   │
│      │   └── storage/           # StorageProvider + MinIO impl      │
│      ├── Dockerfile                                                   │
│      └── package.json          # name: @gridboard/server             │
│                                                                       │
│  docker-compose.yml                                                   │
│  pnpm-workspace.yaml                                                  │
│  package.json                  # Root workspace                      │
│  tsconfig.base.json                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Local Action (e.g., drag rectangle)
```
Pointer move → PixiJS event → Tool handler → snapPoint (domain pure fn)
  → CanvasController.updateItem(id, snappedPos)
  → PixiJS display object updated (immediate visual feedback)
  → YjsBoardAdapter.queueUpdate(id, { x, y })
  → [On pointer up] Yjs transaction commit → Hocuspocus sync
```

### Remote Action (e.g., other user moves rectangle)
```
Hocuspocus receives update → Yjs observe fires
  → YjsBoardAdapter reads Yjs state → domain snapshot
  → CanvasController.applyRemoteUpdate(snapshot)
  → PixiJS display objects updated
```

### Board Load
```
Navigate to /board/:id → React BoardPage mounts
  → CanvasController.mount(container) → PixiJS Application.init
  → HocuspocusProvider.connect(boardId, token)
  → onLoadDocument → PostgreSQL fetch Yjs binary → Y.applyUpdate
  → YjsBoardAdapter.toDomainSnapshot() → CanvasController.renderAll
```

### Image Upload
```
User drops file on canvas → POST /api/boards/:id/assets (multipart)
  → Fastify validates token → StorageProvider.put(key, data, mime)
  → MinIO stores file → DB insert asset record
  → Response: { assetId, url }
  → Client creates image item on board via Yjs
```

## Spatial Index & Culling

The `AGENTS.md:24` mandate ("RBush for spatial indexing, viewport culling, and fast hit-test candidates") is wired into the architecture from day one. Three layers compose the performance path:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RENDER LOOP (60 FPS target)                   │
│                                                                     │
│  Pointer event                                                      │
│    │                                                                │
│    ▼                                                                │
│  SpatialIndex.search(viewportBounds)  ── RBush range query          │
│    │                                  ── returns ~N visible items  │
│    ▼                                                                │
│  PixiJS render only visible items                                  │
│    │                                                                │
│    ▼                                                                │
│  CullerPlugin (PixiJS v8 native) ── per-frame draw-call culling    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**`SpatialIndex`** lives in `packages/domain/src/spatial.ts` as a pure-TS RBush wrapper. It is not Pixi-specific — it operates on board-coordinate bounding boxes. The `CanvasController` maintains the index on every `addItem` / `moveItem` / `removeItem` call.

**Hit-testing** uses `SpatialIndex.search(pointBounds)` to filter the candidate set, then the item type's precise `hitTest` runs only on those candidates. At 5000 items with ~50 visible, hit-test is O(50) instead of O(5000).

**Viewport culling** uses `SpatialIndex.search(viewportBounds)` on every camera change. Off-screen items' PixiJS display objects are either detached (`visible = false`) or removed from the render tree entirely. PixiJS v8's `CullerPlugin` (`extensions.add(CullerPlugin)`, `cullable = true` on the world container, `culler: { updateTransform: true }`) handles the per-frame draw-call culling on top of the domain-level viewport query.

**Acceptance criterion**: A test board with 1000 rectangles pan/zooms without dropping below 60 FPS in DevTools Performance recording (task 12.x). This is a hard acceptance criterion for the milestone — not a stretch goal.

**Why not deferred**: Retrofitting spatial indexing after the canvas architecture is set means rewriting `CanvasController.hitTest`, `CanvasController.renderViewport`, and every tool's hit-test call site. Doing it from day one is ~150 lines of domain code plus a PixiJS plugin extension; retrofitting later is a multi-day refactor across the canvas + tools surface.

## Risks / Trade-offs

- **[Risk] Yjs adapter becomes a god object** → Mitigation: Keep translation logic narrow. The adapter only maps between Yjs types and domain types. Business logic (snapping, hit testing, validation) lives in domain pure functions. The Yjs schema contract lives in `domain/src/collab-schema.ts` so server Hocuspocus hooks can reference the same structure without duplicating it in the adapter.
- **[Risk] Continuous snap during drag causes visual jitter on large grids** → Mitigation: Grid size is configurable. Users can disable snap. The snap function is a simple `Math.round` — negligible performance cost.
- **[Risk] Continuous snap + Yjs commit on drop creates a torn-position CRDT bug** → Mitigation: Position is stored as a nested `Y.Map<{x, y}>` so the whole position is one LWW unit on conflict, not per-field. Verified by Playwright two-browser concurrent drag test (task 12.x).
- **[Risk] Hocuspocus PostgreSQL extension maturity for binary Yjs storage** → Mitigation: 30-minute spike (task 6.0) before locking in the decision. Fallback: custom `yjs_documents` table with the same `@hocuspocus/extension-database` interface.
- **[Risk] PixiJS v8 API changes during development** → Mitigation: Pin the PixiJS minor version (`pixi.js@^8.x` with a floor). The CanvasController abstraction means PixiJS is replaceable behind the controller interface.
- **[Risk] Docker Compose with 4 services is heavy for development** → Mitigation: Provide `docker compose up` for full-stack testing, `docker compose -f docker-compose.dev.yml up` for dev mode with hot reload, and `pnpm dev` scripts for per-package development without Docker. The client container uses a single-stage `vite preview` for v1 (production nginx reverse-proxy deferred).
- **[Risk] No user accounts means no real auth** → Mitigation: Board-level tokens are explicitly scoped to the first milestone. The `board_members` table exists from day one (one owner row per board); the JWT issuance path goes through `POST /api/boards/:id/join` which looks up the row — replacing "look up only row" with "look up by user_id" is a contained change in one place when real users land.
- **[Risk] 60 FPS claim is unprovable without spatial indexing** → Mitigation: RBush integration is added to the canvas architecture from day one. The 1000–2000 item render + interaction test in section 12 is a hard acceptance criterion, not a stretch goal.
- **[Risk] Image item type reveals cross-package contract gaps in the registry** → Mitigation: Image item contract is exercised in v1 (crosses all three packages). If it surfaces a contract leak, it's fixed in v1, not v2.

## Resolved Decisions (formerly open questions)

- **Hocuspocus `onStoreDocument` flush interval**: Configurable via env (`HOCUSPOCUS_FLUSH_INTERVAL_MS`, default 2000). Resolution: one-line config in `server/src/collab/hocuspocus.ts`.
- **PixiJS v8 version pin**: `pixi.js@^8.6.0` (current stable minor at the time of proposal correction; task 8.1 verifies compatibility with Yjs/Hocuspocus at install time).
- **Client Dockerfile**: Single-stage `vite preview` for v1 Docker; production nginx reverse-proxy deferred to the production-hardening milestone. Vite dev server already proxies `/api` and `/collab` for local dev.

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

**Decision:** Domain model is pure TypeScript (types, Zod schemas, pure functions) with zero Yjs imports. A `YjsBoardAdapter` translates between domain snapshots and Yjs shared types. PixiJS renders from domain snapshots, never from Yjs types directly.

**Rationale:** Keeps domain logic testable without Yjs setup. Allows swapping the sync mechanism later. Avoids re-implementing CRDT merge logic (Option A) and avoids coupling business logic to Yjs's mutable, untyped API (Option B). The adapter is the only file that imports Yjs.

**Alternatives considered:**
- *Option A (domain is truth, Yjs is transport)*: Requires maintaining two parallel object graphs and a diff engine. Rejected as over-engineered for the first milestone.
- *Option B (Yjs types ARE domain)*: Couples domain logic to Yjs API. Makes unit testing harder. Rejected by 5/6 councillors.

### D2: Item Type Registry — Static Typed Map

**Decision:** Define an `ItemDefinition` interface (schema, bounds, hitTest, render, initialState) and export a `const ITEM_TYPES` map. Domain registry (what an item is) and render registry (how to draw it) are separate — render registry lives in the client package.

**Rationale:** One type (rectangle) for v1. A static const map is type-safe, trivially extensible, and avoids plugin infrastructure overhead. The interface is the contract; dynamic registration can be added later if needed.

### D3: Grid Snapping — Continuous Local Snap, Yjs Commit on Drop

**Decision:** Snap the pointer position continuously during drag for immediate visual feedback. Only commit the final snapped position to Yjs on mouseup. The grid service is a pure function: `snapPoint(point, config) → Point`.

**Rationale:** Continuous snap provides the tactile feel users expect from Miro-style tools. Deferring Yjs commit to drop avoids update storms on the collaboration channel during drag. Councillor beta's concern about jitter and bandwidth is addressed by this split.

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

**Rationale:** MinIO is in the locked stack. Docker Compose makes it a one-line service definition. The `StorageProvider` interface means switching storage backends is one implementation change. Starting with local FS would require a migration path later.

### D8: Board URL — POST /api/boards → /board/:id

**Decision:** `POST /api/boards` creates a board and returns `{ id }`. Client navigates to `/board/:id`. Hocuspocus document name is `board:${id}`, passed as a query parameter in the WebSocket handshake.

**Rationale:** Simple, direct, no slug complexity for v1. The Hocuspocus document name is the board ID — no separate "room ID" concept.

### D9: Hocuspocus Auth — JWT from Fastify

**Decision:** Fastify issues a board-scoped JWT on board creation/access. Hocuspocus validates the JWT in its `onAuthenticate` hook. For the first milestone, the JWT contains `{ boardId, role }` claims without a full user system.

**Rationale:** JWT is stateless, includes permissions in claims, and scales to user accounts later. A simple shared token would work but JWT is not significantly more complex and avoids a migration.

### D10: Yjs Persistence — Hocuspocus PG Extension + Drizzle Metadata

**Decision:** Use `@hocuspocus/extension-database` with a PostgreSQL adapter to store binary Yjs documents. Maintain separate Drizzle-managed tables for board metadata (title, owner, permissions, timestamps).

**Rationale:** The Hocuspocus extension is production-ready and avoids custom binary storage logic. Separate metadata tables keep application data queryable without parsing Yjs binary blobs. Binary BYTEA storage follows AGENTS.md: "Persist the Yjs document in its binary format; JSON snapshots are exports/read models."

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

## Risks / Trade-offs

- **[Risk] Yjs adapter becomes a god object** → Mitigation: Keep translation logic narrow. The adapter only maps between Yjs types and domain types. Business logic (snapping, hit testing, validation) lives in domain pure functions.
- **[Risk] Continuous snap during drag causes visual jitter on large grids** → Mitigation: Grid size is configurable. Users can disable snap. The snap function is a simple `Math.round` — negligible performance cost.
- **[Risk] Hocuspocus PostgreSQL extension maturity for binary Yjs storage** → Mitigation: Start with the extension. If issues arise, fall back to a custom `yjs_documents` table with the same `@hocuspocus/extension-database` interface.
- **[Risk] PixiJS v8 API changes during development** → Mitigation: Pin the PixiJS version. The CanvasController abstraction means PixiJS is replaceable behind the controller interface.
- **[Risk] Docker Compose with 4 services is heavy for development** → Mitigation: Provide `docker compose up` for full-stack testing and `pnpm dev` scripts for per-package development without Docker.
- **[Risk] No user accounts means no real auth** → Mitigation: Board-level tokens are explicitly scoped to the first milestone. The JWT architecture (issuer, verifier, claims) is designed to extend to user accounts.

## Open Questions

- Should the Hocuspocus `onStoreDocument` flush interval be configurable? Default is 2 seconds — may need tuning for the first milestone.
- What's the exact PixiJS v8 version to pin? Need to verify compatibility with the latest Yjs and Hocuspocus releases.
- Should the client Dockerfile use multi-stage build (Vite build → nginx) or serve via Vite dev server in development?

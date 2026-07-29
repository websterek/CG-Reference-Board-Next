## ADDED Requirements

### Requirement: Real-time board synchronization
The system SHALL synchronize board state between multiple connected clients in real time using Yjs and Hocuspocus.

#### Scenario: Two clients see same board state
- **WHEN** two browsers open the same board URL
- **WHEN** user A creates a rectangle
- **THEN** user B sees the rectangle appear within 500ms
- **WHEN** user A moves a rectangle
- **THEN** user B sees the rectangle move to the new position within 500ms
- **WHEN** user A deletes a rectangle
- **THEN** user B sees the rectangle disappear within 500ms

#### Scenario: Concurrent edits on different fields converge
- **WHEN** two users move the same rectangle simultaneously
- **THEN** both moves are applied (CRDT merge)
- **THEN** the final position is a single LWW unit — `x` and `y` come from the same winning write, not independently merged per field (the position is stored as a nested `Y.Map<{x, y}>` to guarantee this; see "Yjs document structure" below)
- **THEN** the final position is deterministic and consistent across clients
- **THEN** no data is lost

#### Scenario: Concurrent edits across layers converge
- **WHEN** user A reorders layers while user B adds an item to a layer
- **THEN** both changes are applied
- **THEN** the layer order is consistent across clients
- **THEN** the new item appears in the correct layer with correct z-order
- **THEN** no data is lost

### Requirement: Yjs document structure
The system SHALL model board items individually in Yjs shared types, not as one synchronized JSON blob, and SHALL use the explicit schema defined in `packages/domain/src/collab-schema.ts` (importable by both client adapter and server Hocuspocus hooks).

The top-level Y.Doc shape for a board document named `board:{id}` is:

```
{
  items:   Y.Map<itemId, Y.Map>      // per-item fields; pos is nested Y.Map<{x, y}>
  layers:  Y.Array<Y.Map>            // ordered layer descriptors (id, name, visible, locked)
  meta:    Y.Map<string, unknown>    // board-level metadata mirror (name, createdAt, etc.)
}
```

#### Scenario: Items are individually addressable
- **WHEN** a Yjs document is inspected
- **THEN** each board item has its own Y.Map entry keyed by stable item ID
- **THEN** item properties (width, height, rotation, type, attrs) are fields within the item's Y.Map

#### Scenario: Position is a nested sub-map (not per-field scalar)
- **WHEN** an item is inspected
- **THEN** the item's position is stored as `item.attrs.pos: Y.Map<{x, y}>`
- **THEN** writing the position writes the whole `{x, y}` pair in one Yjs transaction
- **THEN** concurrent moves of the same rectangle produce a whole-position LWW outcome, not a torn `(x from A, y from B)` position

#### Scenario: Item-level granularity
- **WHEN** one item is updated
- **THEN** only that item's Y.Map is modified
- **THEN** other items' Y.Maps are not affected

#### Scenario: Layers are an ordered array, not a map
- **WHEN** a Yjs document is inspected
- **THEN** layers are stored as a `Y.Array<Y.Map>` preserving render order
- **THEN** reordering layers is a Y.Array move operation, not a key sort
- **THEN** each layer descriptor has fields `{id, name, visible, locked}`

### Requirement: Hocuspocus server configuration
The system SHALL run a Hocuspocus server embedded in the Fastify process for WebSocket-based Yjs synchronization.

#### Scenario: Hocuspocus starts with Fastify
- **WHEN** the server starts
- **THEN** Hocuspocus is configured and listening on the /collab WebSocket path
- **THEN** the server accepts WebSocket connections on the same port as the HTTP API

#### Scenario: Client connects to Hocuspocus
- **WHEN** a client navigates to a board
- **THEN** it opens a WebSocket connection to the Hocuspocus server
- **THEN** the connection includes the board ID and auth token as query parameters
- **THEN** the Hocuspocus document name is set to "board:{boardId}"

### Requirement: Yjs document persistence
The system SHALL persist Yjs documents to PostgreSQL for durability across restarts.

#### Scenario: Document loaded from database
- **WHEN** a client connects to an existing board
- **THEN** Hocuspocus loads the Yjs binary document from PostgreSQL via `@hocuspocus/extension-database` (verified by the spike in task 6.0 before locking in this decision)
- **THEN** the client receives the full board state

#### Scenario: Document saved to database
- **WHEN** changes are made to a board
- **THEN** Hocuspocus persists the Yjs binary document to PostgreSQL
- **THEN** the save occurs within the configured flush interval (default 2000ms, configurable via `HOCUSPOCUS_FLUSH_INTERVAL_MS`)

#### Scenario: New board has empty document
- **WHEN** a client connects to a newly created board
- **THEN** Hocuspocus creates a new empty Yjs document
- **THEN** the client receives an empty board state

### Requirement: Awareness and presence
The system SHALL broadcast user presence information to connected clients.

#### Scenario: User presence visible
- **WHEN** a user connects to a board
- **THEN** other connected users see the new user's presence (cursor position, name)
- **WHEN** a user disconnects
- **THEN** their presence is removed from other clients within 2 seconds

#### Scenario: Cursor position shared
- **WHEN** a user moves their mouse on the canvas
- **THEN** other users see a cursor indicator at the corresponding position
- **THEN** cursor updates are throttled to ~50ms to avoid excessive network traffic

### Requirement: Reconnection handling
The system SHALL handle WebSocket disconnections and reconnections gracefully.

#### Scenario: Reconnect after temporary disconnect
- **WHEN** a client's WebSocket connection drops
- **WHEN** the client reconnects within a reasonable time
- **THEN** the client receives all changes made while disconnected
- **THEN** the board state is consistent with other clients

#### Scenario: No data loss on disconnect
- **WHEN** a client disconnects without saving
- **THEN** changes made before disconnect are preserved via the Hocuspocus persistence hook

### Requirement: Spatial index for performance
The system SHALL maintain a spatial index over board items for fast hit-testing and viewport culling, satisfying the `AGENTS.md:24` RBush mandate.

#### Scenario: Spatial index stays in sync with items
- **WHEN** an item is added, moved, or removed on the canvas
- **THEN** the spatial index is updated before the next pointer event
- **THEN** hit-test candidates are returned in O(log n) via the index, not O(n) via item iteration

#### Scenario: Viewport culling holds 60 FPS at 1000 items
- **WHEN** a board contains 1000 rectangles
- **WHEN** the user pans and zooms the viewport
- **THEN** the canvas maintains 60 FPS in DevTools Performance recording
- **THEN** off-screen items do not contribute to per-frame draw calls (verified by PixiJS `CullerPlugin` instrumentation)

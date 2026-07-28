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

#### Scenario: Concurrent edits converge
- **WHEN** two users move the same rectangle simultaneously
- **THEN** both moves are applied (CRDT merge)
- **THEN** the final position is deterministic and consistent across clients
- **THEN** no data is lost

### Requirement: Yjs document structure
The system SHALL model board items individually in Yjs shared types, not as one synchronized JSON blob.

#### Scenario: Items are individually addressable
- **WHEN** a Yjs document is inspected
- **THEN** each board item has its own Y.Map entry keyed by stable item ID
- **THEN** item properties (x, y, width, height, type, attrs) are fields within the item's Y.Map

#### Scenario: Item-level granularity
- **WHEN** one item is updated
- **THEN** only that item's Y.Map is modified
- **THEN** other items' Y.Maps are not affected

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
- **THEN** Hocuspocus loads the Yjs binary document from PostgreSQL
- **THEN** the client receives the full board state

#### Scenario: Document saved to database
- **WHEN** changes are made to a board
- **THEN** Hocuspocus persists the Yjs binary document to PostgreSQL
- **THEN** the save occurs within the configured flush interval (default 2 seconds)

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
- **THEN** cursor updates are throttled to avoid excessive network traffic

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

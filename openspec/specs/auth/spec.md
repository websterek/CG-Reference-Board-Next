# auth

## Purpose

Board-level access tokens for WebSocket connections and the HTTP API. Permission enforcement on every request and realtime connection. Today the user model is absent (board-level tokens only); the board_members table is in place from day one so swapping "look up the only row" for "look up by user_id" is a contained change when real accounts land.

---

<!-- Promoted from openspec/changes/first-milestone-vertical-slice/specs/auth/spec.md -->

### Requirement: Board-level access tokens
The system SHALL issue board-scoped JWT tokens for WebSocket authentication. Token issuance goes through one of two paths, both of which read the role from a durable `board_members` grant — never from the request itself.

#### Scenario: Owner token issued on board creation
- **WHEN** a board is created via POST /api/boards
- **THEN** the server inserts a `board_members` row with `(boardId, role: 'owner')`
- **THEN** the response includes a JWT token with `{boardId, role: 'owner'}` claims
- **THEN** the token is signed with the server's JWT_SECRET

#### Scenario: Join endpoint issues role-scoped token
- **WHEN** POST /api/boards/:id/join is called
- **THEN** the server looks up the caller's `board_members` row for that board
- **THEN** the response includes a JWT token whose `role` claim matches the row's role (`owner`, `editor`, or `viewer`)
- **THEN** if no row exists, the response is 403 Forbidden

#### Scenario: Token contains board ID and role
- **WHEN** a JWT is decoded
- **THEN** it contains a "boardId" claim matching the board's ID
- **THEN** it contains a "role" claim that matches the `board_members` row at issuance time

#### Scenario: Token has expiry
- **WHEN** a JWT is issued
- **THEN** it has an expiration claim (default 24 hours)
- **WHEN** an expired token is presented
- **THEN** the connection is rejected

### Requirement: board_members durable grants
The system SHALL persist durable grants in a `board_members` table from day one, even with no user system. This satisfies the `auth/SKILL.md:14-21` mandate ("Persist durable grants in PostgreSQL; do not infer durable access from Yjs presence, client UI state, or cached board documents").

#### Scenario: Schema is in place from board creation
- **WHEN** the server starts and migrations run
- **THEN** the `board_members` table exists with columns `(boardId, role: enum('owner','editor','viewer'), createdAt)`

#### Scenario: Owner row is inserted on creation
- **WHEN** POST /api/boards creates a new board
- **THEN** exactly one row is inserted into `board_members` with `role: 'owner'`
- **THEN** the row is inserted in the same transaction as the board row

#### Scenario: Migration to real users is a contained change
- **WHEN** real user accounts are added in a later milestone
- **THEN** adding a `userId` column to `board_members` is the only schema change required
- **THEN** the "look up only row" query in `POST /api/boards/:id/join` becomes "look up by userId"
- **THEN** the JWT issuance path, Hocuspocus hooks, and Fastify auth guards are unchanged

### Requirement: WebSocket authentication
The system SHALL authenticate WebSocket connections to Hocuspocus using JWT tokens. Viewer enforcement uses the Hocuspocus `readOnly` flag returned from `onAuthenticate` — the correct hook per Hocuspocus semantics.

#### Scenario: Valid editor token allows connection
- **WHEN** a client connects to Hocuspocus with a valid JWT
- **WHEN** the JWT's boardId matches the requested board
- **WHEN** the JWT's role is "owner" or "editor"
- **THEN** the connection is accepted with `readOnly: false`
- **THEN** the user context includes the boardId and role

#### Scenario: Valid viewer token allows read-only connection
- **WHEN** a client connects to Hocuspocus with a valid JWT
- **WHEN** the JWT's boardId matches the requested board
- **WHEN** the JWT's role is "viewer"
- **THEN** the connection is accepted with `readOnly: true`
- **THEN** Hocuspocus rejects any mutation the viewer attempts to send (the client receives an error and reverts to server state)

#### Scenario: Invalid token rejects connection
- **WHEN** a client connects to Hocuspocus without a token
- **THEN** the connection is rejected with an authentication error
- **WHEN** a client connects with a tampered token
- **THEN** the connection is rejected with an authentication error

#### Scenario: Token for wrong board rejects connection
- **WHEN** a client connects to Hocuspocus with a valid JWT
- **WHEN** the JWT's boardId does not match the requested board
- **THEN** the connection is rejected with a forbidden error

### Requirement: API authentication
The system SHALL authenticate HTTP API requests using JWT tokens.

#### Scenario: Authenticated API request
- **WHEN** a client sends an API request with a valid JWT in the Authorization header
- **THEN** the request is processed normally

#### Scenario: Unauthenticated API request
- **WHEN** a client sends an API request without a JWT
- **THEN** the request is rejected with a 401 Unauthorized response

### Requirement: Permission enforcement on mutations
The system SHALL enforce board permissions on realtime mutations.

#### Scenario: Editor can modify board
- **WHEN** a client with role "editor" sends a mutation
- **THEN** the mutation is applied and synced to other clients

#### Scenario: Viewer cannot modify board
- **WHEN** a client with role "viewer" sends a mutation
- **THEN** the mutation is rejected
- **THEN** the client receives an error
- **THEN** the board state remains unchanged for all clients

### Requirement: Token verification in Hocuspocus hooks
The system SHALL verify JWT tokens in Hocuspocus's onAuthenticate hook. The `readOnly` flag returned from `onAuthenticate` is the correct hook for viewer enforcement; `onChange` may log rejected mutations but must not duplicate the enforcement.

#### Scenario: onAuthenticate verifies token and returns readOnly
- **WHEN** a WebSocket connection is established
- **THEN** Hocuspocus's onAuthenticate hook extracts the token from query parameters
- **THEN** the token is verified using the JWT_SECRET
- **THEN** the boardId claim is validated against the requested document name
- **THEN** the hook returns `{readOnly: true}` if the JWT's role is "viewer" and `{readOnly: false}` otherwise
- **THEN** Hocuspocus rejects any mutation from a readOnly connection (the client receives an error)

#### Scenario: onConnect attaches user context
- **WHEN** authentication succeeds
- **THEN** Hocuspocus's onConnect hook attaches the user context (boardId, role) to the connection's `context` object
- **THEN** the role is available for audit logging in onChange and onStoreDocument hooks

#### Scenario: readOnly enforcement is verified end-to-end
- **WHEN** a viewer-issued token is used to open a board
- **WHEN** the viewer attempts to move a rectangle (via any client action that would normally emit a Yjs update)
- **THEN** Hocuspocus rejects the mutation before it reaches the document
- **THEN** the client receives an error and reverts to the server's authoritative state
- **THEN** the board state remains unchanged for all clients (verified by task 12.15 Playwright test)

## ADDED Requirements

### Requirement: Board-level access tokens
The system SHALL issue board-scoped JWT tokens for WebSocket authentication.

#### Scenario: Token issued on board creation
- **WHEN** a board is created via POST /api/boards
- **THEN** the response includes a JWT token with boardId and role claims
- **THEN** the token is signed with the server's JWT_SECRET

#### Scenario: Token contains board ID and role
- **WHEN** a JWT is decoded
- **THEN** it contains a "boardId" claim matching the board's ID
- **THEN** it contains a "role" claim (e.g., "editor" for the board creator)

#### Scenario: Token has expiry
- **WHEN** a JWT is issued
- **THEN** it has an expiration claim (default 24 hours)
- **WHEN** an expired token is presented
- **THEN** the connection is rejected

### Requirement: WebSocket authentication
The system SHALL authenticate WebSocket connections to Hocuspocus using JWT tokens.

#### Scenario: Valid token allows connection
- **WHEN** a client connects to Hocuspocus with a valid JWT
- **WHEN** the JWT's boardId matches the requested board
- **THEN** the connection is accepted
- **THEN** the user context includes the boardId and role

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
The system SHALL verify JWT tokens in Hocuspocus's onAuthenticate hook.

#### Scenario: onAuthenticate verifies token
- **WHEN** a WebSocket connection is established
- **THEN** Hocuspocus's onAuthenticate hook extracts the token from query parameters
- **THEN** the token is verified using the JWT_SECRET
- **THEN** the boardId claim is validated against the requested document name

#### Scenario: onConnect enforces permissions
- **WHEN** authentication succeeds
- **THEN** Hocuspocus's onConnect hook attaches the user context (boardId, role)
- **THEN** the role is available for permission checks in onChange and onStoreDocument hooks

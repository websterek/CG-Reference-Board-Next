## Why

GridBoard needs a working vertical slice to validate the architecture before building more complex features. Currently there is zero code — no project structure, no Docker setup, no board canvas, no collaboration, no persistence. The first milestone proves the full stack works end-to-end: a user can create a board, add and manipulate rectangles, see changes sync between browsers, upload an image, and have everything survive a container restart.

## What Changes

- Scaffold pnpm workspace monorepo with three packages: `domain`, `client`, `server`
- Implement a custom PixiJS grid canvas with pan, zoom, and grid snapping
- Add rectangle item creation, selection, move, and delete
- Set up Yjs + Hocuspocus for real-time board state synchronization
- Create Fastify HTTP API for board CRUD and asset upload
- Configure PostgreSQL with Drizzle ORM for board metadata and Yjs document persistence
- Set up MinIO for S3-compatible image storage behind a `StorageProvider` interface
- Build Docker Compose with PostgreSQL, MinIO, and the app server
- Implement board-level auth tokens for WebSocket connections
- Define extension points for future item types (image, text, PDF, video, audio)

## Capabilities

### New Capabilities
- `board-core`: Board creation, opening, and the custom grid canvas with pan/zoom/snap. Rectangle items with selection, move, and delete. Grid service, item type registry, and layer model.
- `collab`: Real-time collaboration via Yjs and Hocuspocus. Two-browser sync of board state, awareness/presence, and Yjs document persistence to PostgreSQL.
- `media-import`: Local image upload, storage in MinIO, and placement on the board as an image item. Processing status tracking.
- `auth`: Board-level access tokens for WebSocket authentication. Permission enforcement on API requests and realtime connections.
- `deployment`: Docker Compose configuration with PostgreSQL, MinIO, and the app server. Persistent volumes for data survival across restarts.

### Modified Capabilities
- *(none — no existing specs)*

## Impact

- **New dependencies**: PixiJS v8, Yjs, Hocuspocus, Fastify, Drizzle ORM, Zod, MinIO SDK, PostgreSQL client
- **New infrastructure**: Docker Compose with PostgreSQL and MinIO services
- **Code organization**: pnpm workspace with `packages/domain`, `packages/client`, `packages/server`
- **No breaking changes**: Greenfield project, no existing code to break

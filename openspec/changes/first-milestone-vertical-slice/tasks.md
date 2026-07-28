## 1. Workspace Scaffolding

- [ ] 1.1 Create root package.json with pnpm workspace config
- [ ] 1.2 Create pnpm-workspace.yaml with packages/domain, packages/client, packages/server
- [ ] 1.3 Create tsconfig.base.json with shared TypeScript settings
- [ ] 1.4 Create packages/domain with package.json (@gridboard/domain), tsconfig.json, and src/index.ts
- [ ] 1.5 Create packages/client with package.json (@gridboard/client), tsconfig.json, vite.config.ts, index.html
- [ ] 1.6 Create packages/server with package.json (@gridboard/server), tsconfig.json
- [ ] 1.7 Install root dependencies (typescript, eslint, prettier)
- [ ] 1.8 Add domain as workspace dependency in client and server package.json
- [ ] 1.9 Create .gitignore for node_modules, dist, .env, uploads

## 2. Domain Package — Core Types and Logic

- [ ] 2.1 Define BoardItem base type (id, type, x, y, width, height, rotation, layerId, attrs)
- [ ] 2.2 Define RectangleItem type extending BoardItem with fillColor, strokeColor, strokeWidth
- [ ] 2.3 Define Board type (id, name, items, layers, gridConfig, createdAt, updatedAt)
- [ ] 2.4 Define Layer type (id, name, order, visible, locked)
- [ ] 2.5 Define CameraState type (x, y, zoom)
- [ ] 2.6 Define GridConfig type (cellSize, subdivisions, originX, originY, snapEnabled)
- [ ] 2.7 Implement GridService with snapPoint, snapRect, snapSize pure functions
- [ ] 2.8 Define ItemTypeDefinition interface (type, schema, defaultAttrs, defaultSize, getBounds, hitTest)
- [ ] 2.9 Create ITEM_TYPES const map with rectangle entry
- [ ] 2.10 Implement RectangleItem bounds calculation and hitTest
- [ ] 2.11 Add Zod schemas for all domain types
- [ ] 2.12 Export all types and functions from index.ts barrel

## 3. Server Package — Database Schema

- [ ] 3.1 Install Drizzle ORM, PostgreSQL driver, drizzle-kit
- [ ] 3.2 Create db/schema.ts with boards table (id, name, createdAt, updatedAt)
- [ ] 3.3 Create db/schema.ts with yjs_documents table (boardId, data BYTEA, version, updatedAt)
- [ ] 3.4 Create db/schema.ts with assets table (id, boardId, filename, mimeType, size, storageKey, createdAt)
- [ ] 3.5 Create db/index.ts with Drizzle client setup from DATABASE_URL
- [ ] 3.6 Create initial migration script
- [ ] 3.7 Add drizzle.config.ts for migration generation

## 4. Server Package — Fastify API

- [ ] 4.1 Install Fastify, @fastify/cors, @fastify/jwt, @fastify/multipart
- [ ] 4.2 Create server entry point (index.ts) with Fastify initialization
- [ ] 4.3 Implement POST /api/boards — create board, return { id, token }
- [ ] 4.4 Implement GET /api/boards/:id — return board metadata
- [ ] 4.5 Implement GET /health — health check endpoint
- [ ] 4.6 Add JWT plugin with @fastify/jwt for token signing and verification
- [ ] 4.7 Add auth decorator/hook for protected routes
- [ ] 4.8 Implement POST /api/boards/:id/assets — multipart image upload
- [ ] 4.9 Implement GET /api/assets/:key — serve stored images
- [ ] 4.10 Add file type validation and size limits on upload

## 5. Server Package — Storage Provider

- [ ] 5.1 Define StorageProvider interface (put, get, delete, getUrl)
- [ ] 5.2 Implement MinioStorage using @aws-sdk/client-s3 pointed at MinIO
- [ ] 5.3 Implement LocalStorage for development without Docker
- [ ] 5.4 Add storage provider selection based on environment config

## 6. Server Package — Hocuspocus Collaboration

- [ ] 6.1 Install @hocuspocus/server, @hocuspocus/extension-database, yjs
- [ ] 6.2 Configure Hocuspocus server with onAuthenticate hook (JWT verification)
- [ ] 6.3 Configure Hocuspocus onConnect hook (board permission check)
- [ ] 6.4 Configure Hocuspocus onLoadDocument hook (fetch Yjs binary from PostgreSQL)
- [ ] 6.5 Configure Hocuspocus onStoreDocument hook (save Yjs binary to PostgreSQL)
- [ ] 6.6 Configure Hocuspocus onChange hook (enforce viewer read-only)
- [ ] 6.7 Mount Hocuspocus WebSocket on /collab path in Fastify
- [ ] 6.8 Add awareness configuration for presence/cursor data

## 7. Client Package — React Shell

- [ ] 7.1 Install React, React Router, Vite, @vitejs/plugin-react
- [ ] 7.2 Create main.tsx with React entry point
- [ ] 7.3 Create App component with React Router (/, /board/:id routes)
- [ ] 7.4 Create HomePage with "New Board" button
- [ ] 7.5 Create BoardPage component (creates CanvasController, connects Hocuspocus)
- [ ] 7.6 Install and configure Zustand for UI chrome state (activeTool, selectedItemIds)
- [ ] 7.7 Create Toolbar component (select, rectangle, delete tools)
- [ ] 7.8 Create basic CSS/styling for the app shell

## 8. Client Package — PixiJS Canvas

- [ ] 8.1 Install pixi.js v8
- [ ] 8.2 Create CanvasController class (mount, destroy, addItem, moveItem, removeItem, clear)
- [ ] 8.3 Implement PixiJS Application initialization with transparent background
- [ ] 8.4 Implement grid line rendering (major/minor lines, dynamic spacing on zoom)
- [ ] 8.5 Implement camera pan (spacebar + drag)
- [ ] 8.6 Implement camera zoom (mouse wheel, centered on pointer)
- [ ] 8.7 Create PixiCanvas React component (ref to CanvasController)
- [ ] 8.8 Implement rectangle renderer (PixiJS Graphics with fill and stroke)
- [ ] 8.9 Implement selection handles (corner/edge indicators on selected items)
- [ ] 8.10 Implement SelectTool (click to select, shift for multi-select, click empty to deselect)
- [ ] 8.11 Implement CreateRectTool (click-drag to create rectangle, preview during drag)
- [ ] 8.12 Implement drag-to-move with continuous grid snapping
- [ ] 8.13 Implement delete via keyboard (Delete/Backspace) and toolbar button
- [ ] 8.14 Implement arrow key movement (one grid cell per press)

## 9. Client Package — Yjs Collaboration

- [ ] 9.1 Install yjs, @hocuspocus/provider
- [ ] 9.2 Create YjsBoardAdapter class (Y.Doc ↔ domain types)
- [ ] 9.3 Implement toDomainSnapshot() — read Yjs state into domain Board
- [ ] 9.4 Implement applyLocalAction() — write domain action to Yjs transaction
- [ ] 9.5 Implement observe callback — Yjs changes → CanvasController updates
- [ ] 9.6 Create HocuspocusProvider connection with boardId and token
- [ ] 9.7 Wire YjsBoardAdapter to CanvasController in BoardPage
- [ ] 9.8 Implement awareness/cursor sharing (throttled)
- [ ] 9.9 Handle reconnection on WebSocket disconnect

## 10. Client Package — Image Items

- [ ] 10.1 Add image item type to ITEM_TYPES registry
- [ ] 10.2 Implement image renderer (PixiJS Sprite from uploaded texture)
- [ ] 10.3 Implement drag-and-drop file upload on canvas
- [ ] 10.4 Implement paste image from clipboard
- [ ] 10.5 Show upload progress/processing state on board
- [ ] 10.6 Wire image upload to server API and MinIO storage

## 11. Docker and Deployment

- [ ] 11.1 Create server/Dockerfile (multi-stage: install → build → production)
- [ ] 11.2 Create client/Dockerfile (multi-stage: build → nginx)
- [ ] 11.3 Create docker-compose.yml with postgres, minio, server, client services
- [ ] 11.4 Add persistent volumes for PostgreSQL and MinIO data
- [ ] 11.5 Add health checks for PostgreSQL and server
- [ ] 11.6 Create .dockerignore
- [ ] 11.7 Add environment variable defaults for development
- [ ] 11.8 Verify docker compose up --build starts all services

## 12. Verification

- [ ] 12.1 Run pnpm install and verify workspace resolution
- [ ] 12.2 Run TypeScript compilation on all packages
- [ ] 12.3 Start server and verify /health endpoint
- [ ] 12.4 Start client and verify Vite dev server
- [ ] 12.5 Create board via API and verify response
- [ ] 12.6 Open board in browser and verify canvas renders
- [ ] 12.7 Create, select, move, delete rectangles
- [ ] 12.8 Verify grid snapping during drag
- [ ] 12.9 Verify board state persists after page refresh
- [ ] 12.10 Open board in two browsers and verify real-time sync
- [ ] 12.11 Upload image and verify it renders on canvas
- [ ] 12.12 Run docker compose up --build and verify full stack
- [ ] 12.13 Stop and restart containers, verify data persistence

# media-import

## Purpose

Local image upload, storage in MinIO/S3-compatible storage, and placement on the board as an image item. Processing status tracking.

---

<!-- Promoted from openspec/changes/first-milestone-vertical-slice/specs/media-import/spec.md -->

### Requirement: Image upload via drag-and-drop
The system SHALL allow users to upload images by dropping them onto the board canvas.

#### Scenario: Drop image file on canvas
- **WHEN** user drags an image file from their file system onto the board canvas
- **THEN** a file upload is initiated to the server
- **THEN** the image shows a "processing" state on the board while uploading
- **THEN** once uploaded, the image is displayed at the drop position
- **THEN** the image item snaps to the grid

#### Scenario: Supported image formats
- **WHEN** user drops a PNG, JPEG, GIF, or WebP file
- **THEN** the upload proceeds normally
- **WHEN** user drops an unsupported file type
- **THEN** the upload is rejected with an error message

#### Scenario: File size limit
- **WHEN** user drops a file exceeding the maximum size (default 50MB)
- **THEN** the upload is rejected with a size limit error message

### Requirement: Image upload via paste
The system SHALL allow users to paste images from the clipboard onto the board.

#### Scenario: Paste image from clipboard
- **WHEN** user copies an image to the clipboard (e.g., from screenshot tool or browser)
- **WHEN** user presses Ctrl+V / Cmd+V on the board
- **THEN** the image is uploaded to the server
- **THEN** the image is placed at the center of the current viewport
- **THEN** the image item snaps to the grid

### Requirement: Image storage in MinIO
The system SHALL store uploaded images in MinIO (S3-compatible object storage) behind a StorageProvider interface.

#### Scenario: Image stored in MinIO
- **WHEN** an image is uploaded
- **THEN** the file is stored in MinIO with a unique asset ID
- **THEN** the asset ID is stored in the database with metadata (original filename, MIME type, size, upload timestamp)
- **THEN** the board item references the asset ID

#### Scenario: Image served from MinIO
- **WHEN** a board with an image item is loaded
- **THEN** the image is fetched from MinIO via the server proxy endpoint
- **THEN** the image is displayed on the canvas

#### Scenario: Image survives container restart
- **WHEN** Docker containers are stopped and restarted
- **WHEN** a board with an image item is loaded
- **THEN** the image is still accessible and displayed correctly

### Requirement: StorageProvider interface
The system SHALL define a StorageProvider interface that abstracts the storage backend. The interface is intentionally a *storage operations* contract, not an *access URL* contract — asset access URLs are a routing concern handled by the server's `AssetUrlService`.

#### Scenario: Interface defines storage operations
- **WHEN** the StorageProvider interface is implemented
- **THEN** it provides `put(key, data, contentType)` for buffered writes
- **THEN** it provides `putStream(key, readable, contentType, size?)` for streaming writes (used by future background jobs such as yt-dlp piping a 200 MB video — buffering through memory is unacceptable)
- **THEN** it provides `get(key)` for buffered reads
- **THEN** it provides `getStream(key)` for streaming reads
- **THEN** it provides `delete(key)` for removing files
- **THEN** it provides `exists(key)` for existence checks
- **THEN** it does NOT expose a public `getUrl(key)` method — URL issuance is the server's responsibility

#### Scenario: MinIO implementation exists
- **WHEN** the server is configured with MinIO credentials
- **THEN** a MinioStorage implementation of StorageProvider is used (uses `@aws-sdk/client-s3` with the Upload helper for streaming puts)
- **THEN** files are stored in the configured MinIO bucket

#### Scenario: Local filesystem implementation exists
- **WHEN** `STORAGE_BACKEND=local` is set (default in development without Docker)
- **THEN** a LocalStorage implementation of StorageProvider is used (uses `fs.createReadStream` / `fs.createWriteStream`)
- **THEN** files are stored in a local `./uploads` directory

### Requirement: Server-mediated asset access
The system SHALL route all asset access through the server's `GET /api/assets/:key` endpoint with JWT validation. This satisfies `AGENTS.md:46` ("Enforce authorization on every... asset request") uniformly regardless of storage backend.

#### Scenario: All asset access goes through server proxy
- **WHEN** a client loads an image item on the board
- **THEN** it fetches the image via `GET /api/assets/:key` with a JWT in the Authorization header
- **THEN** the server validates the JWT, calls `StorageProvider.getStream(key)`, and streams the response back
- **THEN** the client never receives a direct MinIO URL or a presigned URL — the server is the only access path

#### Scenario: Presigned URLs are not part of the public contract
- **WHEN** the server is configured to use MinIO
- **THEN** the MinIO implementation MAY issue presigned URLs internally for upstream fetches (e.g., for the server-side proxy itself)
- **THEN** presigned URLs are NEVER returned to clients
- **THEN** the `StorageProvider` interface does not model presigned URLs — they are an internal optimization, not part of the abstraction

### Requirement: Image item on board
The system SHALL display uploaded images as image items on the board canvas.

#### Scenario: Image item rendering
- **WHEN** an image item exists on the board
- **THEN** it is rendered as a PixiJS Sprite with the uploaded image texture
- **THEN** it has the same selection, move, and delete behavior as rectangle items
- **THEN** it maintains its aspect ratio when resized (future capability, fixed size for v1)

#### Scenario: Image item in collaboration
- **WHEN** user A uploads an image to a board
- **THEN** user B sees the image item appear on the board
- **THEN** user B can select, move, and delete the image item

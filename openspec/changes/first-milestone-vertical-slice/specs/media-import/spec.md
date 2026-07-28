## ADDED Requirements

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
The system SHALL define a StorageProvider interface that abstracts the storage backend.

#### Scenario: Interface defines put/get/delete/url methods
- **WHEN** the StorageProvider interface is implemented
- **THEN** it provides put(key, data, contentType) for storing files
- **THEN** it provides get(key) for retrieving files
- **THEN** it provides delete(key) for removing files
- **THEN** it provides getUrl(key) for generating access URLs

#### Scenario: MinIO implementation exists
- **WHEN** the server is configured with MinIO credentials
- **THEN** a MinIOStorage implementation of StorageProvider is used
- **THEN** files are stored in the configured MinIO bucket

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

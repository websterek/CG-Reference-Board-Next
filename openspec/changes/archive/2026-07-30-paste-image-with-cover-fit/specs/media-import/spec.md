## MODIFIED Requirements

### Requirement: Image upload via paste
The system SHALL allow users to paste images from the clipboard onto the board at the pointer position, with the placed image item sized to its natural aspect on the grid.

#### Scenario: Paste image from clipboard via keyboard
- **WHEN** user copies an image to the clipboard (e.g. from a screenshot tool or browser)
- **WHEN** user presses Ctrl+V / Cmd+V with the board canvas focused
- **THEN** the image is uploaded to the server via `POST /api/boards/:id/assets`
- **THEN** the image is placed at the pointer position, snapped to the nearest grid cell
- **THEN** the placed item's `width × height` honors the image's natural aspect ratio (strict)
- **THEN** the placed item's `width × height` is an integer multiple of `cellSize` on each axis
- **THEN** the image item's smallest dimension is at least one tile (one `cellSize` unit)

#### Scenario: Paste image from clipboard via right-click context menu
- **WHEN** user right-clicks on empty canvas and selects "Paste image" from the context menu
- **THEN** the image is read from the system clipboard and uploaded to the server
- **THEN** the image is placed at the right-click position, snapped to the nearest grid cell
- **THEN** the same size, aspect, and tile-snap rules apply as for keyboard paste

#### Scenario: Clipboard contains no image
- **WHEN** user triggers paste and the clipboard contains no image data
- **THEN** the paste is a no-op (no item is created, no upload is initiated)
- **THEN** no error is shown to the user

#### Scenario: Unsupported clipboard MIME type
- **WHEN** user triggers paste and the clipboard contains a non-image MIME type that the upload endpoint rejects
- **THEN** the server returns a 415 response
- **THEN** no item is created
- **THEN** an error notification is shown to the user

### Requirement: Image item rendering with cover fit
The system SHALL render image items using a cover-fit strategy that fills the item's display rect while preserving the image's natural aspect ratio, clipping excess texture to the item bounds.

#### Scenario: Image rendered in an item rect
- **WHEN** an image item is rendered
- **THEN** the texture is scaled by `max(itemWidth / naturalWidth, itemHeight / naturalHeight)`
- **THEN** the scaled texture is centered within the item rect
- **THEN** any texture that extends outside the item rect is clipped by a mask equal to the item rect
- **THEN** the texture is never stretched to a non-natural aspect ratio

#### Scenario: Image item on a legacy board without natural dimensions
- **WHEN** an image item exists on a board that was created before natural dimensions were stored on `ImageAttrs`
- **THEN** the renderer uses `item.width` and `item.height` as a fallback natural size for the first render
- **THEN** once the texture loads, the renderer emits an update that backfills `naturalWidth` and `naturalHeight` on the item's `attrs`
- **THEN** subsequent renders use the backfilled values

### Requirement: Image item aspect-locked resize
The system SHALL resize image items in a strictly aspect-locked manner that preserves the natural aspect ratio of the image at all times.

#### Scenario: Corner drag on an image item
- **WHEN** user drags a corner resize handle of an image item
- **THEN** the resulting item rect's `width / height` ratio equals the image's `naturalWidth / naturalHeight` ratio
- **THEN** both `width` and `height` are integer multiples of `cellSize`
- **THEN** the corner opposite to the dragged corner remains anchored (does not move)
- **THEN** the dominant drag axis determines the long dimension; the short dimension follows from the aspect

#### Scenario: Resize attempts to break aspect
- **WHEN** user drags a corner that would produce a non-natural aspect ratio
- **THEN** the resulting rect is clamped to the natural aspect — the user's drag delta is honored as a "size factor" rather than a "free rect"
- **THEN** the user cannot produce a non-natural-aspect rect for an image item through any UI affordance (drag, context menu, paste, or tool)

#### Scenario: Non-image item resize is unchanged
- **WHEN** user drags a corner resize handle of a non-image item (rectangle, frame, etc.)
- **THEN** the existing free-aspect resize behavior applies (this requirement is image-specific)

### Requirement: Image item default size
The system SHALL determine the default size of a newly created image item based on the image's natural aspect ratio, with a floor of one tile on the short side.

#### Scenario: Default size for a 2:1 image
- **WHEN** a 2:1 image is pasted (or created via the image tool)
- **THEN** the default item rect is `cellSize × 2*cellSize` (1 tile tall, 2 tiles wide)
- **THEN** the item rect is positioned so its top-left is at the pointer cell

#### Scenario: Default size for a 1:1 image
- **WHEN** a square image is pasted
- **THEN** the default item rect is `cellSize × cellSize` (1 tile by 1 tile)

#### Scenario: Default size for a 16:9 image
- **WHEN** a 16:9 image is pasted
- **THEN** the default item rect is `2*cellSize × cellSize` (2 tiles wide, 1 tile tall)
- **THEN** `longSide` is computed as `round(naturalAspect × cellSize) / cellSize × cellSize`, snapped to the nearest cell

#### Scenario: Default size floor
- **WHEN** an image with any aspect ratio is pasted
- **THEN** both `width` and `height` are at least `cellSize` (one tile)

### Requirement: Right-click context menu
The system SHALL provide a right-click context menu on the board canvas with paste and image-management actions.

#### Scenario: Right-click on empty canvas
- **WHEN** user right-clicks on empty canvas
- **THEN** a context menu opens at the cursor with: "Paste image" (shortcut: Ctrl+V), divider, "Zoom in" / "Zoom out" / "Fit to content" / "Reset view"
- **THEN** the browser's default context menu is suppressed

#### Scenario: Right-click on an image item
- **WHEN** user right-clicks on an image item
- **THEN** a context menu opens at the cursor with: "Size" submenu (1×, 2×, 3×, 4×, 6×, 8×), divider, "Paste image", "Delete", divider, an info footer showing `naturalWidth × naturalHeight`
- **THEN** selecting a size entry resizes the image to that factor of the default size, preserving the natural aspect

#### Scenario: Right-click on a non-image item
- **WHEN** user right-clicks on a non-image item (rectangle, frame, etc.)
- **THEN** a context menu opens with: "Paste image", "Delete"
- **THEN** the item is selected as a side effect of opening the menu

#### Scenario: Context menu close
- **WHEN** a context menu is open
- **THEN** clicking outside the menu closes it
- **THEN** pressing Escape closes it
- **THEN** selecting a menu entry closes it
- **THEN** scrolling the canvas closes it

### Requirement: Image attrs carry natural dimensions
The system SHALL persist an image's natural pixel dimensions on the image item's attributes so that cover-fit rendering and aspect-locked resize are deterministic across clients and sessions.

#### Scenario: ImageAttrs schema
- **WHEN** an image item is created
- **THEN** its `attrs` object includes `naturalWidth` and `naturalHeight` as positive integers
- **THEN** the schema rejects any image item missing either field with a validation error

#### Scenario: Natural dimensions round-trip through Yjs
- **WHEN** user A creates an image item with `naturalWidth` and `naturalHeight` set
- **WHEN** user B receives the change
- **THEN** user B's item has the same `naturalWidth` and `naturalHeight` values
- **THEN** user B's renderer uses these values for cover-fit and aspect-lock math (no client-side probing needed)

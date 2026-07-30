# board-core

## Purpose

Board creation, opening, and the custom grid canvas with pan/zoom/snap. Rectangle items with selection, move, and delete. Grid service, item type registry, and layer model.

---

<!-- Promoted from openspec/changes/first-milestone-vertical-slice/specs/board-core/spec.md -->

### Requirement: Board creation
The system SHALL allow users to create a new board via the web UI.

#### Scenario: Create board via button
- **WHEN** user clicks "New Board" button
- **THEN** a POST request is sent to /api/boards
- **THEN** the server returns a board ID
- **THEN** the browser navigates to /board/:id

#### Scenario: Board has default state
- **WHEN** a new board is created
- **THEN** it contains five first-class layers: `frames`, `media`, `overlay`, `connectors`, `annotations`
- **THEN** it has no items
- **THEN** it has a default grid configuration (cell size 20px, snap enabled)

### Requirement: Grid canvas rendering
The system SHALL render an infinite grid canvas using PixiJS v8 with pan, zoom, and grid snapping. The grid SHALL be drawn in board (world) coordinates so the parent zoom transform handles scaling. Grid lines SHALL remain visible at every zoom level between `MIN_ZOOM` (0.1) and `MAX_ZOOM` (5). The grid is the source of truth for structured item positions and sizes.

#### Scenario: Canvas initializes
- **WHEN** user navigates to /board/:id
- **THEN** a PixiJS Application is created and mounted in the board container
- **THEN** grid lines are rendered at the configured cell size in board coordinates
- **THEN** the grid is visible at the default zoom
- **THEN** the viewport is centered on the origin (0, 0)

#### Scenario: Pan canvas
- **WHEN** user holds spacebar and drags the canvas
- **THEN** the viewport pans following the pointer movement
- **THEN** grid lines and items move with the viewport

#### Scenario: Zoom canvas
- **WHEN** user scrolls the mouse wheel
- **THEN** the viewport zooms in/out centered on the pointer position
- **THEN** zoom level is clamped between 0.1x and 5x
- **THEN** grid lines remain visible at every zoom level in the clamped range
- **THEN** grid line spacing in screen pixels scales proportionally to zoom

#### Scenario: Grid lines update on zoom
- **WHEN** zoom level changes
- **THEN** grid lines reposition as the world transform scales
- **THEN** lines are drawn from `floor(viewportMin/cellSize)*cellSize` to `ceil(viewportMax/cellSize)*cellSize` in board coordinates
- **THEN** major/minor line distinction is preserved by line weight, not by which lines are visible

### Requirement: Rectangle item creation
The system SHALL allow users to create rectangle items on the board.

#### Scenario: Create rectangle via toolbar
- **WHEN** user selects the rectangle tool from the toolbar
- **WHEN** user clicks and drags on the canvas
- **THEN** a rectangle preview is shown during drag
- **THEN** on pointer up, a rectangle item is created at the dragged position and size
- **THEN** the rectangle snaps to the grid on creation
- **THEN** the rectangle appears on the current layer

#### Scenario: Rectangle has default appearance
- **WHEN** a rectangle is created
- **THEN** it has a default fill color (#4A90D9)
- **THEN** it has a default stroke color (#000000)
- **THEN** it has a default stroke width of 2px
- **THEN** it has a minimum size of one grid cell

### Requirement: Rectangle selection
The system SHALL allow users to select rectangle items on the board.

#### Scenario: Select rectangle by clicking
- **WHEN** user clicks on a rectangle with the select tool active
- **THEN** the rectangle shows selection handles (corners and edges)
- **THEN** the rectangle is visually highlighted (e.g., blue outline)

#### Scenario: Deselect rectangle
- **WHEN** user clicks on empty canvas space
- **THEN** the rectangle is deselected
- **THEN** selection handles disappear

#### Scenario: Multi-select
- **WHEN** user holds Shift and clicks multiple rectangles
- **THEN** all clicked rectangles become selected
- **THEN** selection handles appear on all selected items

### Requirement: Rectangle movement
The system SHALL allow users to move rectangle items on the board. Movement SHALL be cell-quantized: every pointer-move during drag commits a cell-aligned position through `GridService.quantizeRect`. The system SHALL enforce same-layer non-overlap: a move that would cause the rectangle to overlap another media item SHALL be rejected and the rectangle SHALL return to its last valid position.

#### Scenario: Drag to move with cell quantization
- **WHEN** user drags a selected rectangle
- **THEN** the rectangle follows the pointer during drag
- **THEN** on every pointer-move, the position is quantized to integer cell coordinates and committed
- **THEN** the persisted position is always a multiple of `gridConfig.cellSize`
- **THEN** on pointer up, the final quantized position remains committed
- **THEN** the position updates in real-time for other collaborators

#### Scenario: Move rejected on overlap
- **WHEN** user drags a rectangle to a position that would overlap another media item
- **THEN** the move is rejected at that pointer position
- **THEN** the rectangle returns to its last valid position
- **THEN** no Yjs transaction is written for the rejected move

#### Scenario: Move with arrow keys
- **WHEN** a rectangle is selected and user presses arrow keys
- **THEN** the rectangle moves one grid cell per key press
- **THEN** the position is a multiple of `gridConfig.cellSize`
- **THEN** arrow key moves that would cause overlap are rejected

### Requirement: Rectangle deletion
The system SHALL allow users to delete rectangle items from the board.

#### Scenario: Delete via keyboard
- **WHEN** a rectangle is selected and user presses Delete or Backspace
- **THEN** the rectangle is removed from the board
- **THEN** the rectangle is removed from all collaborators' views

#### Scenario: Delete via toolbar
- **WHEN** a rectangle is selected and user clicks the delete button in the toolbar
- **THEN** the rectangle is removed from the board

### Requirement: Board save and reload
The system SHALL persist board state and restore it on reload.

#### Scenario: Board state persists after refresh
- **WHEN** user creates rectangles on a board
- **WHEN** user refreshes the browser
- **THEN** all rectangles are restored at their correct positions
- **THEN** the viewport returns to the default centered position

#### Scenario: Board state survives container restart
- **WHEN** user creates rectangles on a board
- **WHEN** Docker containers are stopped and restarted
- **WHEN** user navigates to the board URL
- **THEN** all rectangles are restored at their correct positions

### Requirement: Item type registry
The system SHALL define an extensible item type registry in the domain package. The registry provides a single registration point; adding a new item type requires explicit additions across the three packages (domain schema, client renderer + tool, server endpoints if the type crosses the network boundary).

#### Scenario: Registry defines rectangle type
- **WHEN** the registry is queried for the "rectangle" type
- **THEN** it returns the rectangle item definition with schema, bounds, and hitTest functions

#### Scenario: Registry defines connector type
- **WHEN** the registry is queried for the "connector" type
- **THEN** it returns the `ConnectorItemDefinition` with `layerKind: 'connector'`, `schema: ConnectorAttrsSchema`, `defaultAttrs: DEFAULT_CONNECTOR_ATTRS`, `defaultSize: { width: 0, height: 0 }`, and `getBounds`/`hitTest` functions
- **THEN** the connector is registered alongside rectangle, image, frame, and annotation-stroke

#### Scenario: Adding a new item type requires explicit additions across packages
- **WHEN** an engineer adds a new item type (e.g., text, image, PDF)
- **THEN** the engineer adds an `ItemTypeDefinition` entry to `domain/ITEM_TYPES` (schema, defaultAttrs, defaultSize, getBounds, hitTest)
- **THEN** the engineer adds a renderer in `client/canvas/renderers/` and a tool in `client/canvas/tools/` (or extends an existing tool) — the canvas controller and the YjsBoardAdapter do not need modification
- **THEN** if the type crosses the network boundary (e.g., image asset storage), the engineer adds the corresponding endpoint(s) in `server/api/` and the upload/load wiring in the client
- **THEN** the new type is available for creation, rendering, selection, move, delete, and serialization through the existing canvas/board surfaces without changes to core canvas or collaboration code

#### Scenario: Registry does not claim zero-touch extension
- **WHEN** the registry documentation is read
- **THEN** it explicitly states that adding a type is a multi-file change spanning the three packages
- **THEN** the contract is "single registration point + per-type implementation," not "no changes required"

### Requirement: Layer model
The system SHALL support five first-class semantic layer kinds: `frame`, `media`, `overlay`, `connector`, `annotation`. The four legacy kinds (`frame`, `media`, `overlay`, `annotation`) are pre-populated at module load via the `LayerDefinition` registry; the `connector` kind is registered alongside them. Each board SHALL contain exactly one layer of each registered kind. The item registry SHALL auto-route each item type to its declared `LayerKind`. The user SHALL NOT manually choose a layer for an item. Z-order from back to front SHALL be `frame < media < overlay < connector < annotation`.

#### Scenario: Board has five first-class layers on creation
- **WHEN** a new board is created
- **THEN** it contains exactly five layers: `frames`, `media`, `overlay`, `connectors`, `annotations`
- **THEN** the layers have stable IDs and z-order

#### Scenario: Items are auto-routed by type
- **WHEN** user creates a rectangle item
- **THEN** the item is added to the layer with kind `media`
- **THEN** no UI prompt asks the user to pick a layer

#### Scenario: Layer ordering preserved across reload
- **WHEN** items exist on multiple layer kinds
- **THEN** items on higher layers render above items on lower layers
- **THEN** layer order is persisted and restored on reload

#### Scenario: Legacy single-layer board migrates
- **WHEN** a board created before this change is opened
- **THEN** the document migrates to four fixed layers in one Yjs transaction
- **THEN** existing items are reassigned to the `media` layer
- **THEN** the legacy `default` layer is removed

# board-core (delta)

> Delta from `openspec/specs/board-core/spec.md`. The full board-core spec
> remains in `openspec/specs/board-core/spec.md`; this delta lists only the
> requirements that change with the grid-native-items-and-typed-layers change.

## MODIFIED Requirements

### Requirement: Grid canvas rendering
The system SHALL render an infinite grid canvas using PixiJS v8 with pan, zoom, and grid snapping. The grid SHALL be drawn in board (world) coordinates so the parent zoom transform handles scaling. Grid lines SHALL remain visible at every zoom level between `MIN_ZOOM` (0.1) and `MAX_ZOOM` (5). The grid is the source of truth for structured item positions and sizes.

#### Scenario: Canvas initializes with visible grid
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

### Requirement: Layer model
The system SHALL support four fixed semantic layer kinds: `frame`, `media`, `overlay`, `annotation`. Each board SHALL contain exactly one layer of each kind. The item registry SHALL auto-route each item type to its declared `LayerKind`. The user SHALL NOT manually choose a layer for an item. Z-order from back to front SHALL be `frame < media < overlay < annotation`.

#### Scenario: Board has four fixed layers on creation
- **WHEN** a new board is created
- **THEN** it contains exactly four layers: `frames`, `media`, `overlay`, `annotations`
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

## REMOVED Requirements

### Requirement: Default layer exists
**Reason**: Replaced by four fixed semantic layer kinds (`frames`, `media`, `overlay`, `annotations`). Boards no longer have a single user-named default layer.

**Migration**: Legacy boards with the historical `default` layer are migrated on first load: the four fixed kinds are inserted, existing items are reassigned to `media`, and the legacy `default` layer is removed. The migration runs in a single Yjs transaction so peers see one consistent change.

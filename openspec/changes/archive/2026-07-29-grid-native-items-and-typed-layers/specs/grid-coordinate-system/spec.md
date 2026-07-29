# grid-coordinate-system

## ADDED Requirements

### Requirement: Grid is the source of truth for structured items
The grid MUST be the coordinate system for all structured items. Item positions and sizes SHALL be stored as integer multiples of the configured cell size in board coordinates. The grid SHALL be drawn in world (board) coordinates so the parent zoom transform handles scaling; grid lines SHALL remain visible at every zoom level between `MIN_ZOOM` and `MAX_ZOOM`.

#### Scenario: Grid remains visible at every zoom
- **WHEN** user changes the viewport zoom to any value in `[0.1, 5]`
- **THEN** the grid is still rendered
- **THEN** grid line spacing in screen pixels changes proportionally to zoom
- **THEN** grid lines do not vanish, double, or shift off-cell

#### Scenario: Items store integer cell coordinates
- **WHEN** any code path writes an item's `x`, `y`, `width`, or `height`
- **THEN** each value is a multiple of `gridConfig.cellSize`
- **THEN** the value is rejected at the write boundary if it is not a cell multiple

#### Scenario: Snap is independent of zoom
- **WHEN** user moves an item while the viewport is zoomed to any level
- **THEN** the snapped position is identical to the snapped position at zoom 1.0
- **THEN** the snapped position is a multiple of `gridConfig.cellSize` in board coordinates

### Requirement: Cell quantization is the only sanctioned way to compute bounds
The system SHALL expose a single domain function (`GridService.quantizeRect`) that returns a `Rect` whose `x`, `y`, `width`, and `height` are all multiples of `gridConfig.cellSize`. All create, move, resize, paste, undo, and remote-apply paths MUST funnel through this function before committing to storage.

#### Scenario: All write paths use the quantize function
- **WHEN** an item's bounds change by any mechanism (drag, resize, paste, undo, remote apply)
- **THEN** the write goes through `GridService.quantizeRect` before commit
- **THEN** the persisted bounds have all four coordinates as cell multiples

#### Scenario: Schema rejects non-cell multiples
- **WHEN** a write attempts to set a non-cell-multiple coordinate
- **THEN** the schema validation fails
- **THEN** the write is rejected before reaching Yjs

### Requirement: Grid renders in world coordinates
The PixiJS grid graphics object SHALL be a child of the world container at world origin. Lines SHALL be drawn in board-coordinate space, never in screen-coordinate space. The world container's existing zoom transform handles scaling. There SHALL be no `if (cell < 4) return` guard that hides the grid at low zoom.

#### Scenario: Grid drawn in board coordinates
- **WHEN** the camera pans or zooms
- **THEN** grid lines reposition as the world transform changes
- **THEN** grid line endpoints are computed in board space and rely on the parent transform to project to screen

#### Scenario: Negative viewport coordinates produce correct lines
- **WHEN** the viewport extends into negative board coordinates
- **THEN** grid lines are still drawn at every cell boundary from `floor(viewportMin/cell)*cell` to `ceil(viewportMax/cell)*cell`
- **THEN** no off-by-one cell shift occurs from negative-modulo behavior

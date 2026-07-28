## ADDED Requirements

### Requirement: Board creation
The system SHALL allow users to create a new board via the web UI.

#### Scenario: Create board via button
- **WHEN** user clicks "New Board" button
- **THEN** a POST request is sent to /api/boards
- **THEN** the server returns a board ID
- **THEN** the browser navigates to /board/:id

#### Scenario: Board has default state
- **WHEN** a new board is created
- **THEN** it contains one default layer
- **THEN** it has no items
- **THEN** it has a default grid configuration (cell size 20px, snap enabled)

### Requirement: Grid canvas rendering
The system SHALL render an infinite grid canvas using PixiJS v8 with pan, zoom, and grid snapping.

#### Scenario: Canvas initializes
- **WHEN** user navigates to /board/:id
- **THEN** a PixiJS Application is created and mounted in the board container
- **THEN** grid lines are rendered at the configured cell size
- **THEN** the viewport is centered on the origin (0, 0)

#### Scenario: Pan canvas
- **WHEN** user holds spacebar and drags the canvas
- **THEN** the viewport pans following the pointer movement
- **THEN** grid lines and items move with the viewport

#### Scenario: Zoom canvas
- **WHEN** user scrolls the mouse wheel
- **THEN** the viewport zooms in/out centered on the pointer position
- **THEN** zoom level is clamped between 0.1x and 5x

#### Scenario: Grid lines update on zoom
- **WHEN** zoom level changes
- **THEN** grid line spacing adjusts to maintain readability (major/minor lines)

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
The system SHALL allow users to move rectangle items on the board.

#### Scenario: Drag to move
- **WHEN** user drags a selected rectangle
- **THEN** the rectangle follows the pointer during drag
- **THEN** the rectangle snaps to grid continuously during drag (visual feedback)
- **THEN** on pointer up, the final snapped position is committed
- **THEN** the rectangle position updates in real-time for other collaborators

#### Scenario: Move with arrow keys
- **WHEN** a rectangle is selected and user presses arrow keys
- **THEN** the rectangle moves one grid cell per key press
- **THEN** the position snaps to grid

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
The system SHALL define an extensible item type registry in the domain package.

#### Scenario: Registry defines rectangle type
- **WHEN** the registry is queried for the "rectangle" type
- **THEN** it returns the rectangle item definition with schema, bounds, and hitTest functions

#### Scenario: Registry is extensible
- **WHEN** a new item type definition is added to the registry
- **THEN** existing code does not need modification to support the new type
- **THEN** the new type is available for creation, rendering, and serialization

### Requirement: Layer model
The system SHALL support multiple ordered layers for organizing items.

#### Scenario: Default layer exists
- **WHEN** a board is created
- **THEN** it has one default layer named "Layer 1"
- **THEN** all new items are added to the current active layer

#### Scenario: Layer ordering
- **WHEN** items exist on multiple layers
- **THEN** items on higher layers render above items on lower layers
- **THEN** layer order is persisted and restored on reload

# interaction-modes

## ADDED Requirements

### Requirement: Two interaction modes
The system SHALL support two interaction modes: `grid` and `annotation`. The active mode SHALL be stored in client UI state (Zustand `uiStore`) and SHALL NOT mutate any item data.

#### Scenario: Default mode is Grid Mode
- **WHEN** user opens a board
- **THEN** the active interaction mode is `grid`

#### Scenario: Mode toggle in toolbar
- **WHEN** user clicks the Annotation toggle in the toolbar
- **THEN** the active interaction mode becomes `annotation`
- **WHEN** user clicks the toggle again
- **THEN** the active interaction mode becomes `grid`

### Requirement: Mode changes available tools
Grid Mode SHALL expose the Select, Frame, and Rectangle tools. Annotation Mode SHALL expose the Free-draw tool only. Switching mode SHALL change which tools are available without mutating any item.

#### Scenario: Grid Mode tools available
- **WHEN** interaction mode is `grid`
- **THEN** Select, Frame, and Rectangle tools are available in the toolbar
- **THEN** the Free-draw tool is not available

#### Scenario: Annotation Mode tools available
- **WHEN** interaction mode is `annotation`
- **THEN** the Free-draw tool is available in the toolbar
- **THEN** Select, Frame, and Rectangle tools are not available

### Requirement: Switching mode preserves existing items
When the interaction mode changes, no item's position, size, layer, or attributes SHALL change.

#### Scenario: Mode switch does not move items
- **WHEN** user switches from Grid Mode to Annotation Mode
- **THEN** all existing items retain their position, size, layer, and attributes
- **WHEN** user switches back to Grid Mode
- **THEN** all items still retain their state

### Requirement: Annotation Mode disables snap
In Annotation Mode, the active drawing tool SHALL NOT call `GridService.snapRect` with `snapEnabled: true`. Free-draw strokes store raw board coordinates without quantization.

#### Scenario: Free-draw strokes not quantized
- **WHEN** user draws a freehand stroke in Annotation Mode
- **THEN** the stroke's vertices are stored at raw board coordinates
- **THEN** vertices are not snapped to cell boundaries
- **THEN** vertices are placed exactly where the cursor moved

#### Scenario: Grid Mode snap is enforced
- **WHEN** user is in Grid Mode
- **THEN** any structured item creation, move, or resize calls `GridService.snapRect` with `snapEnabled: true`
- **THEN** persisted bounds are integer cell coordinates

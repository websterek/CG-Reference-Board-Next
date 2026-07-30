# interaction-modes

## Delta

This change modifies the `interaction-modes` capability to replace the 2-mode enum with a 3-mode registry, define universal tools (Select/Move/Hand), and add the mode→toolset→activeTool hierarchy. The "Annotation Mode SHALL expose the Free-draw tool only" requirement (spec.md line 27) is replaced.

---

## MODIFIED Requirements

### Requirement: Three-Mode Registry

The system SHALL support three interaction modes — `grid`, `annotation`, and `connector` — defined by the `ModeDefinition` registry rather than a hardcoded `InteractionMode` enum. The active mode SHALL be stored in client UI state (Zustand `uiStore`) and SHALL NOT mutate any item data.

#### Scenario: Default mode is Grid Mode

- **WHEN** user opens a board
- **THEN** the active interaction mode is `grid`

#### Scenario: Mode toggle cycles through modes

- **WHEN** user clicks the mode toggle in the toolbar
- **THEN** the active mode advances to the next mode in the registry order
- **WHEN** the user is in the last mode and clicks the toggle
- **THEN** the active mode wraps to the first mode

#### Scenario: Connector mode is available

- **WHEN** the mode registry is loaded
- **THEN** `connector` is a valid mode
- **THEN** the mode toggle includes connector in its cycle

---

### Requirement: Universal Tool Availability

The system SHALL make Select, Move, and Hand tools available in every mode. Mode switching SHALL NOT hide these tools.

#### Scenario: Select available in all modes

- **WHEN** interaction mode is `grid`
- **THEN** the Select tool is available in the toolbar
- **WHEN** interaction mode is `annotation`
- **THEN** the Select tool is available in the toolbar
- **WHEN** interaction mode is `connector`
- **THEN** the Select tool is available in the toolbar

#### Scenario: Hand available in all modes

- **WHEN** interaction mode is `grid`
- **THEN** the Hand tool is available in the toolbar
- **WHEN** interaction mode is `annotation`
- **THEN** the Hand tool is available in the toolbar

#### Scenario: Move available in all modes

- **WHEN** interaction mode is `grid`
- **THEN** the Move tool is available in the toolbar
- **WHEN** interaction mode is `annotation`
- **THEN** the Move tool is available in the toolbar

---

### Requirement: Mode Swap Preserves Universal Tool

The system SHALL preserve the active tool when switching modes if the active tool is universal. If the active tool is mode-scoped, the system SHALL reset it to the target mode's `defaultTool`.

#### Scenario: Universal tool preserved

- **WHEN** `activeTool` is `'select'` and the user switches from grid to annotation mode
- **THEN** `activeTool` remains `'select'`

#### Scenario: Mode-scoped tool reset

- **WHEN** `activeTool` is `'rectangle'` and the user switches from grid to annotation mode
- **THEN** `activeTool` is set to `'freehand'` (annotation's `defaultTool`)

#### Scenario: Last-used tool per mode remembered

- **WHEN** the user selects `'text'` in annotation mode, switches to grid mode, then switches back to annotation mode
- **THEN** `activeTool` in annotation mode is `'text'`
- **THEN** the `lastUsedToolPerMode` map in `uiStore` stores the per-mode last-used tool

---

### Requirement: Connector Mode

The system SHALL support a `connector` interaction mode for the Connector tool (from the `connector-items` proposal). Connector mode SHALL enforce mandatory snap for endpoint placement.

#### Scenario: Connector mode is selectable

- **WHEN** the user cycles to connector mode
- **THEN** the active mode is `connector`
- **THEN** the Connector tool is the default active tool

#### Scenario: Connector mode snap is mandatory

- **WHEN** the user is in connector mode
- **THEN** the mode's `snapPolicy` is `'mandatory'`
- **THEN** connector endpoints snap to grid points

#### Scenario: Connector mode forward reference

- **WHEN** the `ConnectorTool` does not exist yet (separate proposal not yet implemented)
- **THEN** connector mode shows no mode-scoped tools
- **THEN** universal tools (Select/Move/Hand) are still available
- **THEN** the mode is functional but has no creation tools

---

### Requirement: Mode Determines Visible Toolset

The system SHALL use the active mode's `toolIds` to determine which creation tools are visible in the toolbar. Universal tools (Select/Move/Hand) SHALL always be visible regardless of mode.

#### Scenario: Grid mode shows grid creation tools

- **WHEN** interaction mode is `grid`
- **THEN** the toolbar shows Rectangle, Frame, Image, and Text in the mode-scoped row
- **THEN** the toolbar shows Select, Move, and Hand in the universal row

#### Scenario: Annotation mode shows annotation creation tools

- **WHEN** interaction mode is `annotation`
- **THEN** the toolbar shows Freehand, Arrow, Rectangle, Text, and Eraser in the mode-scoped row
- **THEN** the toolbar shows Select, Move, and Hand in the universal row

#### Scenario: Mode switch changes mode-scoped row only

- **WHEN** the user switches from grid to annotation mode
- **THEN** the universal row (Select/Move/Hand) is unchanged
- **THEN** the mode-scoped row changes from grid tools to annotation tools

# interaction-modes

## Purpose

Three interaction modes (`grid`, `annotation`, `connector`) defined by an extensible `ModeDefinition` registry rather than a closed enum. Each mode exposes a distinct creation toolset; Select, Move, and Hand are universal tools available in every mode. Mode is UI state in Zustand `uiStore`; switching mode swaps which tools are available and adjusts snap behavior without mutating any item. Annotation Mode disables snap so free-draw strokes store raw board coordinates; Grid Mode and Connector Mode enforce snap to grid cells.

---

<!-- Promoted from openspec/changes/grid-native-items-and-typed-layers/specs/interaction-modes/spec.md -->

## Requirements

### Requirement: Three-Mode Registry
The system SHALL support three interaction modes — `grid`, `annotation`, and `connector` — defined by the `ModeDefinition` registry (`packages/domain/src/modes/registry.ts`). Adding a new mode is a single registry entry; no TypeScript union needs to be modified. The active mode SHALL be stored in client UI state (Zustand `uiStore`) and SHALL NOT mutate any item data.

#### Scenario: Default mode is Grid Mode
- **WHEN** user opens a board
- **THEN** the active interaction mode is `grid`
- **THEN** `grid` is the first entry returned by `getAllModes()`

#### Scenario: Mode toggle cycles through modes
- **WHEN** user clicks the mode toggle in the toolbar
- **THEN** the active mode advances to the next mode in the registry order
- **WHEN** the user is in the last mode (`connector`) and clicks the toggle
- **THEN** the active mode wraps to the first mode (`grid`)

#### Scenario: Connector mode is available
- **WHEN** the mode registry is loaded
- **THEN** `connector` is a valid registered mode
- **THEN** the mode toggle includes connector in its cycle

### Requirement: Universal Tool Availability
The system SHALL make Select, Move, and Hand tools available in every interaction mode via `alwaysAvailable: true` on their `ToolDefinition`. Mode switching SHALL NOT hide these tools.

#### Scenario: Select available in all modes
- **WHEN** interaction mode is `grid`, `annotation`, or `connector`
- **THEN** the Select tool button is available in the toolbar's universal row
- **THEN** clicking Select sets `activeTool` to `'select'`

#### Scenario: Move available in all modes
- **WHEN** interaction mode is `grid`, `annotation`, or `connector`
- **THEN** the Move tool button is available in the toolbar's universal row

#### Scenario: Hand available in all modes
- **WHEN** interaction mode is `grid`, `annotation`, or `connector`
- **THEN** the Hand tool button is available in the toolbar's universal row
- **THEN** dragging with Hand pans the camera

### Requirement: Mode Determines Visible Toolset
The system SHALL use the active mode's `toolIds` array (from `ModeDefinition`) to determine which mode-scoped creation tools are visible. Universal tools SHALL always be visible regardless of mode.

#### Scenario: Grid mode shows grid creation tools
- **WHEN** interaction mode is `grid`
- **THEN** the mode-scoped toolbar row shows Rectangle, Frame, Image, and Text
- **THEN** the universal row shows Select, Move, and Hand

#### Scenario: Annotation mode shows annotation creation tools
- **WHEN** interaction mode is `annotation`
- **THEN** the mode-scoped toolbar row shows Freehand, Arrow, Rectangle, Text, and Eraser
- **THEN** the universal row shows Select, Move, and Hand
- **THEN** the Frame and Image tools are NOT visible

#### Scenario: Connector mode shows connector tools
- **WHEN** interaction mode is `connector`
- **THEN** the mode-scoped toolbar row shows the Connector tool
- **THEN** the universal row shows Select, Move, and Hand
- **THEN** Rectangle, Frame, Freehand, and Arrow are NOT visible

#### Scenario: Mode switch changes only mode-scoped row
- **WHEN** the user switches from grid to annotation mode
- **THEN** the universal row (Select/Move/Hand) is unchanged
- **THEN** the mode-scoped row changes from grid tools to annotation tools

### Requirement: Mode Swap Preserves Universal Active Tool
The system SHALL preserve the active tool when switching modes if the active tool is universal. If the active tool is mode-scoped, the system SHALL reset it to the target mode's `defaultTool`. The last-used tool per mode SHALL be remembered in `uiStore.lastUsedToolPerMode` so returning to a mode restores the user's last pick.

#### Scenario: Universal tool preserved
- **WHEN** `activeTool` is `'select'` (universal) and the user switches from grid to annotation mode
- **THEN** `activeTool` remains `'select'`
- **THEN** the Select button stays highlighted in the universal row

#### Scenario: Mode-scoped tool reset
- **WHEN** `activeTool` is `'rectangle'` (grid-scoped) and the user switches to annotation mode
- **THEN** `activeTool` is set to `'freehand'` (annotation's `defaultTool`)

#### Scenario: Last-used tool per mode remembered
- **WHEN** the user selects `'text'` in annotation mode, switches to grid mode, then switches back to annotation mode
- **THEN** `activeTool` in annotation mode is `'text'`
- **THEN** the `lastUsedToolPerMode` map in `uiStore` stores `{ annotation: 'text' }`

### Requirement: Switching mode preserves existing items
When the interaction mode changes, no item's position, size, layer, or attributes SHALL change.

#### Scenario: Mode switch does not move items
- **WHEN** user switches from Grid Mode to Annotation Mode
- **THEN** all existing items retain their position, size, layer, and attributes
- **WHEN** user switches back to Grid Mode
- **THEN** all items still retain their state

### Requirement: Snap Policy per Mode
Each mode SHALL declare a `snapPolicy` on its `ModeDefinition` (`'mandatory'` or `'off'`). The active tool's `snapPolicy` (`'exempt'` or `'mandatory'`) MAY override the mode's policy; tool overrides take precedence over mode policy.

#### Scenario: Grid Mode snap is enforced
- **WHEN** user is in Grid Mode
- **THEN** any structured item creation, move, or resize calls `GridService.snapPoint` with `snapEnabled: true`
- **THEN** persisted bounds are integer cell coordinates

#### Scenario: Annotation Mode disables snap
- **WHEN** user is in Annotation Mode
- **THEN** the active drawing tool SHALL NOT call `GridService.snapPoint` with `snapEnabled: true`
- **THEN** free-draw strokes store raw board coordinates without quantization

#### Scenario: Connector Mode enforces snap
- **WHEN** user is in Connector Mode
- **THEN** connector endpoints snap to grid cell boundaries (mandatory snap)

#### Scenario: Tool snapPolicy overrides mode
- **WHEN** a `ToolDefinition` declares `snapPolicy: 'exempt'` (e.g. Freehand, Hand)
- **THEN** the tool skips snap regardless of the active mode's `snapPolicy`
- **WHEN** a `ToolDefinition` declares `snapPolicy: 'mandatory'` (e.g. Connector)
- **THEN** the tool snaps regardless of the active mode's `snapPolicy`

# tool-registry

## Purpose

Extensible `ToolDefinition` and `ModeDefinition` registries that replace the closed `ToolName` union and `InteractionMode` enum. Modes define which tools are visible; tools declare which modes they appear in. Select, Move, and Hand are universal tools present in every mode. The pointer event state machine is orthogonal to mode and tool selection.

---

## ADDED Requirements

### Requirement: ModeDefinition Interface

The system SHALL define a `ModeDefinition` interface with 5 fields describing a mode's identity, visible tools, default tool, and snap policy.

#### Scenario: Interface shape

- **WHEN** a developer inspects the `ModeDefinition` type
- **THEN** it has fields: `id` (string), `displayName` (string), `toolIds` (string[]), `defaultTool` (string), `snapPolicy` (`'mandatory' | 'off'`)

#### Scenario: Mode id is extensible string

- **WHEN** a new mode is registered
- **THEN** the `id` field accepts any string value
- **THEN** no TypeScript enum needs to be modified

#### Scenario: toolIds excludes universal tools

- **WHEN** a mode's `toolIds` is inspected
- **THEN** it does NOT include `select`, `move`, or `hand`
- **THEN** universal tools are resolved separately by `getToolsForMode()`

---

### Requirement: Default Modes

The system SHALL populate the mode registry with 3 default entries: `grid`, `annotation`, `connector`.

#### Scenario: Three default modes exist

- **WHEN** the mode registry module is loaded
- **THEN** exactly 3 entries are registered: `grid`, `annotation`, `connector`

#### Scenario: Grid mode values

- **WHEN** the `grid` mode entry is inspected
- **THEN** `toolIds` is `['rectangle', 'frame', 'image', 'text']`
- **THEN** `defaultTool` is `'select'`
- **THEN** `snapPolicy` is `'mandatory'`

#### Scenario: Annotation mode values

- **WHEN** the `annotation` mode entry is inspected
- **THEN** `toolIds` is `['freehand', 'arrow', 'rectangle', 'text', 'eraser']`
- **THEN** `defaultTool` is `'freehand'`
- **THEN** `snapPolicy` is `'off'`

#### Scenario: Connector mode values

- **WHEN** the `connector` mode entry is inspected
- **THEN** `toolIds` is `['connector']`
- **THEN** `defaultTool` is `'connector'`
- **THEN** `snapPolicy` is `'mandatory'`

---

### Requirement: ToolDefinition Interface

The system SHALL define a `ToolDefinition` interface with 8 fields describing a tool's identity, mode membership, placement layer, snap policy, factory, and icon.

#### Scenario: Interface shape

- **WHEN** a developer inspects the `ToolDefinition` type
- **THEN** it has fields: `id` (string), `displayName` (string), `modes` (string[]), `alwaysAvailable` (boolean, optional), `placementLayer` (string, optional), `snapPolicy` (`'inherit-mode' | 'mandatory' | 'exempt'`, optional), `factory` (() => Tool), `icon` (string)

#### Scenario: alwaysAvailable makes a tool universal

- **WHEN** a `ToolDefinition` has `alwaysAvailable: true`
- **THEN** the tool appears in every mode's toolbar regardless of its `modes` array
- **THEN** `getToolsForMode()` includes it for every mode

#### Scenario: snapPolicy defaults to inherit-mode

- **WHEN** a `ToolDefinition` does not specify `snapPolicy`
- **THEN** the tool inherits the active mode's `snapPolicy`
- **THEN** a tool in grid mode snaps; the same tool in annotation mode does not

---

### Requirement: Universal Tools

The system SHALL define `select`, `move`, and `hand` as universal tools present in every mode.

#### Scenario: Select is universal

- **WHEN** any mode is active
- **THEN** the Select tool is available in the toolbar
- **THEN** clicking Select sets `activeTool` to `'select'`

#### Scenario: Move is universal

- **WHEN** any mode is active
- **THEN** the Move tool is available in the toolbar
- **THEN** Move is an alias for Select+drag behavior

#### Scenario: Hand is universal

- **WHEN** any mode is active
- **THEN** the Hand tool is available in the toolbar
- **THEN** clicking Hand sets `activeTool` to `'hand'`
- **THEN** dragging with Hand pans the camera

#### Scenario: Universal tools survive mode switch

- **WHEN** the active tool is `'select'` and the user switches from grid to annotation mode
- **THEN** `activeTool` remains `'select'`
- **THEN** the Select tool stays highlighted in the toolbar

---

### Requirement: Mode→Toolset Resolution

The system SHALL provide `getToolsForMode(modeId)` that returns the union of mode-scoped tools and universal tools.

#### Scenario: Grid mode returns mode tools + universal

- **WHEN** `getToolsForMode('grid')` is called
- **THEN** the result includes `'rectangle'`, `'frame'`, `'image'`, `'text'` (mode-scoped)
- **THEN** the result includes `'select'`, `'move'`, `'hand'` (universal)
- **THEN** the result does NOT include `'freehand'`, `'arrow'`, `'eraser'`, `'connector'`

#### Scenario: Annotation mode returns mode tools + universal

- **WHEN** `getToolsForMode('annotation')` is called
- **THEN** the result includes `'freehand'`, `'arrow'`, `'rectangle'`, `'text'`, `'eraser'` (mode-scoped)
- **THEN** the result includes `'select'`, `'move'`, `'hand'` (universal)
- **THEN** the result does NOT include `'frame'`, `'image'`, `'connector'`

#### Scenario: Connector mode returns mode tools + universal

- **WHEN** `getToolsForMode('connector')` is called
- **THEN** the result includes `'connector'` (mode-scoped)
- **THEN** the result includes `'select'`, `'move'`, `'hand'` (universal)

---

### Requirement: ActiveTool State Transitions

The system SHALL implement mode-switch logic that preserves universal active tools and resets mode-scoped active tools to the mode's default.

#### Scenario: Universal tool preserved on mode switch

- **WHEN** `activeTool` is `'select'` (universal) and the user switches from grid to annotation mode
- **THEN** `activeTool` remains `'select'`

#### Scenario: Mode-scoped tool reset on mode switch

- **WHEN** `activeTool` is `'rectangle'` (grid-scoped) and the user switches to annotation mode
- **THEN** `activeTool` is set to `'freehand'` (annotation's `defaultTool`)

#### Scenario: Last-used tool per mode remembered

- **WHEN** the user selects `'text'` in annotation mode, switches to grid mode, then switches back to annotation mode
- **THEN** `activeTool` in annotation mode is `'text'` (the last-used tool for that mode)
- **THEN** the `lastUsedToolPerMode` map stores `{ annotation: 'text' }`

#### Scenario: Default tool on first mode entry

- **WHEN** the user enters a mode for the first time (no entry in `lastUsedToolPerMode`)
- **THEN** `activeTool` is set to the mode's `defaultTool`

---

### Requirement: Hand Tool

The system SHALL provide a `HandTool` implementing the `Tool` interface for first-class panning, replacing the spacebar-only pan at `controller.ts:638-642, 703-707`.

#### Scenario: HandTool implements Tool interface

- **WHEN** `HandTool` is instantiated
- **THEN** it has `name: 'hand'`
- **THEN** it implements `onPointerDown`, `onPointerMove`, `onPointerUp`

#### Scenario: HandTool pans on drag

- **WHEN** the Hand tool is active and the user drags on the canvas
- **THEN** the camera pans in the direction of the drag
- **THEN** the cursor is `'grabbing'` during drag

#### Scenario: HandTool coexists with spacebar pan

- **WHEN** the Hand tool is NOT active but the user holds spacebar
- **THEN** spacebar pan still works as before
- **THEN** the spacebar shortcut is independent of the active tool

#### Scenario: HandTool cursor

- **WHEN** the Hand tool is active and the user is not dragging
- **THEN** the canvas cursor is `'grab'`
- **WHEN** the user starts dragging with the Hand tool
- **THEN** the canvas cursor is `'grabbing'`

---

### Requirement: Toolbar Universal Row

The system SHALL render Select, Move, and Hand in a fixed universal row above mode-scoped tools in the toolbar.

#### Scenario: Universal row always visible

- **WHEN** any mode is active
- **THEN** the toolbar shows a row with Select, Move, and Hand buttons
- **THEN** the row is visually separated from the mode-scoped row below

#### Scenario: Universal row highlights active tool

- **WHEN** `activeTool` is `'select'`
- **THEN** the Select button in the universal row is highlighted
- **WHEN** `activeTool` is `'hand'`
- **THEN** the Hand button in the universal row is highlighted

#### Scenario: Universal row does not hide on mode switch

- **WHEN** the user switches from grid to annotation mode
- **THEN** the universal row remains visible and unchanged
- **THEN** only the mode-scoped row changes

---

### Requirement: Mode-Scoped Tools

The system SHALL render only tools whose `modes` array includes the active mode in the mode-scoped toolbar row, excluding universal tools.

#### Scenario: Grid mode shows grid-scoped tools

- **WHEN** the active mode is `grid`
- **THEN** the mode-scoped row shows Rectangle, Frame, Image, Text
- **THEN** the mode-scoped row does NOT show Freehand, Arrow, Eraser, Connector

#### Scenario: Annotation mode shows annotation-scoped tools

- **WHEN** the active mode is `annotation`
- **THEN** the mode-scoped row shows Freehand, Arrow, Rectangle, Text, Eraser
- **THEN** the mode-scoped row does NOT show Frame, Image, Connector

#### Scenario: Connector mode shows connector-scoped tools

- **WHEN** the active mode is `connector`
- **THEN** the mode-scoped row shows Connector
- **THEN** if `ConnectorTool` does not exist yet, the row is empty (forward reference)

---

### Requirement: State Machine Orthogonality

The system SHALL keep mode and tool selection orthogonal to the pointer event state machine at `controller.ts:104-108`.

#### Scenario: dragState is unchanged

- **WHEN** the mode or active tool changes
- **THEN** the `dragState` tagged union (`'pan' | 'draw-rect' | 'move-selected'`) is not modified
- **THEN** the state machine transitions are not altered

#### Scenario: Mode determines tool visibility, not drag behavior

- **WHEN** the user draws a rectangle in grid mode vs. annotation mode
- **THEN** the `dragState` is `'draw-rect'` in both cases
- **THEN** the difference is which tool is active and whether snap is applied

#### Scenario: Active tool determines Drawing behavior

- **WHEN** the pointer state machine enters the `Drawing` state
- **THEN** the active tool's `onPointerDown`/`onPointerMove`/`onPointerUp` handlers are invoked
- **THEN** the mode only affects which tools are visible and the snap policy

---

### Requirement: No 11-State Controller

The system SHALL NOT adopt the inspiration repo's 11-state `IInteractionState` pattern wholesale. The existing tagged union at `controller.ts:104-108` SHALL remain the pointer event state machine.

#### Scenario: Existing dragState union is preserved

- **WHEN** the tool registry and mode registry are implemented
- **THEN** `dragState` at `controller.ts:104-108` remains the 3-variant tagged union (`'pan' | 'draw-rect' | 'move-selected'`)
- **THEN** no new state variants are added to `dragState`

#### Scenario: No IInteractionState interface

- **WHEN** a developer searches for `IInteractionState` in the codebase
- **THEN** no such interface exists
- **THEN** no 11-state enum or class is imported from the inspiration repo

#### Scenario: Tool implementations own their drag state

- **WHEN** a tool needs drag state (e.g., `FrameCreateTool` at `frame-tool.ts:14-17`)
- **THEN** the tool manages its own internal state
- **THEN** the controller's `dragState` is not extended for tool-specific states

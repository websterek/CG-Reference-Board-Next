# tool-registry-and-modes — Tasks

## 1. Domain ModeDefinition type

- [x] 1.1 Create `packages/domain/src/modes/registry.ts` with the `ModeDefinition` interface containing all 5 fields: `id`, `displayName`, `toolIds`, `defaultTool`, `snapPolicy`.
- [x] 1.2 Export the `ModeDefinition` type from a barrel file at `packages/domain/src/modes/index.ts` (create if needed).
- [x] 1.3 Add JSDoc comments to each field describing its purpose and valid values.

## 2. Domain mode registry helpers

- [x] 2.1 Populate the registry `Map` with 3 default entries matching the council decision table:
  - `grid`: `toolIds: ['rectangle', 'frame', 'image', 'text']`, `defaultTool: 'select'`, `snapPolicy: 'mandatory'`
  - `annotation`: `toolIds: ['freehand', 'arrow', 'rectangle', 'text', 'eraser']`, `defaultTool: 'freehand'`, `snapPolicy: 'off'`
  - `connector`: `toolIds: ['connector']`, `defaultTool: 'connector'`, `snapPolicy: 'mandatory'`
- [x] 2.2 Set `displayName` for each: `'Grid'`, `'Annotation'`, `'Connector'`.
- [x] 2.3 Implement `getModeDef(id: string): ModeDefinition` — returns the definition or throws for unknown modes.
- [x] 2.4 Implement `getAllModes(): ModeDefinition[]` — returns all registered entries in registration order.
- [x] 2.5 Implement `getToolsForMode(modeId: string): string[]` — returns the union of the mode's `toolIds` and all tools with `alwaysAvailable: true` from the `ToolDefinition` registry. This function imports from the client-side tool registry; if that creates a circular dependency, define it in the client package instead and re-export from a shared location.
- [x] 2.6 Implement `isUniversalTool(toolId: string): boolean` — returns `true` for `'select'`, `'move'`, `'hand'`.

## 3. Client ToolDefinition type

- [x] 3.1 Create `packages/client/src/canvas/tools/registry.ts` with the `ToolDefinition` interface containing all 8 fields: `id`, `displayName`, `modes`, `alwaysAvailable` (optional), `placementLayer` (optional), `snapPolicy` (optional, defaults to `'inherit-mode'`), `factory`, `icon`.
- [x] 3.2 Add JSDoc comments to each field describing its purpose and valid values.
- [x] 3.3 Implement `registerTool(def: ToolDefinition): void` — adds a tool to the registry; throws if `id` already exists.
- [x] 3.4 Implement `getToolDef(id: string): ToolDefinition` — returns the definition or throws for unknown tools.
- [x] 3.5 Implement `getAllTools(): ToolDefinition[]` — returns all registered tools in registration order.
- [x] 3.6 Implement `getToolsForMode(modeId: string): ToolDefinition[]` — returns tools whose `modes` includes `modeId` OR whose `alwaysAvailable` is `true`, in registration order.

## 4. Client tool registry population

- [x] 4.1 Register universal tools with `alwaysAvailable: true`:
  - `select`: `modes: []`, `alwaysAvailable: true`, `placementLayer: undefined`, `snapPolicy: 'inherit-mode'`, `icon: '▦'`
  - `move`: `modes: []`, `alwaysAvailable: true`, `placementLayer: undefined`, `snapPolicy: 'inherit-mode'`, `icon: '↕'`
  - `hand`: `modes: []`, `alwaysAvailable: true`, `placementLayer: undefined`, `snapPolicy: 'exempt'`, `icon: '✋'`
- [x] 4.2 Register grid-scoped tools:
  - `rectangle`: `modes: ['grid', 'annotation']`, `placementLayer: 'media'`, `snapPolicy: 'inherit-mode'`, `icon: '▭'`
  - `frame`: `modes: ['grid']`, `placementLayer: 'frame'`, `snapPolicy: 'inherit-mode'`, `icon: '⊞'`
  - `image`: `modes: ['grid']`, `placementLayer: 'media'`, `snapPolicy: 'inherit-mode'`, `icon: '🖼'`
  - `text`: `modes: ['grid', 'annotation']`, `placementLayer: 'overlay'`, `snapPolicy: 'inherit-mode'`, `icon: 'T'`
- [x] 4.3 Register annotation-scoped tools:
  - `freehand`: `modes: ['annotation']`, `placementLayer: 'annotation'`, `snapPolicy: 'exempt'`, `icon: '✎'`
  - `arrow`: `modes: ['annotation']`, `placementLayer: 'annotation'`, `snapPolicy: 'exempt'`, `icon: '→'`
  - `eraser`: `modes: ['annotation']`, `placementLayer: undefined`, `snapPolicy: 'exempt'`, `icon: '⌫'`
- [x] 4.4 Register connector-scoped tool:
  - `connector`: `modes: ['connector']`, `placementLayer: 'overlay'`, `snapPolicy: 'mandatory'`, `icon: '🔗'`
- [x] 4.5 Wire `factory` for each tool: existing tools (`FrameCreateTool`, `AnnotationFreehandTool`) use their existing constructors; new tools (`HandTool`, `SelectTool`, `MoveTool`, `RectangleTool`, `ImageTool`, `TextTool`, `ArrowTool`, `EraserTool`, `ConnectorTool`) use their constructors or stubs. Tools that don't exist yet (e.g., `ImageTool`, `TextTool`, `ArrowTool`, `EraserTool`, `ConnectorTool`) can have `factory` return a no-op stub or throw a descriptive error until implemented.

## 5. Client HandTool

- [x] 5.1 Create `packages/client/src/canvas/tools/hand-tool.ts` with `HandTool` class implementing the `Tool` interface from `packages/domain/src/tool.ts:45-52`.
- [x] 5.2 `name` is `'hand'`.
- [x] 5.3 `onPointerDown`: record start screen point; set cursor to `'grabbing'`.
- [x] 5.4 `onPointerMove`: if dragging, compute delta from start point and pan the camera via `ToolContext` (may need a `pan(dx, dy)` method added to `ToolContext`, or the tool accesses the controller directly — decide during implementation).
- [x] 5.5 `onPointerUp`: stop dragging; set cursor to `'grab'`.
- [x] 5.6 `onActivate`: set canvas cursor to `'grab'`.
- [x] 5.7 `onDeactivate`: reset canvas cursor to default.
- [x] 5.8 Export `HandTool` from `packages/client/src/canvas/tools/index.ts`.

## 6. Client uiStore migration

- [x] 6.1 Replace `ToolName` union at `uiStore.ts:12` with `type ToolName = string` (or remove the alias and use `string` directly).
- [x] 6.2 Replace `InteractionMode` union at `uiStore.ts:14` with `type InteractionMode = string` (or remove the alias and use `string` directly).
- [x] 6.3 Update `UIState.activeTool` type at `uiStore.ts:17` from `ToolName` to `string`.
- [x] 6.4 Update `UIState.interactionMode` type at `uiStore.ts:20` from `InteractionMode` to `string`.
- [x] 6.5 Add `lastUsedToolPerMode: Record<string, string>` to `UIState` interface.
- [x] 6.6 Add `setLastUsedTool(modeId: string, toolId: string): void` to `UIState`.
- [x] 6.7 Update `setActiveTool` to also update `lastUsedToolPerMode` for the current mode.
- [x] 6.8 Update `setInteractionMode` to implement mode-switch logic:
  - If `activeTool` is universal (`isUniversalTool(activeTool)`), keep it.
  - Else, check `lastUsedToolPerMode[nextMode]`; if found, set `activeTool` to that value.
  - Else, set `activeTool` to `getModeDef(nextMode).defaultTool`.
- [x] 6.9 Update default `activeTool` at `uiStore.ts:31` from `'select'` to `getModeDef('grid').defaultTool` (which is `'select'`).
- [x] 6.10 Update default `interactionMode` at `uiStore.ts:34` from `'grid' as const` to `'grid'`.

## 7. Client activeTool transitions

- [x] 7.1 Implement `resolveActiveToolOnModeSwitch(currentTool: string, nextMode: string, lastUsed: Record<string, string>): string` — returns the tool to activate after a mode switch.
- [x] 7.2 Unit test: universal tool preserved (select → annotation → activeTool is still select).
- [x] 7.3 Unit test: mode-scoped tool reset to default (rectangle → annotation → activeTool is freehand).
- [x] 7.4 Unit test: last-used tool restored (text in annotation → grid → annotation → activeTool is text).
- [x] 7.5 Unit test: first mode entry uses defaultTool (no lastUsed entry → activeTool is defaultTool).

## 8. Client controller dispatch

- [x] 8.1 Update `controller.ts:79` — `activeToolName` type changes from `string` to `string` (no change needed, but verify).
- [x] 8.2 Update `controller.ts:80` — `activeMode` type changes from `'grid' | 'annotation'` to `string`.
- [x] 8.3 Update `controller.ts:710` — `this.toolRegistry.get(this.activeToolName)` dispatch: ensure the tool registry is populated from the `ToolDefinition` registry, not just the hardcoded `initToolRegistry()` at lines 347-350.
- [x] 8.4 Update `initToolRegistry()` at `controller.ts:347-350` to iterate `getAllTools()` from the `ToolDefinition` registry and call `factory()` for each, storing the result in `this.toolRegistry`.
- [x] 8.5 Update `handleToolbarAction()` (or equivalent) to accept the new `ToolbarAction` type with `string` tool and mode values instead of the old union.

## 9. Client Toolbar refactor

- [x] 9.1 Remove mode-conditional tool hiding at `Toolbar.tsx:85-97` (the `{!isGrid && (...)}` block that shows only Freehand in annotation mode).
- [x] 9.2 Remove the `{isGrid && (...)}` wrapper at `Toolbar.tsx:47-83` that conditionally shows Select/Rectangle/Frame.
- [x] 9.3 Add a universal row rendering Select, Move, and Hand buttons. These buttons are always visible regardless of mode.
- [x] 9.4 Add a mode-scoped row below the universal row, rendering tools from `getToolsForMode(interactionMode)` excluding universal tools.
- [x] 9.5 Update `ToolbarAction` type at `Toolbar.tsx:13-16` to use `string` for tool and mode values instead of the old union types.
- [x] 9.6 Update `handleModeToggle` at `Toolbar.tsx:29-33` to cycle through all modes from `getAllModes()` instead of toggling between two hardcoded values.
- [x] 9.7 Update the mode button label at `Toolbar.tsx:44` to show the current mode's `displayName` from the registry.
- [x] 9.8 Update `ToolbarAction` type in `controller.ts:55-58` to match the new `string`-based tool and mode values.

## 10. Client controller mode wiring

- [x] 10.1 Update `controller.ts:80` — `activeMode` is initialized from `getAllModes()[0].id` (which is `'grid'`) instead of the hardcoded `'grid'`.
- [x] 10.2 Update the `set-mode` handler in the controller to accept any mode ID string and validate it against `getModeDef()`.
- [x] 10.3 Ensure the controller's `activeMode` is updated when the toolbar dispatches a `set-mode` action.

## 11. Client controller snapPoint

- [x] 11.1 Update `controller.ts:589-592` — `snapPoint` reads the active mode's `snapPolicy` from `getModeDef(this.activeMode).snapPolicy` instead of hardcoding `this.activeMode === 'annotation'`.
- [x] 11.2 If `snapPolicy` is `'off'`, return the point unchanged (current behavior for annotation mode).
- [x] 11.3 If `snapPolicy` is `'mandatory'`, call `GridService.snapPoint(p, this.grid)` (current behavior for grid mode).
- [x] 11.4 If the active tool has `snapPolicy: 'exempt'`, return the point unchanged regardless of mode `snapPolicy`.
- [x] 11.5 If the active tool has `snapPolicy: 'mandatory'`, call `GridService.snapPoint` regardless of mode `snapPolicy`.

## 12. Domain tests

- [x] 12.1 Unit test: mode registry has exactly 3 default entries with correct values per the council table.
- [x] 12.2 Unit test: `getModeDef('grid')` returns the grid mode definition.
- [x] 12.3 Unit test: `getModeDef('unknown')` throws.
- [x] 12.4 Unit test: `getAllModes()` returns 3 entries in registration order.
- [x] 12.5 Unit test: `isUniversalTool('select')` returns `true`.
- [x] 12.6 Unit test: `isUniversalTool('rectangle')` returns `false`.
- [x] 12.7 Unit test: `resolveActiveToolOnModeSwitch` — universal tool preserved.
- [x] 12.8 Unit test: `resolveActiveToolOnModeSwitch` — mode-scoped tool reset to default.
- [x] 12.9 Unit test: `resolveActiveToolOnModeSwitch` — last-used tool restored.
- [x] 12.10 Unit test: `resolveActiveToolOnModeSwitch` — first entry uses defaultTool.

## 13. Client tool registry tests

- [x] 13.1 Unit test: tool registry has exactly 11 registered tools.
- [x] 13.2 Unit test: `getToolsForMode('grid')` returns 7 tools (4 mode-scoped + 3 universal).
- [x] 13.3 Unit test: `getToolsForMode('annotation')` returns 8 tools (5 mode-scoped + 3 universal).
- [x] 13.4 Unit test: `getToolsForMode('connector')` returns 4 tools (1 mode-scoped + 3 universal).
- [x] 13.5 Unit test: universal tools appear in `getToolsForMode` for every mode.
- [x] 13.6 Unit test: `registerTool()` throws on duplicate `id`.
- [x] 13.7 Unit test: `getToolDef('unknown')` throws.

## 14. Integration tests

- [x] 14.1 Test: toolbar shows universal row (Select/Move/Hand) in grid mode.
- [x] 14.2 Test: toolbar shows universal row (Select/Move/Hand) in annotation mode.
- [x] 14.3 Test: toolbar shows universal row (Select/Move/Hand) in connector mode.
- [x] 14.4 Test: mode-scoped row changes when switching from grid to annotation mode.
- [x] 14.5 Test: switching mode with Select active preserves Select as active tool.
- [x] 14.6 Test: switching mode with Rectangle active resets to annotation's defaultTool (freehand).
- [x] 14.7 Test: last-used tool per mode is remembered across mode switches.
- [x] 14.8 Test: Hand tool pans the camera when dragged.
- [x] 14.9 Test: spacebar pan still works when Hand tool is not active.
- [x] 14.10 Test: snap is enforced in grid mode, disabled in annotation mode, enforced in connector mode.
- [x] 14.11 Test: mode toggle cycles through all 3 modes and wraps around.

## 15. Spec revision

- [x] 15.1 Update `openspec/specs/interaction-modes/spec.md` line 27: replace "Annotation Mode SHALL expose the Free-draw tool only" with the universal tools requirement from the delta spec at `openspec/changes/tool-registry-and-modes/specs/interaction-modes/spec.md`.
- [x] 15.2 Update `openspec/specs/interaction-modes/spec.md` line 13: replace "Two interaction modes" with "Three-Mode Registry" requirement.
- [x] 15.3 Ensure the base spec at `openspec/specs/interaction-modes/spec.md` is consistent with the delta spec after the change is applied.

## 16. Documentation

- [x] 16.1 Create `packages/domain/src/modes/README.md` documenting the mode/tool registry pattern.
- [x] 16.2 Document the `ModeDefinition` interface with field descriptions.
- [x] 16.3 Document the `ToolDefinition` interface with field descriptions.
- [x] 16.4 Document how to add a new mode (one `ModeDefinition` entry).
- [x] 16.5 Document how to add a new tool (one `ToolDefinition` entry with `factory`).
- [x] 16.6 Document the universal tools concept and how `alwaysAvailable` works.
- [x] 16.7 Document the mode→toolset resolution via `getToolsForMode()`.
- [x] 16.8 Document the activeTool transition logic on mode switch.
- [x] 16.9 Document the snap policy resolution order: tool `snapPolicy` overrides mode `snapPolicy`.

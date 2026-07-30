# tool-registry-and-modes — Design

## Context

The GridBoard project currently models interaction modes and tools as closed TypeScript types:

```ts
// packages/client/src/state/uiStore.ts:12-14
export type ToolName = 'select' | 'rectangle' | 'frame' | 'annotation-freehand';
export type InteractionMode = 'grid' | 'annotation';
```

The toolbar at `packages/client/src/ui/Toolbar.tsx:85-97` conditionally hides Select, Frame, and Rectangle in annotation mode:

```tsx
{isGrid && (
  <>
    <button ...>▦</button>  {/* Select */}
    <button ...>▭</button>  {/* Rectangle */}
    <button ...>⊞</button>  {/* Frame */}
  </>
)}
{!isGrid && (
  <button ...>✎</button>  {/* Freehand only */}
)}
```

This violates the principle that Select/Move/Hand should be universal tools present in every mode. The controller at `packages/client/src/canvas/controller.ts` has:

- `activeToolName: string = 'select'` at line 79
- `activeMode: 'grid' | 'annotation' = 'grid'` at line 80
- `toolRegistry` map at line 83, populated at lines 347-350 with only `frame` and `annotation-freehand`
- `snapPoint` at lines 589-592 short-circuits on `activeMode === 'annotation'`
- Spacebar pan at lines 638-642 (keydown) and 703-707 (pointerdown)

The council unanimously recommended a **Mode → Tool set → ActiveTool** hierarchy with universal Select/Move/Hand tools, replacing the flat enum/union model with registries.

## Goals

1. **ModeDefinition registry** — 3 modes (`grid`, `annotation`, `connector`) defined in `packages/domain/src/modes/registry.ts`, replacing the `InteractionMode` enum.
2. **ToolDefinition registry** — 11 tools defined in `packages/client/src/canvas/tools/registry.ts`, each declaring which modes they appear in, their placement layer, snap policy, factory, and icon.
3. **Universal Select/Move/Hand** — these tools are always available, rendered in a fixed universal row above mode-scoped tools in the toolbar.
4. **Hand tool promoted to first-class** — new `HandTool` implementing the `Tool` interface, replacing the spacebar-only pan at `controller.ts:638-642, 703-707`.
5. **Toolbar refactored** — remove mode-conditional hiding (`Toolbar.tsx:85-97`); render universal row + mode-scoped row.
6. **Pointer state machine stays as-is** — the tagged union at `controller.ts:104-108` is not changed. Mode and tool selection are orthogonal to this state machine.

## Non-Goals

- **Invalid-placement UX** — visual feedback for rejected placements is a separate proposal (`invalid-placement-ux`).
- **Connector item type** — the `ConnectorTool` implementation is a separate proposal (`connector-items`). The `connector` mode is referenced here as a forward reference; the mode can exist even if the tool doesn't yet.
- **The 11-state interaction controller** from the inspiration repo — the `IInteractionState` pattern with 11 states is NOT adopted. The existing 3-variant tagged union stays.
- **Tool-owned drag-queue state** — the `queueUpdate` stubs at `controller.ts:386-391` are a separate bugfix, not part of this proposal.
- **Layer registry** — this proposal is orthogonal to the `layer-registry` proposal. The `placementLayer` field on `ToolDefinition` references layer kinds by string, which works with both the current `LayerKind` union and the future registry.

## Decisions

### D1: 3 modes via registry, not enum

The `ModeDefinition` registry replaces the `InteractionMode` enum. Modes are defined as data entries in a `Map<string, ModeDefinition>`, not as TypeScript literal types.

**Rationale**: Adding a mode becomes a single `addMode()` call instead of touching the enum, the toolbar, the controller, and the snap logic. The registry is the single source of truth for mode identity, tool membership, and snap policy.

### D2: Select/Move/Hand are universal, not mode-scoped

Select, Move, and Hand are defined with `alwaysAvailable: true` in their `ToolDefinition` entries. They appear in every mode's toolbar regardless of the mode's `toolIds`.

**Rationale**: Users expect to select, move, and pan in every mode. Hiding Select in annotation mode (current behavior at `Toolbar.tsx:85-97`) is a UX regression. Universal tools are resolved by `getToolsForMode()` which unions mode-scoped `toolIds` with all `alwaysAvailable` tools.

### D3: Hand tool promoted to first-class

The `HandTool` is a new `Tool` implementation in `packages/client/src/canvas/tools/hand-tool.ts`. It handles `onPointerDown`/`onPointerMove`/`onPointerUp` to pan the camera. The spacebar shortcut at `controller.ts:638-642, 703-707` is preserved as an independent shortcut that works regardless of the active tool.

**Rationale**: A first-class Hand tool gives users a visible, clickable pan option in the toolbar. The spacebar shortcut remains for power users. The two mechanisms coexist — spacebar pan is independent of `activeTool`, while Hand tool pan is gated on `activeTool === 'hand'`.

### D4: Pointer state machine stays as tagged union

The `dragState` at `controller.ts:104-108` remains the 3-variant tagged union (`'pan' | 'draw-rect' | 'move-selected'`). No new variants are added. The 11-state `IInteractionState` pattern from the inspiration repo is NOT adopted.

**Rationale**: The existing state machine is simple, well-understood, and sufficient. Mode and tool selection are orthogonal concerns — mode determines which tools are visible, active tool determines what happens in the `Drawing` state. Adding 11 states would increase complexity without proportional benefit.

### D5: Mode and tool orthogonal to state machine

Mode determines tool visibility and snap policy. Active tool determines pointer event handling. The state machine (`dragState`) is unaware of modes — it only knows about pointer events and the active tool.

**Rationale**: Separation of concerns. The state machine handles low-level pointer tracking. Mode and tool selection are higher-level UI concerns. Keeping them orthogonal means the state machine never needs to change when modes or tools are added.

### D6: Tool interface unchanged

The `Tool` interface at `packages/domain/src/tool.ts:45-52` is not modified. `HandTool` implements the same interface as `FrameCreateTool` and `AnnotationFreehandTool`.

**Rationale**: The `Tool` interface is already sufficient. It has `onPointerDown`/`onPointerMove`/`onPointerUp`/`onKeyDown` and lifecycle hooks (`onActivate`/`onDeactivate`). No new methods are needed for the hand tool or the registry pattern.

### D7: Last-used tool per mode stored in UI state

The `uiStore` gains a `lastUsedToolPerMode: Record<string, string>` map. When switching modes, if the active tool is universal, it is preserved. If mode-scoped, the system checks `lastUsedToolPerMode[modeId]`; if found, that tool is activated; otherwise the mode's `defaultTool` is used.

**Rationale**: Users switching between modes should not lose their place. If they were using the Text tool in annotation mode, switching to grid and back should restore Text. This is a quality-of-life feature that costs a small map in Zustand.

## Risks

### R1: Toolbar layout change

**Risk**: Adding a universal row above the mode-scoped row changes the toolbar's visual layout. Users accustomed to the current single-row toolbar may need time to adjust.

**Mitigation**: The universal row is visually separated from the mode-scoped row (e.g., a divider or spacing). The universal row is compact (3 buttons: Select, Move, Hand). The mode-scoped row is below it, clearly labeled or visually grouped.

### R2: Tool registration order

**Risk**: If tools are registered in the wrong order, the toolbar may render them in an unexpected sequence.

**Mitigation**: The `ToolDefinition` registry is an ordered data structure (array or `Map` with insertion order). Tools are registered in the desired display order. The toolbar iterates the registry in registration order. Tests verify the order.

### R3: Backward compatibility

**Risk**: Existing code that references `InteractionMode` or `ToolName` types will break when those types are removed from `uiStore.ts`.

**Mitigation**: The 3 default modes (`grid`, `annotation`, `connector`) include the 2 existing modes. The `grid` mode's `toolIds` include `rectangle` and `frame` (existing tools). The `annotation` mode's `toolIds` include `freehand` (existing tool). Existing board behavior is preserved. The `connector` mode is additive.

### R4: Connector mode forward reference

**Risk**: The `connector` mode references `ConnectorTool` from the `connector-items` proposal, which may not be implemented yet. If the mode exists but the tool doesn't, the mode-scoped row will be empty.

**Mitigation**: The `connector` mode is registered with `toolIds: ['connector']`. If `ConnectorTool` is not yet registered in the `ToolDefinition` registry, `getToolsForMode('connector')` returns only universal tools. The mode is functional (universal tools work) but has no creation tools. This is acceptable as a forward reference.

### R5: Hand tool vs. spacebar pan conflict

**Risk**: If both the Hand tool and spacebar pan are active simultaneously, they could conflict (e.g., Hand tool active + spacebar held).

**Mitigation**: Spacebar pan takes precedence. The controller's `installInputHandlers` checks `this.spacebar` before dispatching to the tool registry (as it does now at `controller.ts:703-707`). If spacebar is held, the drag state is set to `'pan'` and the tool registry is not consulted. The Hand tool only pans when it is the active tool AND spacebar is not held.

## Trade-offs

### Registry complexity vs. enum simplicity

**Trade-off**: A registry module with `ModeDefinition` (5 fields), `ToolDefinition` (8 fields), helper functions, and runtime resolution is more complex than a 2-value enum and 4-value union.

**Choice**: Accept the complexity. The current model is simple but brittle — every new mode or tool is a multi-file breaking change. The registry pays a one-time complexity cost for permanent extensibility. The `layer-registry` proposal makes the same trade-off for the same reason.

### Universal tools vs. mode-specific tools

**Trade-off**: Making Select/Move/Hand universal means they appear in every mode, even modes where they may not be the primary interaction (e.g., connector mode where the primary tool is Connector).

**Choice**: Universal tools are always available. Users expect to select, move, and pan in every context. The mode's `defaultTool` determines the initial active tool, but users can always switch to Select/Move/Hand. This matches user preference #5.

### First-class hand vs. spacebar-only

**Trade-off**: A first-class Hand tool adds a toolbar button and a `Tool` implementation. Spacebar-only pan is simpler and already works.

**Choice**: Both. The Hand tool is a visible, discoverable pan option for new users. Spacebar pan is preserved for power users. The two mechanisms coexist without conflict (spacebar takes precedence).

### 3 modes vs. 2 modes

**Trade-off**: Adding a `connector` mode increases the number of modes from 2 to 3, which means more mode-switching for users.

**Choice**: 3 modes provide better conceptual grouping. Grid mode is for structured items, annotation mode is for freeform markup, connector mode is for relationship lines. The mode toggle cycles through all 3. Users who don't need connectors can ignore the third mode.

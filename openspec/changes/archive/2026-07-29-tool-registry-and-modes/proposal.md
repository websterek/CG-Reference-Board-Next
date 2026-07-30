# tool-registry-and-modes

## Why

The current interaction model has two tightly coupled problems:

1. **`InteractionMode` is a 2-value enum** (`'grid' | 'annotation'` at `packages/client/src/state/uiStore.ts:14`). Adding a third mode (e.g., `connector` from the `connector-items` proposal) requires touching the enum, the toolbar, the controller, and the snap logic — a multi-file breaking change.

2. **`ToolName` is a 4-value union** (`'select' | 'rectangle' | 'frame' | 'annotation-freehand'` at `uiStore.ts:12`). The toolbar hides Select, Frame, and Rectangle in annotation mode (`Toolbar.tsx:85-97`), violating user preference #5: Select/Move/Hand should be universal tools present in every mode. The current model conflates "which tools exist" with "which mode shows which tools."

The council unanimously recommends a **Mode → Tool set → ActiveTool** hierarchy with universal Select/Move/Hand tools, replacing the flat enum/union model with registries.

## What Changes

- **Replace `InteractionMode` enum** with a `ModeDefinition` registry (3 modes: `grid`, `annotation`, `connector`) in a new `packages/domain/src/modes/registry.ts` module.
- **Add `ToolDefinition` registry** in a new `packages/client/src/canvas/tools/registry.ts` module, defining which tools appear in which modes, their placement layers, snap policies, and icons.
- **Make Select/Move/Hand universal** — present in every mode's toolbar, not hidden by mode switching.
- **Add `hand` tool** — currently pan is spacebar-only at `controller.ts:638-642, 703-707`. Promote to a first-class `HandTool` with its own `Tool` implementation.
- **Remove toolbar's mode-conditional tool hiding** — `Toolbar.tsx:85-97` is deleted. The toolbar renders a universal row (Select/Move/Hand) above a mode-scoped row.
- **Mode swap preserves universal activeTool** — if the active tool is universal when switching modes, keep it; otherwise reset to the mode's `defaultTool`.
- **Pointer event state machine stays as-is** — the tagged union at `controller.ts:104-108` (`dragState`) is not changed. Mode and tool selection are orthogonal to this state machine.

## New Capabilities

- **`tool-registry`** — `ToolDefinition` interface (8 fields), `ModeDefinition` interface (5 fields), 3 default modes, universal tools (Select/Move/Hand), mode→toolset resolution via `getToolsForMode()`, activeTool state transitions, `HandTool` for first-class panning.

## Modified Capabilities

- **`interaction-modes`** — Replace 2-mode enum with 3-mode registry. Define universal tools. Add mode→toolset→activeTool hierarchy. Remove "Annotation Mode SHALL expose the Free-draw tool only" requirement (spec.md line 27).

## Impact

| File | Change |
|---|---|
| `packages/domain/src/modes/registry.ts` | **New file** — `ModeDefinition` interface, 3 default entries, `getModeDef()`, `getAllModes()`, `getToolsForMode()` |
| `packages/client/src/canvas/tools/registry.ts` | **New file** — `ToolDefinition` interface, tool registration for all 11 tools |
| `packages/client/src/canvas/tools/hand-tool.ts` | **New file** — `HandTool` implementing `Tool` for panning |
| `packages/client/src/state/uiStore.ts` | Replace `InteractionMode` union with mode registry consumer; replace `ToolName` union with `string`; add `lastUsedToolPerMode` map |
| `packages/client/src/ui/Toolbar.tsx` | Remove mode-conditional hiding (lines 85-97); add universal row (Select/Move/Hand) above mode-scoped row |
| `packages/client/src/canvas/controller.ts` | `activeMode` and `activeToolName` dispatch on `(mode, tool)`; `snapPoint` uses mode's `snapPolicy` from registry; `initToolRegistry` populates from `ToolDefinition` registry |
| `openspec/specs/interaction-modes/spec.md` | Replace "Annotation Mode SHALL expose the Free-draw tool only" with universal tools requirement |

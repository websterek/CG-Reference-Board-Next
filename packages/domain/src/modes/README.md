# Mode & Tool Registries

The GridBoard client renders two registries that drive the entire toolbar and
most of the canvas's interaction model:

- **`ModeDefinition`** (`packages/domain/src/modes/registry.ts`) — what the user
  sees as a "mode" (Grid, Annotation, Connector). Owns the snap policy and the
  default tool for that mode.
- **`ToolDefinition`** (`packages/client/src/canvas/tools/registry.ts`) — every
  tool the user can pick, plus a `factory` that builds the runtime instance.

Both registries are runtime data structures (`Map` + insertion-ordered
helpers), not TypeScript enums. Adding a new mode or a new tool is a single
registry entry — no union types or compile-time lists to maintain.

## `ModeDefinition` — what a mode is

```ts
interface ModeDefinition {
  readonly id: string;             // stable identifier, e.g. 'grid'
  readonly displayName: string;    // toolbar label, e.g. 'Grid'
  readonly toolIds: readonly string[]; // mode-scoped tools (no universal)
  readonly defaultTool: string;    // first entry / reset target
  readonly snapPolicy: 'mandatory' | 'off';
}
```

| Field          | Meaning                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `id`           | Primary key. Used in `uiStore.interactionMode` and as the `set-mode` action payload.              |
| `displayName`  | Label on the mode toggle button.                                                                 |
| `toolIds`      | Tools that ONLY appear in this mode. Universal tools (Select/Move/Hand) are NOT listed here.     |
| `defaultTool`  | What `activeTool` becomes on first entry to this mode, or after switching from a non-universal. |
| `snapPolicy`   | `'mandatory'` quantizes points; `'off'` passes them through. Per-tool overrides take precedence. |

Three default modes are registered at module load in registration order:
`grid`, `annotation`, `connector`. The toggle cycles through them in order and
wraps from the last back to the first.

## `ToolDefinition` — what a tool is

```ts
interface ToolDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly modes: readonly string[];        // empty for universal tools
  readonly alwaysAvailable?: boolean;       // true for Select/Move/Hand
  readonly placementLayer?: string;         // 'media' | 'frame' | 'overlay' | 'annotation'
  readonly snapPolicy?: 'inherit-mode' | 'mandatory' | 'exempt';
  readonly factory: () => Tool;             // constructs the runtime instance
  readonly icon: string;                    // single-glyph label
}
```

| Field            | Meaning                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `id`             | Primary key. Used in `uiStore.activeTool`.                                                       |
| `modes`          | Mode IDs this tool appears in. Empty for universal tools.                                         |
| `alwaysAvailable`| `true` makes the tool appear in EVERY mode's toolbar regardless of `modes`. Reserved for Select/Move/Hand. |
| `placementLayer` | Which PixiJS layer new items are routed to. Omit for tools that don't create items.               |
| `snapPolicy`     | `'inherit-mode'` (default), `'exempt'` (skip snap), or `'mandatory'` (force snap).               |
| `factory`        | Called once at controller init; result is stored in the controller's `toolRegistry`.              |
| `icon`           | Single-character glyph shown on the toolbar button.                                              |

## Adding a new mode

Add ONE entry to `populateDefaultToolRegistry`'s neighbor — `registry.ts` in
`packages/domain/src/modes/`. The mode appears in the toolbar's toggle cycle
immediately:

```ts
register({
  id: 'wireframe',
  displayName: 'Wireframe',
  toolIds: ['wireframe-rectangle', 'wireframe-line'],
  defaultTool: 'wireframe-rectangle',
  snapPolicy: 'mandatory',
});
```

Then register at least one `ToolDefinition` whose `modes` array includes the
new mode ID, or the mode-scoped row will be empty (the universal row still
works).

## Adding a new tool

Add ONE entry to `packages/client/src/canvas/tools/population.ts`:

```ts
registerTool({
  id: 'wireframe-rectangle',
  displayName: 'Wireframe Rectangle',
  modes: ['wireframe'],
  placementLayer: 'media',
  snapPolicy: 'inherit-mode',
  factory: () => new WireframeRectangleTool(),
  icon: '◻︎',
});
```

For tools that are not implemented yet, return a `StubTool` from the factory —
calling `onPointerDown`/`onPointerMove`/`onPointerUp` will throw a descriptive
error rather than silently no-op. This surfaces missing implementations at
runtime instead of letting them hide.

## Universal tools — Select, Move, Hand

Three tools are flagged `alwaysAvailable: true`:

- **Select** — pick and manipulate items. The controller handles the logic
  directly; the registry entry's factory returns a no-op `Tool`.
- **Move** — alias for Select+drag. Same situation.
- **Hand** — first-class pan: drag on the canvas pans the camera. Coexists
  with spacebar pan, which still works regardless of active tool.

Universal tools are excluded from every mode's `toolIds`. They are resolved
separately by `getToolsForMode()` so they appear in the universal toolbar row
regardless of the mode. When switching modes, universal tools are preserved
on `activeTool`; mode-scoped tools are reset to the new mode's `defaultTool`.

## `getToolsForMode()` — mode → toolset resolution

`getToolsForMode(modeId)` returns the union of:

1. The mode's `toolIds` (mode-scoped creation tools).
2. Tools with `alwaysAvailable: true` (Select/Move/Hand).

Result is in registration order, which matches toolbar display order. The
controller iterates this and calls `factory()` on each entry once at init.
The toolbar splits the result into two visual rows: universal first, then
mode-scoped.

## `activeTool` transitions on mode switch

`uiStore.setInteractionMode(nextMode)` calls
`resolveActiveToolOnModeSwitch(activeTool, nextMode, lastUsed)`:

1. If `activeTool` is universal → preserve it. Universal tools work in every
   mode.
2. Else if `lastUsed[nextMode]` exists and differs from `activeTool` →
   restore it. This remembers the user's most recent pick per mode.
3. Else → fall back to `nextMode`'s `defaultTool`.

Meanwhile, `setActiveTool(tool)` writes to `lastUsedToolPerMode[currentMode]`
so a future return to that mode restores the user's pick.

## Snap policy resolution order

When `snapPoint(point)` runs on the controller:

1. If the active tool's `snapPolicy` is `'exempt'` → return the point
   unchanged (skip snap).
2. Else if the active tool's `snapPolicy` is `'mandatory'` → call
   `GridService.snapPoint(point, grid)`.
3. Else (tool policy is `'inherit-mode'`) → check the mode's `snapPolicy`:
   - `'off'` → return the point unchanged.
   - `'mandatory'` → call `GridService.snapPoint(point, grid)`.

The mode's policy is the default; the tool's policy is the override. This lets
a tool like Freehand (`snapPolicy: 'exempt'`) skip snap in any mode, and a
tool like Connector (`snapPolicy: 'mandatory'`) snap in any mode.
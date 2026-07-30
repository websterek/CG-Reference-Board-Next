# perf-panning-and-large-boards

> **Status:** Draft (proposal)
> **Scope:** Restore 60 FPS panning on boards with hundreds to thousands of elements, while keeping frame creation smooth and not regressing collab correctness or rendering correctness.

## Problem

Hand-tool panning is choppy on boards with many items. Frame creation is smooth. The bottleneck is per-frame work that fires on every camera change.

### Measured hotspots (with code refs)

| # | Hotspot | Where | Cost | Why it matters for pan |
|---|---------|-------|------|------------------------|
| 1 | **React re-renders the entire chrome on every pan frame** | `packages/client/src/app/BoardPage.tsx:40,106,160–190` | O(chrome) per pan frame | `controller.onRender(setMinimap)` feeds a `useState` setter → React commits a re-render of `BoardPage`, which re-renders `ModeTabs`, `ToolsToolbar`, `UserPanel`, `MinimapPanel`. With 60 pan frames/sec on a board with hundreds of items, this is constant GC pressure + reconciliation. |
| 2 | **Minimap snapshot allocates O(N) per pan frame** | `packages/client/src/canvas/controller.ts:677–694` (buildMinimapSnapshot) | O(items) per pan frame, plus a fresh array + listener fan-out | The snapshot iterates every item in `this.items` and pushes a new `MinimapItemSnapshot`. `notifyRender` then allocates another fresh snapshot inside the rAF flush when only the camera moved. |
| 3 | **`updateItem` destroys + recreates the display Container** | `packages/client/src/canvas/controller.ts:371–427` | O(display rebuild) per item move | Pan doesn't call this directly, but selection-drag does. On a 1000-item board, dragging any selected item invokes `updateItem` per frame; each call rebuilds the entire `Container` (sprite/graphics) and recurses through every connector. |
| 4 | **`updateItem` scans every item to find affected connectors** | `packages/client/src/canvas/controller.ts:417–425` | O(items) per item move | Per drag-frame, we linearly scan `this.items` to find connectors touching the moved endpoint. With 1000 items and 50 connectors, that's 50k iterations per frame. |
| 5 | **`renderGhost` re-runs Graphics clear + rebuild per pointermove** | `packages/client/src/canvas/controller.ts:1042–1104` | O(1) but per-frame allocations + draw calls | During a drag preview the Graphics is cleared and rebuilt on every pointermove; an idempotent redraw via `requestUpdate()` is cheaper. |
| 6 | **`renderResizeHandles` destroys + recreates 4 Graphics per selected item per move** | `packages/client/src/canvas/controller.ts:1125–1154` | O(selected) per frame | Drag loop calls this every frame; one fresh `Graphics` per selected item is allocated and the old ones are destroyed. |
| 7 | **`Application` init misses PixiJS v8 perf hooks** | `packages/client/src/canvas/controller.ts:252–259` | one-time, but real | No `gcActive`, no `gcMaxUnusedTime`, no `gcFrequency`, no `CullerPlugin` registration, no `cacheAsTexture` on the selection / ghost layer, `antialias: true` is on by default. |
| 8 | **Drag-loop `updateItem` is the only way the controller learns about item moves** | `packages/client/src/canvas/controller.ts:2017–2071` (handles pointermove) | O(items × connectors) per drag frame | Every pointermove during a drag calls `updateItem` per selected item — which already triggers the O(items) connector scan. Drag should update `Container.position` directly and defer display rebuild. |

The frame-creation path is smooth because creating items doesn't fan out to React or to a per-frame snapshot.

### Why frame-creation is smooth and pan is not

- Frame creation runs `addItem → renderItemDisplay → addItemToLayer` once, no React involvement, no minimap rebuild beyond a single notify.
- Pan runs (per rAF): `applyCamera` (cheap), `redrawGrid` (rAF-coalesced, only on field crossing — already correct), `notifyRender` → `buildMinimapSnapshot` (O(N)) → `setMinimap` (React re-render) → minimap `<canvas>` repaint with full state.

The dominant cost is (1) + (2). At ~1000 items, the minimap `<canvas>` redraw alone (clearRect, per-item fillRect) is multiple ms even when no items moved.

## Goals

1. **Hand-tool panning sustains 60 FPS on boards with 1000+ items.** Frame budget per pan frame: ≤ 4 ms main thread for non-render work.
2. **Minimap updates lag camera by ≤ 1 frame** and skip when no visible change occurred (zoom, item added/moved/removed, or pan beyond a small threshold).
3. **Selection drag of a single item sustains 60 FPS even with 1000 items and 100 connectors.** Direct Container transform; no display rebuild.
4. **React chrome never re-renders on pan/zoom.** One subscription pattern for minimap updates that bypasses `useState`.
5. **No regression to frame-creation, collab correctness, or rendering output.**

## Non-goals

- New item types, new tools, new permissions, new Yjs semantics.
- Replacing PixiJS, React, or Yjs.
- Touching `packages/domain` semantics (the `ItemTypeDefinition` registry, schemas, layer kinds) — domain stays the contract; only the rendering pipeline adapts.
- A general move to Virtual DOM for canvas content (already forbidden by design.md D5).

## Proposed solution (high level)

Five changes, ordered by impact. Each is independently testable and reversible.

1. **Decouple minimap updates from React state.** Subscribe with `useSyncExternalStore` so React commits only when the snapshot reference changes, and stop rebuilding the snapshot when nothing relevant moved (camera delta below a threshold).
2. **Stop rebuilding the minimap snapshot on every pan frame.** Diff against the last-emitted snapshot; emit only on real change. Build it lazily inside `notifyRender`.
3. **Make `updateItem` cheap for the common case: position/size change only.** Add an `updateDisplayPosition(container, item)` fast path that mutates `position`, `scale`, and the container's geometry; only call `renderItemDisplay` when shape, attrs, or type change.
4. **Index connectors by endpoint.** Build a `Map<ItemId, Set<connectorId>>` (endpoint index) so `updateItem` can touch only the connectors that reference the moved item. Maintain the index on add/remove and during `updateItem`'s connector-reconciliation loop.
5. **PixiJS Application init perf hooks.** Register `CullerPlugin`, set GC knobs, enable `cacheAsTexture` on the static selection/ghost layers, and switch `antialias: true → false` (we draw geometric shapes — they don't need MSAA).

## Acceptance criteria

- `controller.test.ts` continues to pass with the same coverage. New tests cover: minimap notify suppression, connector endpoint index, and `updateDisplayPosition` fast path.
- A synthetic panning benchmark (`pnpm test -- --run perf/panning`) sustains 60 FPS (no dropped frames over a 10-second simulated hand drag) on a board with 1000 items, 50 connectors, and a viewport of 1920×1080.
- Drag of a single selected item on the same 1000-item board sustains 60 FPS during the drag and emits exactly one Yjs update per gesture (not per frame).
- Chrome (`ModeTabs`, `ToolsToolbar`, `UserPanel`) never re-render during a pan/zoom gesture (verified by a render-count assertion in a new test).
- Manual smoke test: open `/board/<id>` with 1000 items, hand-pan, see no frame drops; minimap viewport rect tracks camera smoothly with at most one frame of lag.

## Risks

- **`useSyncExternalStore` teardown**: a buggy unsubscribe could leak. Mitigation: wrap with a `useEffect` that always calls the returned unsub on cleanup; add a unit test that mounts/unmounts and asserts the listener set is empty.
- **Snapshot-diff vs identity**: the new `notifyRender` must guarantee reference inequality on real change. We will compare structural fields by reference (camera object, items array) — using a fresh `items` array on item mutation ensures React detects change.
- **`cacheAsTexture` on the selection layer**: it renders the selection rect + handles to a texture; resizing selection must call `updateCacheTexture()`. We won't cache it initially — the perf win from `antialias:false` + GC + Culler is already large. `cacheAsTexture` is an opt-in if profiling shows it's still needed.
- **Connector endpoint index must be consistent with `this.items`**: rebuild on `hydrateItems`, `addItem`, `removeItem`. A new test will exhaustively verify.

## Alternatives considered

- **Replace `useState` minimap with imperative DOM (canvas) writes from the controller.** Rejected — couples the controller to the DOM and breaks the existing snapshot contract that tests rely on.
- **Throttle React updates with a custom coalescer.** Rejected — `useSyncExternalStore` already does this correctly; custom coalescing is error-prone.
- **Render-only mutation (skip connector rebuild on drag).** Rejected as a primary fix because it loses the contract that `updateItem` always re-renders dependents. The endpoint index keeps the contract but at O(connectors-touching-item) cost.
- **Move PixiJS rendering off the main thread via OffscreenCanvas.** Deferred — out of scope for "smooth panning". Can be a follow-up change.
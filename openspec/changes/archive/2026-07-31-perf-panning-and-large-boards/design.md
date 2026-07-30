# perf-panning-and-large-boards — design

> **Companion to:** `proposal.md`
> **Scope:** Five ordered changes to restore 60 FPS panning on 1000+ item boards. Each change is independently mergeable and reversible.

## Architecture rules (unchanged)

Per `AGENTS.md`:

- Canvas state lives in `CanvasController` + Yjs, **not** in Zustand.
- The grid, scene model, camera, tools, selection, layers, history, and serialization are application-owned modules independent of React and PixiJS.
- Render only visible items; avoid React components per canvas object.
- Item types are added via the typed `ItemTypeDefinition` registry.

These rules still hold. The only addition is: **React ↔ controller subscriptions go through `useSyncExternalStore` so the React commit boundary never fires per pan frame**.

---

## Change 1 — Decouple minimap updates from React `useState`

### Why

`packages/client/src/app/BoardPage.tsx:40` declares `const [minimap, setMinimap] = useState<MinimapSnapshot | null>(null)` and passes `setMinimap` to `controller.onRender` at line 106. Every pan frame, the controller's rAF flush calls `notifyRender` → `setMinimap(new snapshot)` → React schedules a re-render of `BoardPage`. The render re-evaluates `BoardPage`'s JSX, re-evaluates the `minimapItems` mapping at line 160, and re-renders every child including `ToolsToolbar`, `ModeTabs`, `UserPanel`, and `MinimapPanel` (none of which depend on the camera).

### What

Use `useSyncExternalStore` to subscribe BoardPage to the controller's minimap snapshot. `useSyncExternalStore` already de-dupes by `Object.is` on the snapshot reference, so equal references cause no commit.

```tsx
// BoardPage.tsx (replace lines 40, 106, 160)
import { useSyncExternalStore } from 'react';

const minimap = useSyncExternalStore(
  controllerRef.current.subscribeMinimap.bind(controllerRef.current),
  controllerRef.current.getMinimapSnapshot.bind(controllerRef.current),
);
// ...
// Stable identity for items the panel doesn't depend on:
// useSyncExternalStore guarantees the second arg is the value; the
// controller returns the same ref when nothing changed.
```

### New controller API

```ts
// CanvasController (add new public methods)
subscribeMinimap(listener: () => void): () => void {
  // Wraps the existing render-listeners Set; the listener is called
  // when the snapshot changes. The snapshot identity is the contract.
}

getMinimapSnapshot(): MinimapSnapshot {
  // Returns the *current* cached snapshot. Does not build a new one.
}
```

The existing `onRender(listener)` API stays for tests and any imperative consumers. `subscribeMinimap` is the React-friendly adapter.

### Identity contract

- The controller caches `lastEmittedSnapshot` and returns the **same reference** when nothing relevant has changed.
- "Relevant" = camera moved by more than 0.5 board units OR zoom changed OR items map mutated (add/remove/update with shape change).
- The internal `items: MinimapItemSnapshot[]` is **immutable between emits**. Mutation paths (`addItem`, `removeItem`, `updateItem`) construct a fresh `items` array.

---

## Change 2 — Stop rebuilding the snapshot on every pan frame

### Why

`buildMinimapSnapshot` at `controller.ts:677–694` runs on every rAF flush when only the camera changed. With 1000 items, allocating 1000 `MinimapItemSnapshot` objects per frame is pure waste.

### What

Add a delta threshold and a dirty flag.

```ts
private cameraDeltaSinceMinimap = 0; // sum of |dx|+|dy|
private lastMinimapCameraX = 0;
private lastMinimapCameraY = 0;
private lastMinimapZoom = 1;

private shouldEmitMinimap(): boolean {
  // Emit if zoom changed
  if (this.camera.zoom !== this.lastMinimapZoom) return true;
  // Emit if camera moved more than 0.5 board units since last emit
  const dx = Math.abs(this.camera.x - this.lastMinimapCameraX);
  const dy = Math.abs(this.camera.y - this.lastMinimapCameraY);
  return dx + dy > 0.5;
}

private emitMinimap(): void {
  this.lastMinimapCameraX = this.camera.x;
  this.lastMinimapCameraY = this.camera.y;
  this.lastMinimapZoom = this.camera.zoom;
  const snap = this.buildMinimapSnapshot();
  this.lastEmittedSnapshot = snap;
  for (const l of this.renderListeners) l(snap);
}
```

Replace the existing `notifyRender()` call site in `scheduleCameraFlush` (line 1291) with a guarded call:

```ts
// was:
//   this.notifyRender();
// becomes:
if (this.shouldEmitMinimap()) this.emitMinimap();
```

Item mutations (`addItem`, `removeItem`, `updateItem`) still call `emitMinimap()` unconditionally.

### Acceptance

- During a 5-second pan at 60 FPS on a 1000-item board, the controller emits **at most ~60** snapshots (one per ~16ms), not one per frame in which the camera moved by < 0.5 units.
- Test: assert that 1000 pan events with delta < 0.5 produce zero emits.

---

## Change 3 — `updateItem` fast path for transform-only changes

### Why

`updateItem` at `controller.ts:371–427` is called for every item move, every drag-frame, every connector endpoint move. It currently:

1. Removes the old `Container` from its layer (`oldLayer.removeChild(oldDisplay)`).
2. Calls `oldDisplay.destroy({ children: true })`.
3. Calls `renderItemDisplay(next)` to build a fresh `Container` from scratch (allocates a new `Graphics` for rectangles, a new `Sprite` for images, a new `path` `Graphics` for connectors, and a new arrowhead / pin `Graphics` for connectors).
4. Re-adds the fresh Container to its layer.

At 1000 items, dragging a single selected item does this for the moved item *and* for every connector touching it. The destroy/recreate also leaves the layer container with a stale child list to update.

### What

Inline a `position.set(...)` fast path inside `updateItem`; the full destroy+recreate path stays for type/attrs/shape changes. Connector endpoint reconciliation is handled by `endpointIndex` (Change 4) after the transform branch.

```ts
// Updated updateItem (lines 371-427)
updateItem(id: string | ItemId, partial: Partial<BoardItem> | BoardItem): void {
  this.mutationDepth++;
  const idItem = asItemId(String(id));
  const prev = this.items.get(idItem);
  if (!prev) {
    this.endMutation();
    return;
  }
  const next: BoardItem =
    'id' in partial && partial.id === idItem
      ? (partial as BoardItem)
      : ({ ...prev, ...(partial as Partial<BoardItem>) } as BoardItem);

  // Re-index connector endpoints if attrs.from/attrs.to changed
  if (prev.type === 'connector' || next.type === 'connector') {
    const prevAttrs = prev.attrs as { from?: string; to?: string };
    const nextAttrs = next.attrs as { from?: string; to?: string };
    if (prevAttrs.from !== nextAttrs.from || prevAttrs.to !== nextAttrs.to) {
      this.unindexConnector(idItem, prev);
      this.indexConnector(idItem, next);
    }
  }

  this.items.set(idItem, next);
  this.index.update(next, layerKindFor(next.type));

  // Detect: did anything besides x/y/width/height change?
  const isTransformOnly =
    next.type === prev.type &&
    next.layerId === prev.layerId &&
    next.rotation === prev.rotation &&
    next.zIndex === prev.zIndex &&
    this.shallowAttrsEqual(prev.attrs, next.attrs);

  const oldDisplay = this.displayById.get(idItem);
  if (isTransformOnly && oldDisplay) {
    // FAST PATH: mutate in place. Container.position is the only
    // layout dependency for non-connectors. For connectors, the
    // container origin translates the path Graphics; the path itself
    // is derived from endpoint anchors and is rebuilt by the
    // endpoint-index reconciliation below.
    oldDisplay.position.set(next.x, next.y);
  } else {
    // SLOW PATH: full rebuild
    if (oldDisplay) {
      const oldKind = layerKindFor(prev.type);
      const oldLayer = this.layerContainers.get(oldKind);
      if (oldLayer) oldLayer.removeChild(oldDisplay);
      oldDisplay.destroy({ children: true });
    }
    const fresh = this.renderItemDisplay(next);
    fresh.position.set(next.x, next.y);
    this.addItemToLayer(fresh, next);
    this.displayById.set(idItem, fresh);
  }

  // Endpoint tracking: use the endpoint index to find connectors
  // that reference this item, and re-render them via the same path.
  const connectors = this.endpointIndex.get(idItem);
  if (connectors && connectors.size > 0) {
    for (const otherId of connectors) {
      const otherItem = this.items.get(otherId);
      if (!otherItem || otherItem.type !== 'connector') continue;
      this.updateItem(otherId, otherItem);
    }
  }
  this.endMutation();
}

private shallowAttrsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}
```

### What stays the same

- `removeItem` still destroys the display.
- `addItem` still calls `renderItemDisplay` (no prior display to mutate).
- `updateItem` callers don't need to change — the API is identical.

### Test surface

- New test in `controller.test.ts`: `updateItem` with `{ x, y }` only does not destroy the display Container (assert by spying on `displayById.get(id).destroy` — must not be called).
- New test: changing `attrs` (e.g. rectangle color) does destroy + rebuild.
- Existing tests continue to pass.

---

## Change 4 — Connector endpoint index

### Why

`updateItem` at `controller.ts:417–425` linearly scans `this.items` to find connectors that reference the moved item. On a 1000-item board with 100 connectors, that's 100k iterations per drag-frame.

### What

Maintain `endpointIndex: Map<ItemId, Set<ItemId>>` mapping `endpoint → connectors`. The map is rebuilt in `hydrateItems`, mutated on `addItem`, `removeItem`, and `updateItem`'s connector-reconciliation.

```ts
private endpointIndex = new Map<ItemId, Set<ItemId>>();

private indexConnector(id: ItemId, item: BoardItem): void {
  const attrs = item.attrs as { from?: string; to?: string };
  if (!attrs.from && !attrs.to) return;
  for (const ep of [attrs.from, attrs.to]) {
    if (!ep) continue;
    const epId = asItemId(ep);
    let s = this.endpointIndex.get(epId);
    if (!s) {
      s = new Set();
      this.endpointIndex.set(epId, s);
    }
    s.add(id);
  }
}

private unindexConnector(id: ItemId, item: BoardItem): void {
  const attrs = item.attrs as { from?: string; to?: string };
  for (const ep of [attrs.from, attrs.to]) {
    if (!ep) continue;
    const epId = asItemId(ep);
    const s = this.endpointIndex.get(epId);
    if (s) {
      s.delete(id);
      if (s.size === 0) this.endpointIndex.delete(epId);
    }
  }
}
```

Update `addItem`, `removeItem`, and `updateItem`'s connector-reconciliation loop:

```ts
// updateItem — replace the O(items) connector scan (lines 417-425)
const connectors = this.endpointIndex.get(idItem);
if (connectors && connectors.size > 0) {
  for (const otherId of connectors) {
    const otherItem = this.items.get(otherId);
    if (!otherItem || otherItem.type !== 'connector') continue;
    // Trigger the same update logic on the connector so its path
    // is rebuilt with the new endpoint positions.
    this.updateItem(otherId, otherItem);
  }
}
```

Recursion guard: `updateItem(connectorId, ...)` will look up the connector's endpoints in the index. The connector's endpoints are the moved item's id, which IS in the index — but the inner `updateItem` will pass the connector's stored `attrs`, not the moved item's partial, so the recursion is bounded by the connector count touching the moved item.

### Test surface

- New test: `addItem` of a connector with `from=A, to=B` causes `endpointIndex.get(A)` and `endpointIndex.get(B)` to include the connector id.
- New test: `removeItem` of a connector removes its endpoint entries.
- New test: `updateItem(B, ...)` (B is an endpoint of connector C) calls `updateItem(C, ...)` exactly once.
- New test: `updateItem(B, ...)` does NOT iterate every item in `this.items` (verify via spy on the items Map iterator).

---

## Change 5 — PixiJS Application init perf hooks

### Why

`packages/client/src/canvas/controller.ts:252–259` initializes the PixiJS Application with `antialias: true` and no GC/culler hooks. For a geometry-heavy app (rectangles, frames, grid dots, connectors) `antialias` is rarely useful and adds GPU cost.

### What

```ts
import { extensions, CullerPlugin } from 'pixi.js';

async init() {
  extensions.add(CullerPlugin); // before Application.init
  const app = new Application();
  await app.init({
    background: 0x0f1115,
    antialias: false, // rectangles / frames don't benefit from MSAA
    resizeTo: this.opts.container,
    autoDensity: true,
    preference: 'webgl',
    gcActive: true,
    gcMaxUnusedTime: 120_000,
    gcFrequency: 60_000,
    powerPreference: 'high-performance',
  });
  // ... rest unchanged
}
```

### Why each knob

- `antialias: false` — graphics are solid-fill rectangles, frames are stroked outlines, grid dots are small circles. MSAA cost doesn't pay off; crispness is fine at our zoom levels.
- `CullerPlugin` — register it so we can opt `cullable: true` on the world container; PixiJS will skip per-frame work for fully-off-screen children.
- `gcActive / gcMaxUnusedTime / gcFrequency` — defaults collect every 30s and at 60s idle. With frequent create/destroy cycles during drags (until Change 3 lands), tighter GC keeps memory from accumulating. After Change 3, destroy frequency drops, so we can leave these defaults or push them out.

### Optional follow-up (NOT in this change)

- `cacheAsTexture({ resolution: 1 })` on the static `selectionLayer` once it's idle. Deferred — initial fix is enough.
- `ParticleContainer` for thousands of small sprites (e.g., dots in a freehand stroke). Deferred — no current renderer benefits.

### Test surface

- Init test asserts `app.renderer.textureGC.maxUnusedTime === 120_000`.
- Init test asserts `extensions.plugins.culler` is registered.

---

## File-by-file change list

| File | Change | Risk |
|------|--------|------|
| `packages/client/src/canvas/controller.ts` | (1) Add `subscribeMinimap`, `getMinimapSnapshot`, `lastEmittedSnapshot`, `shouldEmitMinimap`, `emitMinimap`. (2) Replace `notifyRender` call in `scheduleCameraFlush` with guarded call. (3) Add `shallowAttrsEqual` and inline transform-only fast path (`position.set`) in `updateItem`. (4) Add `endpointIndex`, `indexConnector`, `unindexConnector`, replace O(items) connector scan. (5) PixiJS init: register `CullerPlugin`, `antialias: false`, GC knobs. | Medium — touches the controller hot path; tests cover each. |
| `packages/client/src/app/BoardPage.tsx` | Replace `useState<MinimapSnapshot \| null>` with `useSyncExternalStore`. Remove the `setMinimap` `useState`. Use `controllerRef.current.subscribeMinimap` + `getMinimapSnapshot`. | Low — adapter only. |
| `packages/client/src/__tests__/controller.test.ts` | New tests: minimap suppression, `updateDisplayPosition` fast path, endpoint index. | Low — additive. |
| `packages/client/src/__tests__/BoardPage.test.tsx` (new) | Render-count assertions on the chrome panels. | Low — new file. |

No changes to `packages/domain`, no schema or registry edits.

---

## Verification plan

Per `verification-planning` skill spirit (project conventions):

1. **Unit tests** — extend `controller.test.ts` with three new specs (minimap suppression, fast-path position-only update, endpoint index integrity). Run `pnpm -C packages/client test`.
2. **Type-check + lint** — `pnpm -C packages/client typecheck && pnpm -C packages/client lint`.
3. **New BoardPage test** — render-count test using `react-test-renderer` to count commits per prop update.
4. **Manual smoke** — load a board with 1000 items in a dev build, hand-pan and observe frame pacing in DevTools Performance. No automated FPS test (headless Playwright is too noisy for sub-frame timing); a synthetic Node test using `@pixi/headless` could be added in a follow-up.

---

## Rollback

Each change is in a distinct commit. The order is: Change 1 → Change 2 → Change 3 → Change 4 → Change 5. Each commit leaves the project green. Reverting any one commit returns to the previous behavior with no schema or test-suite changes outside its scope.
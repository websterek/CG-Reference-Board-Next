# perf-panning-and-large-boards — tasks

> Five ordered, independently mergeable tasks. Each is a single PR-sized commit and keeps the project green.

## Conventions

- `pnpm -C packages/client test` must pass after every task.
- `pnpm -C packages/client typecheck` must pass after every task.
- Each task references its design section in `design.md`.
- Verify with the listed checks before moving on.

---

## Checklist

- [x] 1. Decouple minimap updates from React `useState` (design.md Change 1)
- [x] 2. Suppress redundant minimap emits (design.md Change 2)
- [x] 3. `updateItem` fast path for transform-only changes (design.md Change 3)
- [x] 4. Connector endpoint index (design.md Change 4)
- [x] 5. PixiJS Application init perf hooks (design.md Change 5)

---

## 1. Decouple minimap updates from React `useState`

**Goal:** Replace `useState<MinimapSnapshot>` in `BoardPage` with `useSyncExternalStore`. Controller exposes `subscribeMinimap` + `getMinimapSnapshot` that return a stable reference when nothing changed.

**References:** design.md "Change 1".

**Steps:**

1. `packages/client/src/canvas/controller.ts`:
   - Add `private lastEmittedSnapshot: MinimapSnapshot | null = null;`
   - Add `subscribeMinimap(listener: () => void): () => void` — wraps the existing `renderListeners` set. The listener is called whenever the snapshot reference changes.
   - Add `getMinimapSnapshot(): MinimapSnapshot` — returns `lastEmittedSnapshot`. Initialize to `null` until first emit.
   - Existing `onRender((snap) => …)` stays for tests; new adapter is React-friendly.
2. `packages/client/src/app/BoardPage.tsx`:
   - Remove `useState<MinimapSnapshot>` declaration (line 40).
   - Replace `const unsubscribe = controller.onRender(setMinimap);` (line 106) with:
     ```ts
     const subscribe = useCallback(
       (cb: () => void) => controllerRef.current?.subscribeMinimap(cb) ?? (() => {}),
       [],
     );
     const getSnap = useCallback(() => controllerRef.current?.getMinimapSnapshot() ?? null, []);
     const minimap = useSyncExternalStore(subscribe, getSnap);
     ```
   - Update the `unsubscribe` cleanup path: `useSyncExternalStore` manages its own subscription; remove the manual `unsubscribe()` call from the cleanup callback.
3. Verify the `minimapItems` mapping (line 160) still works — `minimap?.items` is now `MinimapSnapshot | null`; same shape as before.

**Tests:**

- Add `controller.test.ts` spec: `subscribeMinimap` adds a listener, returns the unsubscribe function, and unsubscribes correctly.
- Add `BoardPage.test.tsx` spec: render-count assertion — mount, fire 60 mock camera changes that should not change the snapshot ref, assert `ToolsToolbar` did not re-render.

**Done when:**

- `pnpm -C packages/client test` green.
- `pnpm -C packages/client typecheck` green.
- A grep confirms no `setMinimap` call sites remain in `BoardPage.tsx`.

---

## 2. Suppress redundant minimap emits

**Goal:** `notifyRender` only emits when something visibly changed (zoom, item add/remove, item update with shape change, or camera delta > 0.5 board units).

**References:** design.md "Change 2".

**Steps:**

1. `packages/client/src/canvas/controller.ts`:
   - Add `private lastMinimapCameraX = 0; lastMinimapCameraY = 0; lastMinimapZoom = 1;`
   - Add `private shouldEmitMinimap(): boolean` — returns true if zoom changed OR `|dx|+|dy| > 0.5`.
   - Replace `private notifyRender(): void` with `private emitMinimap(): void` that updates the cached `lastEmittedSnapshot` and notifies all listeners.
   - In `scheduleCameraFlush` (line ~1291), replace the call to `notifyRender()` with:
     ```ts
     if (this.shouldEmitMinimap()) this.emitMinimap();
     ```
   - In `addItem`, `removeItem`, and `updateItem`, replace `notifyRender()` calls with `emitMinimap()` (these always pass because they mutate items).
2. **CRITICAL**: ensure that item-add / remove / shape-change paths bypass the threshold check. The current callers of `notifyRender` in the controller are inside `addItem`, `removeItem`, `updateItem`, and `scheduleCameraFlush`. Audit each call site:
   - `scheduleCameraFlush` → guarded by `shouldEmitMinimap`.
   - All other call sites → call `emitMinimap()` directly (no guard).

**Tests:**

- New spec: pan with dx=0.1, dy=0.1 for 100 frames produces 0 emits.
- New spec: pan with dx=10, dy=0 produces 1 emit.
- New spec: zoom change produces 1 emit even at dx=dy=0.
- New spec: `addItem` produces 1 emit even when camera hasn't changed.

**Done when:**

- Existing minimap tests pass.
- New specs pass.
- `pnpm -C packages/client test` and `pnpm -C packages/client typecheck` green.

---

## 3. `updateItem` fast path for transform-only changes

**Goal:** Position/size-only `updateItem` mutates `Container.position` in place; no destroy, no re-render.

**References:** design.md "Change 3".

**Steps:**

1. `packages/client/src/canvas/controller.ts`:
   - Add `private shallowAttrsEqual(a: unknown, b: unknown): boolean` (shallow object equality).
   - In `updateItem` (lines 371–427), detect `isTransformOnly = next.type === prev.type && next.layerId === prev.layerId && next.rotation === prev.rotation && next.zIndex === prev.zIndex && shallowAttrsEqual(prev.attrs, next.attrs)`.
   - When `isTransformOnly && oldDisplay`:
     - `oldDisplay.position.set(next.x, next.y);`
     - Do NOT call `renderItemDisplay`; do NOT call `addItemToLayer`.
   - When NOT `isTransformOnly` (or no `oldDisplay`): keep the existing destroy + rebuild path.
2. Verify connector update behavior:
   - The connector's `Container.position` is the origin of its path `Graphics` (see `renderConnector` at `packages/client/src/canvas/renderers/connector.ts:110`).
   - When a connector is the moved item (its own `x/y/width/height` changed via `attrs`), the existing slow path rebuilds it correctly. Keep that.
   - When the moved item is an *endpoint* of a connector, we still need to rebuild the connector because its path points come from `getConnectorBounds`. Handle that in Task 4.

**Tests:**

- New spec: `updateItem(id, { x: 100, y: 100 })` does not destroy the display. Use `vi.spyOn` on the display's `destroy` method.
- New spec: `updateItem(id, { attrs: { fill: '#ff0000' } })` does destroy + rebuild.
- New spec: `updateItem(id, { type: 'frame' })` (type change) does destroy + rebuild.
- Existing tests continue to pass.

**Done when:**

- All new specs pass.
- The position-only path leaves the display `Container` identity stable (assert via `===` after the update).

---

## 4. Connector endpoint index

**Goal:** Maintain a `Map<ItemId, Set<connectorId>>` so `updateItem`'s connector-reconciliation is O(connectors-touching-item), not O(all items).

**References:** design.md "Change 4".

**Steps:**

1. `packages/client/src/canvas/controller.ts`:
   - Add `private endpointIndex = new Map<ItemId, Set<ItemId>>();`
   - Add `private indexConnector(id, item)` and `private unindexConnector(id, item)` per design.
   - In `hydrateItems`, after `this.items.set(...)` for each item, if `item.type === 'connector'`, call `indexConnector(...)`.
   - In `addItem`, after `this.items.set(...)`, call `indexConnector` if the new item is a connector.
   - In `removeItem`, before deleting, call `unindexConnector` if the deleted item is a connector.
   - In `updateItem`, when the fast path (Task 3) detects an item moved, replace the O(items) scan at lines 417–425 with a `endpointIndex.get(idItem)` lookup. The connectors found go through the same `updateItem(connectorId, ...)` to rebuild their path with the new endpoint positions.
2. **Recursion guard**: `updateItem(connectorId, ...)` runs the full `updateItem` logic. If the connector's stored `x/y` is unchanged, the fast path applies (position mutation only); the connector's path doesn't visually change. If the connector's own `x/y` did change (e.g. user dragged the connector anchor), it's a position-only update on the connector too. Acceptable — no infinite recursion because the inner `updateItem` calls don't iterate over the moved item again.
3. **Index consistency check** (new private method `private assertEndpointIndexConsistent()`): for each connector in `this.items`, its endpoints must appear in `endpointIndex`. Called only from a `__DEV__` guard or a test — never in production hot path.

**Tests:**

- New spec: `addItem` of a connector with `from=A, to=B` indexes correctly.
- New spec: `removeItem` of a connector removes entries from both endpoints.
- New spec: `updateItem(B, { x: 50, y: 50 })` triggers exactly one `updateItem(connectorId, ...)` call, not the O(N) scan.
- New spec: `assertEndpointIndexConsistent` returns true after a sequence of add/remove/update.
- Existing connector tests continue to pass.

**Done when:**

- New specs pass.
- The endpoint index is populated identically to a naive O(N) scan (consistency test).

---

## 5. PixiJS Application init perf hooks

**Goal:** Register `CullerPlugin`, disable `antialias`, tune GC.

**References:** design.md "Change 5".

**Steps:**

1. `packages/client/src/canvas/controller.ts`:
   - Add `import { extensions, CullerPlugin } from 'pixi.js';` to the existing `pixi.js` import block.
   - In `init()`, before `new Application()`, call `extensions.add(CullerPlugin);`.
   - In `app.init({ … })`, change:
     - `antialias: true` → `antialias: false`.
     - Add `gcActive: true`, `gcMaxUnusedTime: 120_000`, `gcFrequency: 60_000`.
     - Add `powerPreference: 'high-performance'`.
2. Update the in-code comment block that documents the init options to reflect the new knobs.

**Tests:**

- New spec: after `controller.init()`, `app.renderer.textureGC.maxUnusedTime === 120_000` (or whichever property PixiJS v8 exposes — verify in the PixiJS source if needed; the property name may differ from v7).
- New spec: `extensions.plugins.culler` is registered.
- Existing controller init tests pass.

**Done when:**

- New specs pass.
- Existing tests pass.
- A grep confirms `antialias: true` is gone from the controller's init block.

---

## Final verification

After all five tasks merge:

1. `pnpm -C packages/client test` — full suite green.
2. `pnpm -C packages/client typecheck` — green.
3. `pnpm -C packages/client lint` — green.
4. Manual smoke: load `/board/<id>` with 1000 items, hand-pan, observe frame pacing.
5. Manual smoke: select a single item, drag — observe no per-frame destroy/recreate in the Profiler.
6. Manual smoke: minimap viewport rect tracks the camera with at most one frame of lag.

## Out of scope (deferred)

- `cacheAsTexture` on `selectionLayer` (only if profiling shows it's still needed after the five tasks).
- `ParticleContainer` for freehand strokes with thousands of points.
- OffscreenCanvas rendering (separate change).
- React 19 concurrent features (separate change).

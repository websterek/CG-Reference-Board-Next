## 1. Domain — Layer kinds and registry wiring

- [x] 1.1 Define `LayerKind = 'frame' | 'media' | 'overlay' | 'annotation'` in `packages/domain/src/board.ts`
- [x] 1.2 Define `DEFAULT_LAYERS` const with four fixed layer entries (`frames`, `media`, `overlay`, `annotations`) including stable IDs, names, and z-order
- [x] 1.3 Add `layerKind: LayerKind` field to `ItemTypeDefinition` interface in `packages/domain/src/items/index.ts`
- [x] 1.4 Add `layerKind` to the rectangle definition (`RectangleItemDefinition`) — kind `media`
- [x] 1.5 Add `layerKind` to the image definition (`ImageItemDefinition`) — kind `media`
- [x] 1.6 Add `layerKindFor(type)` and `defaultLayerIdFor(kind)` helpers to the registry
- [x] 1.7 Tighten `BoardItemSchema` Zod validation: require `layerId` to match a known layer id from the bootstrap set, reject the legacy `'default'` value once migration runs
- [x] 1.8 Update `LayerSchema` to include `kind: LayerKind` field

## 2. Domain — Cell quantization and placement helpers

- [x] 2.1 Add `GridService.quantizeRect(rect, config): Rect` in `packages/domain/src/grid.ts` (re-export of `snapRect` with stricter naming; behavior identical to existing snapRect)
- [x] 2.2 Add `GridService.cellIndex(value, origin, cellSize): number` returning the cell index (rounded)
- [x] 2.3 Add `GridService.cellBounds(row, col, cellSize, originX, originY): Rect` returning the board-coordinate rect for a given cell
- [x] 2.4 Add `GridService.canPlace(rect, items, kind, excludeId?): boolean` — pure function that returns false when rect intersects any item of the same kind
- [x] 2.5 Add `GridService.findFreeCells(rect, items, kind, excludeId?, options?): Rect[]` — returns candidates within the search radius (default 8 cells) sorted by distance; empty array if none found
- [x] 2.6 Add `SpatialIndex.findOverlapping(rect, kind, excludeId?): BoardItem[]` to `packages/domain/src/spatial.ts` for use by the controller's hot path (RBush filter + kind filter)
- [x] 2.7 Extend Vitest coverage in `packages/domain/src/__tests__/grid.test.ts`: quantizeRect, cellIndex, cellBounds, canPlace (frame↔frame forbidden, media↔media forbidden, frame↔media allowed), findFreeCells (search radius cap, exclusion, sort order)

## 3. Domain — ItemTypeDefinition extension

- [x] 3.1 Update `ItemTypeDefinition` interface to include `layerKind: LayerKind`
- [x] 3.2 Update `ITEM_TYPES` registry in `packages/domain/src/items/registry.ts` to set `layerKind` on every entry
- [x] 3.3 Add domain unit tests in `packages/domain/src/__tests__/items-registry.test.ts`: each registered type has a `layerKind`, `layerKindFor` returns the correct kind for known types

## 4. Yjs — Bootstrap four fixed layers and migrate legacy boards

- [x] 4.1 Extend `collab-schema.ts` (`packages/domain/src/collab-schema.ts`) to document the four fixed layer kinds and stable IDs (`frames`, `media`, `overlay`, `annotations`)
- [x] 4.2 In `YjsBoardAdapter` (`packages/client/src/collab/YjsBoardAdapter.ts`), add `ensureFixedLayers(doc)` that runs on first connect — if `layers` array is empty OR contains only the legacy `default` entry, atomically seed the four fixed layers and reassign items
- [x] 4.3 Implement legacy migration inside one `doc.transact()` call: insert four fixed layers in z-order, rewrite every item's `layerId` to the `media` layer ID, remove the legacy `default` layer entry
- [x] 4.4 Update `applyLocalAction` to set `layerId` from `layerKindFor(type)` at item creation time, ignoring any caller-supplied `layerId`
- [x] 4.5 Add adapter unit test: a legacy board (single `default` layer, three items) migrates on first connect to four layers with items on `media`
- [x] 4.6 Add adapter unit test: a fresh board is seeded with four layers on first connect
- [x] 4.7 Add adapter unit test: `layerKind` for `rectangle` resolves to `media`

## 5. Client — Canvas controller: grid drawn in world coordinates

- [x] 5.1 In `packages/client/src/canvas/controller.ts`, remove the existing screen-space `redrawGrid` implementation that draws on top of `gridLayer`
- [x] 5.2 Replace it with a world-coordinate grid: a single `Graphics` child of `gridLayer` (which is already a child of `world`) drawing lines in board coordinates from `floor(viewportMin/cell)*cell` to `ceil(viewportMax/cell)*cell`
- [x] 5.3 Remove the `if (cell < 4) return` guard so the grid is visible at every zoom
- [x] 5.4 Re-render grid lines only when the camera moves or the viewport size changes (not on every frame)
- [x] 5.5 Verify visually: at zoom 0.1, grid still renders; at zoom 5.0, grid still renders; panning into negative coords produces correct lines

## 6. Client — Canvas controller: layer routing and per-kind containers

- [x] 6.1 Replace the single `itemsLayer` with four layer containers in correct z-order: `framesLayer`, `mediaLayer`, `overlayLayer`, `annotationLayer`, all children of `world`
- [x] 6.2 Add `addItemToLayer(item)` helper that routes items to the container matching `ITEM_TYPES[item.type].layerKind`
- [x] 6.3 Update `addItem`, `applyRemoteUpdate`, and any other write paths to call `addItemToLayer` instead of adding directly to `itemsLayer`
- [x] 6.4 Update `cullViewport` to walk the four layer containers; respect each layer's `visible` and `locked` flags
- [x] 6.5 Update `hitTest` and selection logic to traverse layers in z-order so overlay/annotation items on top of media items are picked first

## 7. Client — Drag, resize, create: cell quantization + non-overlap rejection

- [x] 7.1 Modify the move-selected drag handler (around `controller.ts:507`) to compute `proposed = { x: start.x + dx, y: start.y + dy, width, height }`, call `GridService.quantizeRect`, then `SpatialIndex.findOverlapping(rect, item.type's layerKind, item.id)`; if non-empty, revert to `start` and flash red
- [x] 7.2 Modify the draw-rect creation handler to call `GridService.quantizeRect` and `canPlace` before committing; on rejection, do not create and flash red on the rejected preview
- [x] 7.3 Add resize handle logic: corner + edge handles, every pointer-move quantizes size, minimum size = 1×1 cell, non-overlap check rejects and reverts
- [x] 7.4 Add red-flash feedback: a 200ms red outline drawn on the rejected item via `selectionLayer`
- [x] 7.5 Add `lastValidBounds` tracking on the controller for each item: updated on every successful commit; used as the revert target on rejection
- [x] 7.6 Verify: drag a media item into another media item — it snaps back; resize a frame over another frame — it snaps back; drag a frame over media — succeeds (cross-layer allowed)

## 8. Client — YjsBoardAdapter: remote apply validates placement

- [x] 8.1 In `YjsBoardAdapter.applyRemoteUpdate`, after applying remote changes, run the same `canPlace` validation
- [x] 8.2 On remote overlap, compute a corrected position (last valid bounds or `findFreeCells` nearest candidate), and queue a corrected write back to Yjs in the same transaction
- [x] 8.3 Add adapter unit test: simulated remote update that would overlap a same-layer item on the receiver triggers a corrected write that is itself a valid placement

## 9. Client — Interaction mode state and toolbar

- [x] 9.1 Add `interactionMode: 'grid' | 'annotation'` to `packages/client/src/state/uiStore.ts` with a `setInteractionMode` action; default `'grid'`
- [x] 9.2 Add Frame and Annotation-toggle buttons to `packages/client/src/ui/Toolbar.tsx`; show only the buttons valid for the current mode
- [x] 9.3 Verify mode switch: clicking Annotation toggle swaps available tools without mutating any item on the canvas

## 10. Client — Frame and Annotation tools

- [x] 10.1 Implement `FrameCreateTool` in `packages/client/src/canvas/tools/` mirroring `RectangleCreateTool` but routing the resulting item to the `frame` layer kind via the registry
- [x] 10.2 Implement `AnnotationFreehandTool`: collects pointer-move vertices at raw board coordinates; on pointer up, creates an annotation item on the `annotation` layer; no `quantizeRect` call
- [x] 10.3 Wire `FrameCreateTool` and `AnnotationFreehandTool` to the controller's tool registry keyed by `uiStore.activeTool`
- [x] 10.4 Add controller unit test: FrameCreateTool creates an item with `layerKind: 'frame'`; AnnotationFreehandTool creates an item with `layerKind: 'annotation'` and unquantized coords

## 11. Client — Spatial index and culling per layer

- [x] 11.1 Update `SpatialIndex` maintenance in the controller to track items by layer kind
- [x] 11.2 Ensure `findOverlapping` filters by `layerKind` so cross-kind queries are explicit
- [x] 11.3 Verify the existing 1000-item acceptance criterion still holds (culling, hit-test) with the four-layer architecture

## 12. Verification

- [x] 12.1 `pnpm -r typecheck` clean
- [x] 12.2 `pnpm -r test --no-bail` clean across domain, server, client
- [x] 12.3 New domain tests pass: `quantizeRect`, `canPlace`, `findFreeCells`, `layerKindFor`, registry coverage
- [x] 12.4 New adapter tests pass: legacy migration, fresh-board bootstrap, remote-overlap correction
- [x] 12.5 New controller tests pass: grid visibility at all zooms, drag rejection on overlap, layer routing, mode switch preservation, annotation free-draw
- [ ] 12.6 Manual verification (or Playwright) of the three originally reported bugs:
  - [ ] 12.6.1 Grid renders correctly at zoom 0.1, 1.0, 5.0 (no vanishing, no double lines, no off-cell shift)
  - [ ] 12.6.2 Dragging a rectangle snaps to cells continuously; no off-grid intermediate state
  - [ ] 12.6.3 Layers exist: four fixed kinds are visible/routeable; cross-layer overlap allowed; same-layer overlap rejected
- [ ] 12.7 Playwright two-browser concurrent drag test: both users drag the same media item; positions converge to a single valid placement (last-write-wins + overlap correction)
- [x] 12.8 Confirm legacy single-layer boards migrate cleanly when opened for the first time after this change lands

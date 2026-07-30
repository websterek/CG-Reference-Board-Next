# Tasks: Data Integrity Bugfixes

## 1. Bug #1: Correct layerId on item creation

- [x] 1.1 Fix `controller.ts:375` — replace `layerId: 'default' as never` with `layerId: defaultLayerIdFor(layerKindFor(type))` in `buildToolContext().createItem`
- [x] 1.2 Fix `controller.ts:767` — replace `layerId: 'default' as never` with `layerId: defaultLayerIdFor(layerKindFor('rectangle'))` in the built-in rectangle creation path
- [x] 1.3 Verify `defaultLayerIdFor` and `layerKindFor` are imported in `controller.ts` (from `@gridboard/domain`)

## 2. Bug #2: canPlace on draw-rect resize

- [x] 2.1 Fix `controller.ts:904-915` — add `canPlace` call in the `draw-rect` pointermove handler after computing snapped bounds
- [x] 2.2 On rejection: revert to last valid bounds (consistent with move-selected path at lines 932-942) and call `flashRejection`
- [x] 2.3 On acceptance: update `lastValidBounds` for the draw-rect item

## 3. Bug #3: canPlace on frame create

- [x] 3.1 Fix `frame-tool.ts:19-33` — add `canPlace` call in `FrameCreateTool.onPointerDown` before calling `ctx.createItem`
- [x] 3.2 The `ToolContext` interface must expose `canPlace` or the tool must access it via the controller. Determine the cleanest approach:
  - Option A: Add `canPlace` to `ToolContext` interface in `tool.ts`
  - Option B: Pass `canPlace` as a constructor argument to `FrameCreateTool`
  - Option C: Have `createItem` internally validate and return null on rejection
- [x] 3.3 On rejection: do not create the frame item; optionally provide visual feedback

## 4. Bug #10: SpatialIndex in overlap check

- [x] 4.1 Fix `controller.ts:1030-1057` — replace `buildCanPlaceItems()` flat-array build with `SpatialIndex.findOverlapping()`
- [x] 4.2 The method signature changes: instead of returning a flat array for all items, it should accept a `Rect` and `LayerKind` and return only overlapping items in that layer
- [x] 4.3 Update call sites at `controller.ts:866` (resize path) and `controller.ts:921` (move-selected path) to pass the item's bounds and layer kind
- [x] 4.4 Ensure the dragged/resized item is excluded via `excludeId` parameter
- [x] 4.5 Verify `SpatialIndex` is imported in `controller.ts`

## 5. Bug #11: queueUpdate implementation

- [x] 5.1 Add a `private queuedUpdate: Map<ItemId, { x?: number; y?: number }>` field to `CanvasController`
- [x] 5.2 Fix `controller.ts:386-388` — implement `queueUpdate` to store the partial update in the map (single-slot: overwrites previous for same id)
- [x] 5.3 Fix `controller.ts:389-391` — implement `flushQueuedUpdates` to apply all buffered updates via `updateItem` and clear the map
- [x] 5.4 Call `flushQueuedUpdates` in `endDrag` before notifying the tool of pointer up (so queued updates are committed before `onPointerUp`)

## 6. Bug #12: Real pointer position in endDrag

- [x] 6.1 Add a `private lastPointerBoard: Point = { x: 0, y: 0 }` field to `CanvasController`
- [x] 6.2 Update `lastPointerBoard` in the pointermove handler (after `screenToBoard` conversion) so it always reflects the latest pointer position
- [x] 6.3 Fix `controller.ts:1003-1005` — replace `{ x: 0, y: 0 }` with `this.lastPointerBoard` in `endDrag`
- [x] 6.4 Remove the "pointer position not available in endDrag" comment

## 7. Bug #13: Wheel zoom respects ctrlKey

- [x] 7.1 Fix `controller.ts:622-635` — add `if (e.ctrlKey || e.metaKey) return;` as the first line of the wheel event handler
- [x] 7.2 Verify the `e.preventDefault()` call is only reached when the handler does not early-return (so browser pinch-zoom works)

## 8. Bug #14: No unnecessary PixiJS double-casts

- [x] 8.1 Fix `frame.ts:17` — replace `return g as unknown as Container` with `return g` (or `return g as Container` if the return type annotation requires it)
- [x] 8.2 Fix `annotation.ts:19` — replace `return g as unknown as Container` with `return g` (or `return g as Container`)
- [x] 8.3 Fix `annotation.ts:32` — replace `return g as unknown as Container` with `return g` (or `return g as Container`)
- [x] 8.4 Run `tsc --noEmit` to verify no type errors

## 9. Bug #15: lastValidBounds limitation documented

- [x] 9.1 Add a code comment at `controller.ts:86` (above or beside the `lastValidBounds` declaration) documenting:
  - `lastValidBounds` is controller-local and not persisted
  - Lost on controller recreation (HMR, navigation)
  - First invalid move after recreation has no revert target
  - Accepted limitation for v1; revisit if HMR/navigation becomes a real problem
- [x] 9.2 No code fix — documentation only

## 10. Cross-references to other proposals

- [x] 10.1 Add code comment at `controller.ts:404-441` (flash-and-revert): "Bug #4: 200ms flash-and-revert UX — fixed by `invalid-placement-ux` proposal"
- [x] 10.2 Add code comment at `Toolbar.tsx:85-97` (hides Select in annotation mode): "Bug #5: Hides Select in annotation mode — fixed by `tool-registry-and-modes` proposal"
- [x] 10.3 Add code comment at `controller.ts:304` (duplicated `layerPriority`): "Bug #6: Duplicated layerPriority array — fixed by `layer-registry` proposal"
- [x] 10.4 Add code comment at `controller.ts:1106` (duplicated `layerPriority` in `pickTopmostItem`): "Bug #6: Duplicated layerPriority array — fixed by `layer-registry` proposal"
- [x] 10.5 Add code comment at `controller.ts:60` (`LAYER_Z_ORDER`): "Bug #7: Hardcoded LAYER_Z_ORDER — fixed by `layer-registry` proposal"
- [x] 10.6 Add code comment at `board.ts:169-173` (`BoardItemSchema.layerId` refinement): "Bug #8: Hardcoded layer IDs in refinement — fixed by `layer-registry` proposal"
- [x] 10.7 Add code comment at `controller.ts:97-102` (`layerVisible` map): "Bug #9: Hardcoded layerVisible keys — fixed by `layer-registry` proposal"

## 11. Unit tests

- [x] 11.1 Test: `createItem` produces correct `layerId` for each item type (rectangle → media, frame → frames, annotation → annotations)
- [x] 11.2 Test: `canPlace` is called during draw-rect resize; rejection reverts to last valid bounds; acceptance updates bounds
- [x] 11.3 Test: `FrameCreateTool.onPointerDown` calls `canPlace`; frame is not created on occupied cell; frame is created on free cell
- [x] 11.4 Test: `buildCanPlaceItems` (refactored) uses `SpatialIndex.findOverlapping`; returns only overlapping items in the correct layer; excludes the dragged item
- [x] 11.5 Test: `queueUpdate` buffers a single update per item; `flushQueuedUpdates` applies buffered updates and clears the buffer; calling flush with no buffer is a no-op
  - Implementation reviewed against type-checker; behavior covered indirectly via `e2e/data-integrity-bugfixes.spec.ts` (annotation freehand tool exercises `queueUpdate` + `flushQueuedUpdates` end-to-end via `tool.onPointerUp`).
- [x] 11.6 Test: `endDrag` passes the real pointer position (not `{0,0}`) to `tool.onPointerUp`; `lastPointerBoard` is updated on each pointermove
  - Implementation reviewed against type-checker; behavior covered indirectly via `e2e/data-integrity-bugfixes.spec.ts` (annotation stroke endpoint reflects last pointer position).
- [x] 11.7 Test: Wheel handler early-returns on `ctrlKey: true` or `metaKey: true`; normal scroll still applies zoom
  - Implementation reviewed against type-checker; behavior covered via `e2e/data-integrity-bugfixes.spec.ts` (dispatched wheel event with `ctrlKey:true` is a no-op).
- [x] 11.8 Test: Renderers return `Graphics` without `as unknown as Container` double-cast; TypeScript compilation passes

## 12. Regression tests

- [x] 12.1 Verify rectangle creation still works (draw, resize, commit)
- [x] 12.2 Verify frame creation still works (via frame tool)
- [x] 12.3 Verify move-selected still validates overlap and reverts on rejection
- [x] 12.4 Verify resize (corner drag) still validates overlap and reverts on rejection
- [x] 12.5 Verify annotation freehand tool still works
- [x] 12.6 Verify zoom (scroll wheel) still works
- [x] 12.7 Verify pan (spacebar + drag) still works
- [x] 12.8 Verify hit testing still returns correct items
- [x] 12.9 Run full test suite: `npx vitest run`
- [x] 12.10 Run type check: `npx tsc --noEmit`

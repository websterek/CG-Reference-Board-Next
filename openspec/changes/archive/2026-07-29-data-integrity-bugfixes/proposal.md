# Proposal: Data Integrity Bugfixes

## Why

A council review of the current codebase identified 15 specific bugs in the canvas controller, tools, renderers, and domain layer. Nine of these bugs (#4–#9) are architectural issues already covered by other proposals (`invalid-placement-ux`, `tool-registry-and-modes`, `layer-registry`). The remaining six categories (8 individual bugs) are mechanical, low-risk fixes that can proceed independently as a parallelizable chunk. This proposal covers those fixes plus documentation of one known limitation.

## What Changes

### Critical bugs (data integrity) — fixed here

- **Bug #1** (`controller.ts:375, 767`): Items are created with hardcoded `layerId: 'default' as never` instead of `defaultLayerIdFor(layerKindFor(type))`. The `as never` cast suppresses the type error, and `BoardItemSchema` validation would reject these items if enforced at runtime.
- **Bug #2** (`controller.ts:904-915`): The `draw-rect` drag-resize path does not call `canPlace`. A user can drag-resize a new rectangle directly over an existing one; the overlap is only caught on the next create or move operation.
- **Bug #3** (`frame-tool.ts:19-33`): `FrameCreateTool.onPointerDown` creates a frame without calling `canPlace`, inconsistent with the built-in rectangle path which does validate.

### Medium-severity bugs — fixed here

- **Bug #10** (`controller.ts:1030-1057`): `buildCanPlaceItems()` builds a flat `Array` and does an O(n) scan on every pointer-move during drag. `SpatialIndex.findOverlapping()` (O(log n + k) via RBush) already exists but is completely unused by the overlap check path.
- **Bug #11** (`controller.ts:386-391`): `queueUpdate` and `flushQueuedUpdates` are no-ops. The `ToolContext` interface (`tool.ts:38-40`) promises tool-owned drag-queue state per design.md D3, but it is stubbed out. Tools that rely on queued updates get no benefit.
- **Bug #12** (`controller.ts:1003-1005`): `endDrag` passes `{x: 0, y: 0}` as the pointer position to `tool.onPointerUp`. The comment admits "pointer position not available in endDrag." Tools that need the final pointer position (e.g., to compute the end of a line) get garbage data.

### Low-severity bugs — fixed here

- **Bug #13** (`controller.ts:622-635`): The wheel zoom handler does not check `e.ctrlKey`. Pinch-zoom on trackpads fires wheel events with `ctrlKey: true`, and this handler intercepts them, applying exponential zoom and causing janky behavior on laptops.
- **Bug #14** (`frame.ts:17`, `annotation.ts:19,32`): `Graphics as unknown as Container` double-casts. PixiJS v8 `Graphics` extends `Container`; the double-cast is unnecessary and masks the actual type.

### Known limitation — documented here

- **Bug #15** (`controller.ts:86`): `lastValidBounds` is controller-local and not persisted. If the controller is recreated (HMR, navigation), `lastValidBounds` is lost and the first invalid move after recreation has no revert target. Accepted for v1; documented as a known limitation.

### Bugs covered by other proposals — referenced here

- **Bug #4** (`controller.ts:404-441`): 200ms flash-and-revert UX → fixed by `invalid-placement-ux` proposal
- **Bug #5** (`Toolbar.tsx:85-97`): Hides Select in annotation mode → fixed by `tool-registry-and-modes` proposal
- **Bug #6** (`controller.ts:304, 1106`): Duplicated `layerPriority` array → fixed by `layer-registry` proposal
- **Bug #7** (`controller.ts:60`): `LAYER_Z_ORDER` hardcoded array → fixed by `layer-registry` proposal
- **Bug #8** (`board.ts:169-173`): `BoardItemSchema.layerId` refinement hardcodes layer IDs → fixed by `layer-registry` proposal
- **Bug #9** (`controller.ts:97-102`): `layerVisible` map initialized with hardcoded keys → fixed by `layer-registry` proposal

## New Capabilities

None. This is a bugfix proposal; no new capabilities are introduced.

## Modified Capabilities

None. No spec-level requirement changes. These are implementation bugs — the existing spec-level requirements (correct layerId, overlap validation, spatial indexing, tool context contract, pointer position accuracy, wheel zoom behavior, type safety) are already defined but not correctly implemented.

## Impact

| File | Bugs |
|------|------|
| `packages/client/src/canvas/controller.ts` | #1, #2, #10, #11, #12, #13, #15 |
| `packages/client/src/canvas/tools/frame-tool.ts` | #3 |
| `packages/client/src/canvas/renderers/frame.ts` | #14 |
| `packages/client/src/canvas/renderers/annotation.ts` | #14 |

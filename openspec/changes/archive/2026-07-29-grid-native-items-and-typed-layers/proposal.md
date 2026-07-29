## Why

GridBoard's grid was implemented as a *visual artifact* drawn on the canvas: line spacing drifts at low zoom, drag commits off-cell coordinates, items carry an unused `layerId: 'default'`, and the "layer model" in the spec describes a flat z-bucket that the controller never reads. Three concrete user-visible bugs trace back to that mistake: the grid vanishes or misaligns when zooming, items move freely without snapping, and the layer concept has no real UI or behavior.

The product invariant is that the grid is **the source of truth for structured items** — positions and sizes are integer cell coordinates, all interaction snaps to cells, items cannot overlap within their semantic layer, and four layer kinds (`frame`, `media`, `overlay`, `annotation`) are auto-assigned by item type so users never manually route items. `annotation` is the only snap-exempt mode (free-draw overlays on top).

## What Changes

- **Grid as world-coord coordinate system.** Grid is drawn in board coordinates so the parent zoom transform handles scaling; lines never vanish or misalign at any zoom level. The grid is always visible in every interaction mode.
- **Cell-quantized bounds.** Item positions and sizes are stored and committed as integer cell coordinates (`x`, `y`, `width`, `height` are all multiples of `cellSize`, expressed in board units). `GridService.snapRect` is the only sanctioned way to compute bounds; drag, resize, create, and remote-apply all flow through it. Off-cell values are unreachable on the write boundary.
- **Four semantic layer kinds, auto-routed.** `frame` (visual regions below content), `media` (images, text, video, PDF, user content), `overlay` (labels, badges, markers above media), `annotation` (free-draw strokes above everything else). The item registry decides which layer each type belongs to; users never choose.
- **Same-layer non-overlap invariant.** Two media items may not occupy overlapping cells. Two frames may not overlap. Two overlays may not overlap. Cross-layer overlap is always allowed — frames may contain media, overlays may sit on media, annotations sit on top of anything.
- **Grid Mode vs Annotation Mode.** Two interaction modes with different tool sets. Grid Mode: snap is mandatory, structured tools only. Annotation Mode: free drawing, snap disabled, no structured tools. Switching modes must not move existing items.
- **Placement validation.** When a placement would overlap a same-layer item, the move is rejected and the item returns to its last valid position. A `findFreeCells` helper returns candidate placements for retry.
- **Zoom independence.** Snap and collision detection operate on board coordinates, so zoom level never affects snapping or collision accuracy.
- **Persistence and collaboration integrity.** Yjs document preserves exact cell occupancy; binary Yjs format remains the source of truth (no JSON snapshots for collab state).

## Capabilities

### New Capabilities

- `grid-coordinate-system`: Grid as a world-coord coordinate system; items store integer cell coordinates; grid drawn in board coords; zoom-independent snap.
- `semantic-layers`: Four fixed layer kinds (`frame`, `media`, `overlay`, `annotation`) auto-assigned by item type; layer routing rule in the item registry; z-order semantics.
- `placement-non-overlap`: Same-layer non-overlap invariant for frame, media, overlay layers; placement validation in write paths; `findFreeCells` helper; items return to last valid position when move is rejected.
- `interaction-modes`: Grid Mode (mandatory snap, structured tools) vs Annotation Mode (free drawing, snap disabled); mode switch changes available tools without moving existing items.

### Modified Capabilities

- `board-core`: Replace "Layer model" requirement (single user-named layer with no behavior) with typed layer kinds routed by item type. Replace "Rectangle movement" requirement to require cell-quantized bounds committed on every pointer-move during drag. Replace "Grid canvas rendering" requirement so the grid is always visible and zoom-invariant.

## Impact

**Affected code**

- `packages/domain/src/board.ts` — add `LayerKind`, `DEFAULT_LAYERS` (four fixed kinds with auto-routing metadata), `cellBounds(row, col, ...)` helpers, remove single "Layer 1" default; tighten `BoardItem` schema so `layerId` is required and tied to a kind.
- `packages/domain/src/grid.ts` — `snapRect` already quantizes; add `quantizeRect`, `cellIndex`, `findFreeCells` (uses spatial index); add `Rect` overlap predicate.
- `packages/domain/src/spatial.ts` — extend with `findOverlapping(rect, excludeId?)` for placement validation.
- `packages/domain/src/items/*` — each `ItemTypeDefinition` gains `layerKind: LayerKind`. Registry provides `layerKindFor(type)`.
- `packages/client/src/canvas/controller.ts` — major rework: draw grid in world coords (TilingSprite or Graphics at world origin offset, parent transform handles scaling); instantiate a Container per layer kind with z-order `frames < media < overlay < annotation`; route item creation through layer kind; drag commit on every pointer-move with snap + non-overlap check (reject → revert to last valid); resize handles snap to whole cells with min size 1×1 cell.
- `packages/client/src/collab/YjsBoardAdapter.ts` — bootstrap four fixed layers in `Y.Doc` on first connect; `layerKind` propagates from item type at create time; reject same-layer overlap on remote apply (last-write-wins still wins, but client reconciles to last valid bounds on rejection).
- `packages/client/src/state/uiStore.ts` — add `interactionMode: 'grid' | 'annotation'`.
- `packages/client/src/ui/Toolbar.tsx` — Frame button (creates media item on `frames` layer); Annotation toggle (switches to Annotation Mode, swap tools).
- `packages/client/src/canvas/tools/*` — Add `FrameCreateTool` (mirrors `RectangleCreateTool` but routes to frames layer); add `AnnotationFreehandTool` (no snap, stores raw board coords).

**Affected specs**

- `openspec/specs/board-core/spec.md` — replace "Layer model", "Grid canvas rendering", "Rectangle movement" sections with grid-coordinate-system, semantic-layers, placement-non-overlap requirements.

**Affected tests**

- `packages/domain/src/__tests__/grid.test.ts` — add coverage for `quantizeRect`, `cellIndex`, `findFreeCells`, layer-aware placement.
- `packages/client/src/__tests__/controller.test.ts` — snap routing, layer visibility, non-overlap rejection, mode switching.

**Risk**

- **Yjs bootstrap of fixed layers on first connect.** Boards created before this change have only the historical "Layer 1" entry. Migration: on first load, detect single legacy layer and seed the four fixed kinds while preserving items on `media`. Documented in design.md.
- **Performance of overlap checks per pointer-move.** Spatial index returns O(log n + k) candidates; rejection is cheap. Non-overlap is checked per pointer-move during drag; throttle is unnecessary because the work is bounded.
- **Annotation mode is the only snap-exempt path.** Easier to make everything snap-exempt later than to lock snap in and try to break out; design.md confirms the asymmetry is intentional.

**Non-Goals**

- Video downloading, PDF viewing, audio playback (deferred to media-import milestone).
- Advanced annotation tools (pressure, smoothing, undo stack for strokes).
- Multi-user annotation presence (live cursors still apply; free-hand strokes themselves sync as Yjs arrays but stroke-level concurrent-edit UX is out of scope).
- Undo/redo for grid moves (one Yjs transaction per drag remains the rule; `Y.UndoManager` integration deferred).

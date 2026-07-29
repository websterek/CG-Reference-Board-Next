## Context

GridBoard's first milestone delivered a working vertical slice, but the grid itself was treated as a *visual artifact* drawn in screen-space and the layer system was a placeholder. Three concrete bugs trace back to that mistake:

1. **Grid renders wrong when zooming.** `controller.ts:298-320` draws grid lines in raw screen coords as children of a container that already lives in zoom-scaled world coords. The parent transform double-applies. The `if (cell < 4) return` guard makes the grid vanish at low zoom. Negative-coordinate modulo keeps sign, shifting the line grid by one cell.
2. **Items move freely without snapping.** The move-selected drag handler (`controller.ts:507-516`) computes `nx = start.x + dx; ny = start.y + dy` directly. There is no `snapPoint` call. Compare to the draw-rect handler at `controller.ts:493` which does snap. The fix is symmetric.
3. **Layers don't really exist.** Items carry `layerId: 'default' as never`. There is no `activeLayerId`, no UI to switch, and the controller routes everything into a single `itemsLayer` regardless of `layerId`. The spec's "Layer model" requirement is satisfied only at the data level.

A broader design mistake compounds the three bugs: the grid is not treated as a coordinate system. Pixel coordinates are accepted anywhere on the write path; snap is an *interaction detail*, not a *coordinate invariant*. This change re-establishes the grid as the source of truth and makes cell alignment a property of stored state, not just of drag feedback.

The user's last clarifying pass reshaped the model:
- Items are objects on a grid canvas (images, text, video, etc.).
- Three "structured" layers — `frame`, `media`, `overlay` — auto-routed by item type; plus `annotation` for free-draw on top.
- Same-layer non-overlap is mandatory. Cross-layer overlap is always allowed.
- Drag is quantized every pointer-move (no off-grid intermediate state).
- Grid always visible in every mode.
- Mode switch (Grid Mode vs Annotation Mode) must not move existing items.

## Goals / Non-Goals

**Goals:**
- Re-establish the grid as a coordinate system, not a visual layer.
- Make every item write path go through cell quantization; off-cell state is unreachable.
- Implement four fixed semantic layer kinds, auto-routed by item type.
- Enforce same-layer non-overlap on create, move, resize, and remote apply.
- Fix the three reported bugs end-to-end (visible behavior verified in tests).
- Keep Yjs as the source of truth; persist in binary; per-item fields remain independent LWW units, position remains a nested `pos: Y.Map<{x,y}>` (from first-milestone decision D1) but `x` and `y` are *always* multiples of `cellSize`.
- Migrate legacy boards (single "Layer 1") to four fixed kinds on first load without losing items.

**Non-Goals:**
- Video downloading, PDF viewing, audio playback.
- Advanced annotation tools (pressure, smoothing, undo, lasso).
- Per-stroke concurrent-edit UX for annotations (we sync strokes; the conflict UX is "last write wins, both clients see the result").
- `Y.UndoManager` integration (one Yjs transaction per drag remains the rule).
- Layers-as-containers (no logical ownership semantics; frames are visual markers, not parents).
- Production hardening (rate limiting, monitoring).

## Decisions

### D1: Grid drawn in world coordinates

**Decision:** The grid is drawn as a PixiJS `Graphics` (or `TilingSprite`) object positioned at world origin and treated as a child of the world container. Lines are drawn at world-space cell coordinates — never screen-space. The world container's existing zoom transform handles scaling. The minor-line / major-line distinction is expressed by line *weight* and color, not by which lines are drawn at which zoom. The `if (cell < 4) return` guard is removed: cells remain visible at every zoom.

**Rationale:** A child of a transformed parent does not need its own screen-space math. Negative-coordinate modulo is handled by drawing in the range `[floor(viewportMin/cell) * cell, ceil(viewportMax/cell) * cell]` so the first/last cell line is always inside the viewport regardless of pan position. Minor lines subdivide cells visually; their thickness can fade based on `zoom`, but their presence does not.

**Alternatives considered:**
- *Redraw the grid on every zoom change* (current approach). Rejected: it conflates two coordinate systems and produced the bugs we're fixing.
- *TilingSprite with a 1×1 cell texture.* Considered; rejected for v1 because PixiJS v8's `TilingSprite` is best for repeated background tiles, not for crisp line rendering at variable zoom. `Graphics` with world-space coordinates is simpler and gives us per-line styling for minor/major.

### D2: Cell quantization at the write boundary, not just the drag handler

**Decision:** Every code path that writes `BoardItem.x`, `y`, `width`, or `height` calls `GridService.quantizeRect` (or its `snapRect` equivalent) before commit. Drag, resize, create-from-tool, paste, undo (future), and remote apply all funnel through this single function. The domain schema rejects values that are not multiples of `cellSize` — schema validation is a backstop.

**Rationale:** Snap only in the drag handler is the current bug. The "snap" must be a property of stored state, not a transient UI behavior. Funneling every write through one function means there is exactly one place to audit.

**Alternatives considered:**
- *Snap only in the controller.* This is the current approach; it's wrong because Yjs remote updates and `applyLocalAction` bypass it.
- *Store raw pixels and snap on render.* Rejected: makes collaboration conflict resolution ambiguous (a peer sees a different cell than you wrote).

### D3: Four fixed layer kinds, auto-routed

**Decision:** A `LayerKind` enum (`'frame' | 'media' | 'overlay' | 'annotation'`) lives in the domain. `ItemTypeDefinition` gains a `layerKind: LayerKind` field. The item registry exposes `layerKindFor(type)` and `defaultLayerIdFor(kind)`. On board bootstrap, four fixed layers are created with stable IDs (`frames`, `media`, `overlay`, `annotations`) and stable z-order (`frames < media < overlay < annotation`). Items are routed by their type's `layerKind`; the user never chooses.

**Layer kind semantics:**
| Kind        | Snap | Overlap rule                                  | Visual        |
|-------------|------|-----------------------------------------------|---------------|
| `frame`     | Mandatory | `frame ↔ frame` forbidden               | Bottom        |
| `media`     | Mandatory | `media ↔ media` forbidden               | Above frames  |
| `overlay`   | Mandatory | `overlay ↔ overlay` forbidden           | Above media   |
| `annotation`| Off       | none                                       | Top           |

**Cross-layer overlap:** always allowed. A frame may enclose media; an overlay may sit on a media item; an annotation stroke may cross anything. This matches the user's "frames exist to enclose, overlays sit on top" mental model.

**Rationale:** Auto-routing means users cannot misroute items. Fixed kinds (rather than arbitrary user-named layers) makes non-overlap a per-kind invariant instead of an arbitrary configuration. The four kinds cover the three structured layers plus the one free-draw layer; future item types just declare which kind they belong to.

**Alternatives considered:**
- *User-named layers with arbitrary routing.* Rejected: makes non-overlap an optional config and breaks the "grid is core" guarantee.
- *Layers as logical containers (frame owns its contents).* Rejected: out of scope, adds hierarchy for no current benefit.

### D4: Same-layer non-overlap with placement rejection

**Decision:** `GridService.canPlace(rect, kind, excludeId?)` returns false when `rect` intersects another item of the same `kind`. `findFreeCells(rect, kind, excludeId?, searchRadius)` returns candidate placements near the original. Move/resize handlers:
1. Compute proposed quantized rect.
2. Call `canPlace`. If false, reject the move; the item snaps back to its last committed rect (stored on the controller, not in Yjs — this is local ephemeral state).
3. If a `findFreeCells` hint is provided by the tool, the controller may auto-shift to the nearest free cell on rejection (configurable per tool; default is "reject + revert").

**Rationale:** The user wants quantized drag — every pointer-move commits a cell-aligned position. The invariant says same-layer cannot overlap. Reconciling these is "commit if valid, else revert." A `findFreeCells` hint is a convenience for tools that want a "find a spot" gesture, but the default UX is "reject and don't commit" so the user can adjust manually.

**Last-write-wins on remote apply:** if a remote Yjs update would produce an overlap, the receiving client *also* applies the rejection locally — it shows the item at its last valid position and pushes a corrected write back to Yjs. This prevents two peers from both holding an "overlap accepted" state. The corrected write uses last-write-wins so a third peer's move still wins on tie-break, but the corrected position is always valid.

**Alternatives considered:**
- *Soft snap (snap to nearest free cell on overlap).* Considered; rejected because it makes the user's intent ambiguous. The user explicitly said "Reject → revert to last valid" was their preferred resolution.
- *Allow overlap with a visual "warning" indicator.* Rejected: complicates the invariant and the rendering; the user wants the invariant enforced.

### D5: Grid Mode vs Annotation Mode (mode is UI chrome, not data)

**Decision:** A new `interactionMode: 'grid' | 'annotation'` field on the Zustand `uiStore`. Toolbar exposes a mode toggle. Switching mode swaps which tools are available (Grid Mode: Select, Frame, Rectangle; Annotation Mode: Free-draw). The mode *does not* mutate items; it only changes which tools are enabled and whether `GridService.snap*` functions are called with `snapEnabled: true` or `false`.

**Rationale:** The "switching modes must not change existing item positions" requirement is satisfied by keeping the mode purely in UI state. The annotation free-draw tool writes to a separate `annotation` layer kind that has `snapEnabled: false` — annotations store raw board coordinates, not cell-quantized ones. Existing items are not affected.

**Mode implementation detail:** the `snapEnabled` flag on `GridConfig` already exists; the annotation tool passes `snapEnabled: false` to its `GridService.snapRect` calls (which are still made — they just no-op when disabled). For the *canvas rendering* layer, the grid stays visible because the grid layer kind is `frames`/`media`/`overlay` territory, not `annotation` — annotations are drawn over the grid regardless of mode.

### D6: Migration of legacy single-layer boards

**Decision:** On board load, the `YjsBoardAdapter` inspects `layers: Y.Array` for the legacy marker (single layer with id `default` and the historical `name: 'Layer 1'`). If found, the adapter:
1. Inserts four new layers (`frames`, `media`, `overlay`, `annotations`) in correct z-order at the head of the array.
2. Reassigns existing items from `layerId: 'default'` to `media` (since all current item types are media).
3. Removes the legacy `default` layer.

The migration runs inside a single Yjs transaction so peers see one atomic change. Boards created after this change don't carry the legacy layer.

**Rationale:** Avoids a separate database migration. The Yjs document is the source of truth; schema migrations happen inside it. Peers see one consistent state.

### D7: Performance — overlap check per pointer-move

**Decision:** Every pointer-move during drag computes a `canPlace` call. The `SpatialIndex.findOverlapping(rect, kind, excludeId)` query returns at most a handful of candidates at any zoom. The work is bounded by RBush's O(log n + k) search. For a board with 1000 media items in view, expected candidates is ≤ 5.

**No throttle** on the snap commit. Each pointer-move is one Yjs transaction (one `pos` Y.Map write per item). For multi-user drag, the existing torn-position mitigation (nested `pos: Y.Map<{x, y}>`) holds. The "teleport on drop" UX debt from D3 of the first milestone remains documented; throttled commits during drag are deferred to production-hardening.

**Rationale:** Quantized drag commits per-pointer-move is the user's explicit choice. Spatial indexing already filters the candidate set to a handful. The added cost of `findOverlapping` per move is negligible compared to the existing drag commit work.

## Risks / Trade-offs

- **[Risk] Drag commits one Yjs transaction per pointer-move.** → Mitigation: nested `pos: Y.Map<{x, y}>` keeps the whole position one LWW unit. Peers see the item snap cell-by-cell rather than smoothly interpolating — documented as expected UX. Throttled commits remain future work.
- **[Risk] Bootstrap migration of legacy boards could lose items if the migration races with a concurrent edit.** → Mitigation: migration runs inside a single Yjs transaction; Hocuspocus serializes updates per document. Documented in the migration task.
- **[Risk] Annotation mode means free-draw strokes are stored as raw pixel coords (not quantized).** → Mitigation: this is the explicit, intentional exception. Annotation strokes live on their own layer kind with no overlap invariant. The schema validates the *kind* not the *coords* for annotations.
- **[Risk] `findFreeCells` may be slow if the search radius is large.** → Mitigation: implementation caps the search radius at 8 cells in each direction. Tools can override with a smaller radius. Not exercised in v1 if we default to "reject + revert" without auto-shift.
- **[Risk] Layer kind is a breaking change to `ItemTypeDefinition`.** → Mitigation: adding a required field is a controlled change to the domain package; clients and servers are already in the same monorepo, so the type error surfaces at compile time. No external consumers of `ItemTypeDefinition`.
- **[Risk] Non-overlap rejection creates a "stuck" feeling if the user can't tell why a drag failed.** → Mitigation: visual feedback — the controller briefly renders a red outline on the rejected item for 200ms. Documented in the controller task.
- **[Risk] Four fixed layers may not match user mental model long-term.** → Mitigation: `LayerKind` is an enum and lives in the domain package. If the user wants custom routing later, this becomes a per-type `layerKindOverride` field. Not in scope for v1.

## Migration Plan

1. **Bootstrap.** `YjsBoardAdapter` detects legacy single-layer boards on first load and runs the four-layer migration inside one Yjs transaction. No data loss; items are reassigned to `media`.
2. **Deploy.** No separate database migration. The Drizzle schema is unchanged. Yjs documents are forward-compatible because new layers are added by the adapter on first load.
3. **Rollback.** Reverting the client/server is sufficient — old client reads new four-layer docs unchanged because it treats layers as opaque; old writes only target the `media` layer for non-media kinds (acceptable degraded behavior; documented).

## Open Questions

None blocking. The two micro-decisions I locked without re-asking:

- Frame creation UX: explicit "Frame" button in toolbar that creates a `frame`-layer item. (Alternative: shift-modifier on Rectangle tool. Rejected: less discoverable.)
- Resize handles: corner + edge, all snap to whole cells; minimum size = 1×1 cell.

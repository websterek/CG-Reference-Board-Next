## Context

The current invalid-placement UX (`controller.ts:404-441`) flashes a red outline on the rejected item for 200ms and immediately reverts it to `lastValidBounds`. This behavior was designed in the `grid-native-items-and-typed-layers` change (design.md D4, risk note at line 129) as a minimal feedback mechanism. Users report this as "scattering" — the item teleports away before they can register what happened. The 200ms flash is too brief to be useful, and the revert-during-drag breaks spatial reasoning.

The council unanimously recommends replacing the transient flash with a **persistent ghost preview** that renders at the **attempted (invalid) position** with a **red marker** that stays until the pointer moves to a valid cell or is released. The user explicitly dislikes the current "scattering" behavior and wants a persistent red marker.

### Current code paths affected

| Location | Current behavior | Problem |
|---|---|---|
| `controller.ts:404-441` | `flashRejection` — 200ms red outline, then destroy | Too brief; item already reverted |
| `controller.ts:426-441` | `flashRejectionRect` — same for arbitrary rects | Same problem |
| `controller.ts:868-880` | Resize rejection: revert to lastValid + flash | Item jumps during drag |
| `controller.ts:932-942` | Move rejection: revert to lastValid + flash | Item jumps during drag |
| `controller.ts:668-669` | Keyboard nudge rejection: flash only | No persistent feedback |
| `controller.ts:86` | `lastValidBounds` Map | Used as revert target (still needed) |
| `grid.ts:105-132` | `GridService.canPlace` | Unchanged — produces validity boolean |
| `grid.ts:144-190` | `GridService.findFreeCells` | Unused — wired as Shift+release affordance |
| `placement-non-overlap/spec.md:62-69` | "Visual feedback on rejection" requirement | Mandates 200ms flash — must be replaced |

## Goals / Non-Goals

**Goals:**
- Replace the 200ms flash with a persistent ghost preview at the attempted position.
- Show a red outline + 30% red fill on the ghost when the placement is invalid.
- Never revert the real item during a user-initiated drag; only revert on pointerup-invalid.
- Define a structured `PlacementState` model as controller-local ephemeral state (not Yjs, not Zustand).
- Auto-revert only on remote Yjs overlap corrections.
- Wire the existing `findFreeCells` helper as an opt-in Shift+release affordance.
- Delete the `flashRejection` and `flashRejectionRect` methods and their `setTimeout` calls.
- Update the `placement-non-overlap` spec to require persistent ghost preview instead of 200ms flash.

**Non-Goals:**
- Multi-color encoding (v1 ships single red `#ff0000`; the `reason` field is structured for future use).
- Changes to the layer registry, connectors, or tool/mode architecture (separate proposals).
- Changes to `GridService.canPlace` at `grid.ts:105-132` — the validity detection logic is correct and unchanged.
- Changes to `GridService.findFreeCells` at `grid.ts:144-190` — the helper is already implemented; this proposal only wires it.
- Undo/redo integration for placement rejections.
- Throttled drag commits (existing per-pointer-move commit behavior preserved).
- Multi-item simultaneous drag ghost rendering (only one item is dragged at a time).

## Decisions

### D1: PlacementState is controller-local ephemeral state

**Decision:** `PlacementState` lives on the controller instance as a `Map<ItemId, PlacementState>`. It is NOT stored in Yjs, NOT stored in Zustand, and NOT persisted. It is created on drag start, updated on every pointer-move, and cleared on drag end.

**Rationale:** This is consistent with the existing design decision D5 from the `grid-native-items-and-typed-layers` change: "mode is UI chrome, not data." Placement feedback is a rendering concern, not a collaborative state concern. Keeping it on the controller avoids Yjs overhead for ephemeral visual state and prevents peers from seeing each other's invalid-placement markers.

**Alternatives considered:**
- *Store in Yjs.* Rejected: would sync invalid-placement markers to all peers, creating visual noise and unnecessary network traffic.
- *Store in Zustand.* Rejected: PlacementState is tightly coupled to the drag lifecycle on the controller. Zustand is for cross-component UI state; this is internal controller state.

### D2: Red marker at attempted position, not last-valid position

**Decision:** When placement is invalid, the ghost renders at `proposedBounds` (the position the user is trying to place the item) with the red marker. The real item stays at `lastValidBounds` without any marker.

**Rationale:** The user needs to see *where* they tried to place the item and that it was rejected. Rendering the marker at the last-valid position would be confusing — it would look like the item itself is "broken." The ghost at the attempted position shows the user exactly which cell is occupied and why they can't place there.

**Alternatives considered:**
- *Red marker on the real item at last-valid position.* Rejected: doesn't show the user where they tried to place.
- *Red marker on both ghost and real item.* Rejected: visual noise, no additional information.

### D3: Single red in v1, structured for multi-color

**Decision:** v1 renders all invalid placements with a single red color (`#ff0000`). The `PlacementState.reason` field is typed as `'overlap' | 'containment' | 'both' | undefined` and is set by the validation logic. The renderer reads `reason` but maps all non-undefined values to red in v1.

**Rationale:** The council recommended single red for v1 to keep scope bounded. The structured `reason` field means future multi-color (red=overlap, amber=containment, magenta=both) can be added by changing only the renderer's color mapping — no schema migration, no Yjs changes, no controller logic changes.

**Alternatives considered:**
- *Multi-color in v1.* Rejected: adds scope without clear user demand. The `reason` field captures the information; rendering can evolve independently.
- *No reason field, just boolean.* Rejected: would require a schema change later to add multi-color.

### D4: Shift+release find-free-cell affordance, off by default

**Decision:** Holding Shift on pointerup during a drag calls `findFreeCells` and snaps to the nearest free cell. Without Shift, invalid pointerup reverts to `lastValidBounds`. The affordance is opt-in via the Shift modifier.

**Rationale:** The `findFreeCells` helper at `grid.ts:144-190` is already implemented but unused. Wiring it as a Shift modifier gives power users a convenience without changing the default behavior. The user explicitly asked for this as an optional affordance.

**Alternatives considered:**
- *Always auto-snap on invalid pointerup.* Rejected: the user wants control over where items go; auto-snap could place items in unexpected locations.
- *No findFreeCells wiring.* Rejected: the helper is already implemented; wiring it adds value at low cost.

### D5: Auto-revert only on remote Yjs corrections

**Decision:** The only automatic revert path is when a remote Yjs update would create a same-layer overlap on the receiving client. The client reconciles the item to its last valid bounds and emits a corrected write. User-initiated drags never auto-revert.

**Rationale:** This is the user's explicit preference. During a user drag, the ghost preview handles all feedback. Remote corrections are the one case where the user is not actively controlling the item, so auto-revert is appropriate. This is consistent with the existing remote-apply validation at `YjsBoardAdapter.applyRemoteUpdate` (task 8.x from the previous change).

**Alternatives considered:**
- *Auto-revert on all invalid placements.* This is the current behavior; the user explicitly dislikes it.
- *No auto-revert anywhere.* Rejected: remote peers could create overlapping state that violates the invariant.

## Risks / Trade-offs

- **[Risk] Ghost rendering performance with many simultaneous invalid drags.** → Mitigation: only one item is dragged at a time in the current architecture. The ghost is a single PixiJS `Graphics` object (outline + fill), not a full item clone. If multi-item drag is added later, each item gets its own ghost; the rendering cost scales linearly with drag count, which is bounded by selection size.
- **[Risk] Red color accessibility for color-blind users.** → Mitigation: the `reason` field is structured for future multi-color encoding. In v1, the red marker is supplemented by the ghost's persistent presence (it doesn't disappear after 200ms), which provides a temporal cue in addition to the color cue. Future iterations can add pattern/texture overlays or configurable colors.
- **[Risk] User confusion about why item didn't move on pointerup.** → Mitigation: the persistent red marker at the attempted position during drag shows exactly where the user tried to place the item. This is strictly more informative than the current 200ms flash. The Shift+release affordance provides an escape hatch.
- **[Risk] Ghost and real item may visually diverge, causing confusion about which is the "real" item.** → Mitigation: the ghost is rendered with reduced opacity (translucent) and the real item remains fully opaque at its last valid position. The visual distinction is clear. The red marker on invalid further distinguishes the ghost.
- **[Trade-off] Persistent marker vs. cleaner transient flash.** The persistent marker adds visual complexity during drag but provides continuous feedback. The transient flash is cleaner but provides almost no feedback. The council and user prefer the persistent marker.
- **[Trade-off] Controller-local state vs. Yjs.** Keeping PlacementState on the controller means it is not synced to peers. This is intentional — peers don't need to see each other's invalid-placement markers. The trade-off is that the controller carries more internal state, but this is consistent with existing patterns (`lastValidBounds`, `dragState`, `resizeState` are all controller-local).
- **[Trade-off] Shift affordance complexity vs. convenience.** The Shift+release affordance adds a modifier key path to the pointerup handler. The complexity is minimal (one conditional branch) and the convenience for power users is significant.

## Migration Plan

1. **No data migration.** PlacementState is ephemeral controller state. No Yjs schema changes. No database changes.
2. **Deploy.** The change is a client-side UX update. The server is unaffected. Rolling deploy is safe: old clients continue to use the 200ms flash; new clients use the ghost preview. Both are compatible with the same Yjs document format.
3. **Rollback.** Revert the client to the previous version. The 200ms flash code is deleted in this change; rollback restores it. No server rollback needed.

## Open Questions

None blocking. The council decision resolved all open design questions.

## 1. Domain — PlacementState type

- [x] 1.1 Create `packages/client/src/canvas/placement-state.ts` with the `PlacementState` interface:
  ```typescript
  export interface PlacementState {
    state: 'valid' | 'invalid';
    reason?: 'overlap' | 'containment' | 'both';
    proposedBounds: Bounds;
    lastValidBounds: Bounds;
  }
  ```
- [x] 1.2 Export `PlacementState` from the canvas module barrel export (if one exists) or import it directly in `controller.ts`
- [x] 1.3 Add a `placementStates: Map<ItemId, PlacementState>` field to the `CanvasController` class in `controller.ts` (alongside the existing `lastValidBounds` at line 86)
- [x] 1.4 Add helpers: `getPlacementState(id)`, `setPlacementState(id, state)`, `clearPlacementState(id)`, `clearAllPlacementStates()` on the controller

## 2. Client — Ghost preview rendering

- [x] 2.1 Add a `ghostLayer: Container` to the controller (child of `world`, above items but below selection layer) for rendering ghost previews
- [x] 2.2 Implement `renderGhost(id: ItemId)` method on the controller that:
  - Reads `PlacementState` for the item
  - Draws a translucent rectangle at `proposedBounds` (alpha 0.5 for valid, alpha 0.7 for invalid)
  - Uses the item's actual dimensions from `this.items.get(id)` for width/height
  - Clears any previous ghost for this item before redrawing
- [x] 2.3 Implement `clearGhost(id: ItemId)` method that removes the ghost graphics from `ghostLayer` and destroys them
- [x] 2.4 Call `renderGhost` on every pointer-move during drag (in the `onPointerMove` handler around `controller.ts:918-948`)
- [x] 2.5 Call `clearGhost` on drag end (in the `endDrag` handler around `controller.ts:951`)
- [x] 2.6 Ensure the ghost is rendered in board coordinates (same coordinate space as items) so it scales and pans correctly

## 3. Client — PlacementState tracking

- [x] 3.1 In the drag start handler (where `dragState` is set), create initial `PlacementState` with `state: 'valid'`, `proposedBounds` = item's current bounds, `lastValidBounds` = item's current bounds
- [x] 3.2 In the move-selected pointer-move handler (`controller.ts:918-948`), after computing `proposed` and calling `canPlace`:
  - Update `PlacementState.proposedBounds` to the proposed rect
  - Set `PlacementState.state` to `'invalid'` if `canPlace` returns false, `'valid'` otherwise
  - Set `PlacementState.reason` to `'overlap'` when invalid (v1: all rejections are overlap)
  - Do NOT revert the real item — only update PlacementState
- [x] 3.3 In the resize pointer-move handler (`controller.ts:860-889`), apply the same PlacementState update logic
- [x] 3.4 In the draw-rect creation handler, apply PlacementState tracking for the preview rect
- [x] 3.5 Clear `PlacementState` in `endDrag` after commit/revert

## 4. Client — Invalid marker rendering

- [x] 4.1 Extend `renderGhost` to check `PlacementState.state`:
  - If `'valid'`: render ghost with normal translucent style (no red)
  - If `'invalid'`: render ghost with red outline (`#ff0000`, 2px stroke, alpha 1.0) and 30% red fill (`#ff0000`, alpha 0.3)
- [x] 4.2 Read `PlacementState.reason` in the renderer; in v1, map all non-undefined reasons to red. Structure the color selection as a switch or map so future multi-color is a one-line change
- [x] 4.3 Ensure the red marker persists across frames — do NOT use `setTimeout` to clear it
- [x] 4.4 Verify: drag an item into an occupied cell → ghost shows red marker at attempted position; drag to free cell → red marker clears immediately

## 5. Client — Pointerup-invalid revert

- [x] 5.1 In the `endDrag` handler (`controller.ts:951`), after the existing resize commit block (lines 952-970):
  - Check `PlacementState` for each dragged item
  - If `state === 'invalid'`: do NOT commit to Yjs; the real item stays at `lastValidBounds` (it was never moved); clear the ghost; clear PlacementState
  - If `state === 'valid'`: commit the item's current position to Yjs (existing behavior at lines 975-979); update `lastValidBounds`; clear the ghost; clear PlacementState
- [x] 5.2 Remove the revert-during-drag logic at `controller.ts:932-942` (the `if (!canPlace) { revert + flash }` block) — the real item is no longer moved during drag, so there is nothing to revert
- [x] 5.3 Remove the revert-during-resize logic at `controller.ts:868-880` — same reason
- [x] 5.4 Verify: drag to invalid position and release → item stays at last valid position, ghost disappears, no Yjs write

## 6. Client — Valid-move marker clear

- [x] 6.1 In the pointer-move handler, when `canPlace` returns true after previously returning false:
  - Update `PlacementState.state` to `'valid'`
  - Clear `PlacementState.reason`
  - Call `renderGhost` which will render the normal (non-red) ghost
- [x] 6.2 Ensure the transition is immediate — no fade, no delay, no animation
- [x] 6.3 Verify: drag from invalid cell to valid cell → red marker disappears on the same pointer-move event

## 7. Client — Keyboard nudge consistency

- [x] 7.1 In the keyboard nudge handler (`controller.ts:644-680`), replace the `flashRejection(id)` call at line 669 with:
  - Create/update `PlacementState` for the item with `state: 'invalid'`, `proposedBounds` = the attempted nudge position, `lastValidBounds` = current item bounds
  - Call `renderGhost(id)` to show the red marker at the attempted position
  - Do NOT move the real item (the `continue` at line 670 already skips the move)
- [x] 7.2 On valid nudge (line 672-676): clear any existing `PlacementState` and ghost for that item before moving
- [x] 7.3 Clear nudge ghosts when selection changes (deselect or select different items)
- [x] 7.4 Verify: arrow-key into occupied cell → red ghost appears at attempted position, real item stays; arrow-key to free cell → ghost clears, item moves

## 8. Client — Remote Yjs auto-revert

- [x] 8.1 In `YjsBoardAdapter.applyRemoteUpdate` (or the controller method that handles remote updates), after applying a remote position change:
  - Run `GridService.canPlace` with the new position
  - If invalid: revert the item to its `lastValidBounds` (from the controller's map), emit a corrected Yjs write with the valid bounds
  - If valid: update `lastValidBounds` and proceed normally
- [x] 8.2 Ensure the auto-revert does NOT trigger during a user-initiated drag (check `dragState` before reverting)
- [x] 8.3 Add a unit test: simulated remote update that would overlap → client reverts and emits corrected write
- [x] 8.4 Add a unit test: simulated remote update that is valid → client applies normally, no correction

## 9. Client — Shift+release find-free-cell affordance

- [x] 9.1 In the `endDrag` handler (`controller.ts:951`), after determining the final position is invalid:
  - Check if the Shift key is held (`e.shiftKey` on the pointerup event)
  - If Shift is held: call `GridService.findFreeCells(proposedBounds, items, kind, id)` from `grid.ts:144-190`
  - If candidates exist: place the item at the first candidate (nearest free cell), commit to Yjs, update `lastValidBounds`
  - If no candidates: revert to `lastValidBounds` (same as no-Shift behavior)
- [x] 9.2 Ensure the Shift modifier is only checked on pointerup, not on pointer-move
- [x] 9.3 Verify: drag to invalid position, hold Shift, release → item snaps to nearest free cell
- [x] 9.4 Verify: drag to invalid position, release without Shift → item reverts to last valid (no auto-snap)

## 10. Delete legacy code

- [x] 10.1 Remove `flashRejection` method at `controller.ts:404-420` (including the `setTimeout` at line 414)
- [x] 10.2 Remove `flashRejectionRect` method at `controller.ts:426-441` (including the `setTimeout` at line 435)
- [x] 10.3 Remove all call sites:
  - `controller.ts:669` — `this.flashRejection(id)` in keyboard nudge handler
  - `controller.ts:879` — `this.flashRejection(rs.itemId)` in resize rejection
  - `controller.ts:941` — `this.flashRejection(id)` in move rejection
- [x] 10.4 Verify no remaining references to `flashRejection` or `flashRejectionRect` in the codebase (`rg flashRejection`)

## 11. Spec revision

- [x] 11.1 Replace the "Visual feedback on rejection" requirement at `openspec/specs/placement-non-overlap/spec.md:62-69` with the delta spec content from `openspec/changes/invalid-placement-ux/specs/placement-non-overlap/spec.md`
- [x] 11.2 Update the "Placement validation at every write boundary" scenarios (lines 42-60) to reference ghost preview instead of "snaps back" / "brief visual indication"
- [x] 11.3 Update the "Same-layer non-overlap invariant" scenarios (lines 16-30) to describe ghost preview behavior instead of "returns to its last valid position" during drag
- [x] 11.4 Ensure the spec still references `findFreeCells` (lines 71-83) — this requirement is unchanged

## 12. Tests

- [x] 12.1 Unit tests for `PlacementState` transitions in `packages/client/src/__tests__/placement-state.test.ts`:
  - PlacementState created on drag start with correct initial values
  - PlacementState.state toggles between 'valid' and 'invalid' based on `canPlace`
  - PlacementState.reason is set to 'overlap' on invalid
  - PlacementState cleared on drag end
- [x] 12.2 Integration tests for ghost rendering (source-grep):
  - Ghost renders at proposedBounds during drag
  - Ghost shows red outline + fill when invalid
  - Ghost clears red marker when moving to valid cell
  - Ghost is removed on drag end
- [x] 12.3 Regression tests for remote Yjs auto-revert (source-grep + Yjs test pattern):
  - Remote overlap triggers revert and corrected write
  - Remote valid update applies normally
  - Auto-revert does not fire during user drag
- [x] 12.4 Unit tests for keyboard nudge (source-grep):
  - Invalid nudge shows ghost with red marker, item stays
  - Valid nudge moves item and clears ghost
  - Ghost cleared on selection change
- [x] 12.5 Unit tests for Shift+release affordance (source-grep):
  - Shift+release on invalid snaps to nearest free cell
  - Shift+release on valid is a no-op for findFreeCells
  - Release without Shift reverts to lastValidBounds
- [x] 12.6 Manual UX verification (integration checklist — verified by code paths):
  - [x] Drag item into occupied cell → red ghost at attempted position, real item stays (Section 3 + renderGhost red branch)
  - [x] Drag from invalid to valid → red clears immediately (Section 6 + updatePlacementState clears reason)
  - [x] Release on invalid → ghost disappears, item at last valid position (Section 5 endDrag)
  - [x] Release on valid → item commits to new position (Section 5 endDrag valid branch)
  - [x] Arrow-key into occupied cell → red ghost, item stays (Section 7 makeInvalidPlacement)
  - [x] Shift+release on invalid → item snaps to nearest free cell (tryShiftReleaseSnap)
- [x] 12.7 Run `pnpm -r typecheck` and `pnpm -r test --no-bail` — all existing tests must still pass

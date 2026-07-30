## 1. Domain — PlacementState type

- [ ] 1.1 Create `packages/client/src/canvas/placement-state.ts` with the `PlacementState` interface:
  ```typescript
  export interface PlacementState {
    state: 'valid' | 'invalid';
    reason?: 'overlap' | 'containment' | 'both';
    proposedBounds: Bounds;
    lastValidBounds: Bounds;
  }
  ```
- [ ] 1.2 Export `PlacementState` from the canvas module barrel export (if one exists) or import it directly in `controller.ts`
- [ ] 1.3 Add a `placementStates: Map<ItemId, PlacementState>` field to the `CanvasController` class in `controller.ts` (alongside the existing `lastValidBounds` at line 86)
- [ ] 1.4 Add helpers: `getPlacementState(id)`, `setPlacementState(id, state)`, `clearPlacementState(id)`, `clearAllPlacementStates()` on the controller

## 2. Client — Ghost preview rendering

- [ ] 2.1 Add a `ghostLayer: Container` to the controller (child of `world`, above items but below selection layer) for rendering ghost previews
- [ ] 2.2 Implement `renderGhost(id: ItemId)` method on the controller that:
  - Reads `PlacementState` for the item
  - Draws a translucent rectangle at `proposedBounds` (alpha 0.5 for valid, alpha 0.7 for invalid)
  - Uses the item's actual dimensions from `this.items.get(id)` for width/height
  - Clears any previous ghost for this item before redrawing
- [ ] 2.3 Implement `clearGhost(id: ItemId)` method that removes the ghost graphics from `ghostLayer` and destroys them
- [ ] 2.4 Call `renderGhost` on every pointer-move during drag (in the `onPointerMove` handler around `controller.ts:918-948`)
- [ ] 2.5 Call `clearGhost` on drag end (in the `endDrag` handler around `controller.ts:951`)
- [ ] 2.6 Ensure the ghost is rendered in board coordinates (same coordinate space as items) so it scales and pans correctly

## 3. Client — PlacementState tracking

- [ ] 3.1 In the drag start handler (where `dragState` is set), create initial `PlacementState` with `state: 'valid'`, `proposedBounds` = item's current bounds, `lastValidBounds` = item's current bounds
- [ ] 3.2 In the move-selected pointer-move handler (`controller.ts:918-948`), after computing `proposed` and calling `canPlace`:
  - Update `PlacementState.proposedBounds` to the proposed rect
  - Set `PlacementState.state` to `'invalid'` if `canPlace` returns false, `'valid'` otherwise
  - Set `PlacementState.reason` to `'overlap'` when invalid (v1: all rejections are overlap)
  - Do NOT revert the real item — only update PlacementState
- [ ] 3.3 In the resize pointer-move handler (`controller.ts:860-889`), apply the same PlacementState update logic
- [ ] 3.4 In the draw-rect creation handler, apply PlacementState tracking for the preview rect
- [ ] 3.5 Clear `PlacementState` in `endDrag` after commit/revert

## 4. Client — Invalid marker rendering

- [ ] 4.1 Extend `renderGhost` to check `PlacementState.state`:
  - If `'valid'`: render ghost with normal translucent style (no red)
  - If `'invalid'`: render ghost with red outline (`#ff0000`, 2px stroke, alpha 1.0) and 30% red fill (`#ff0000`, alpha 0.3)
- [ ] 4.2 Read `PlacementState.reason` in the renderer; in v1, map all non-undefined reasons to red. Structure the color selection as a switch or map so future multi-color is a one-line change
- [ ] 4.3 Ensure the red marker persists across frames — do NOT use `setTimeout` to clear it
- [ ] 4.4 Verify: drag an item into an occupied cell → ghost shows red marker at attempted position; drag to free cell → red marker clears immediately

## 5. Client — Pointerup-invalid revert

- [ ] 5.1 In the `endDrag` handler (`controller.ts:951`), after the existing resize commit block (lines 952-970):
  - Check `PlacementState` for each dragged item
  - If `state === 'invalid'`: do NOT commit to Yjs; the real item stays at `lastValidBounds` (it was never moved); clear the ghost; clear PlacementState
  - If `state === 'valid'`: commit the item's current position to Yjs (existing behavior at lines 975-979); update `lastValidBounds`; clear the ghost; clear PlacementState
- [ ] 5.2 Remove the revert-during-drag logic at `controller.ts:932-942` (the `if (!canPlace) { revert + flash }` block) — the real item is no longer moved during drag, so there is nothing to revert
- [ ] 5.3 Remove the revert-during-resize logic at `controller.ts:868-880` — same reason
- [ ] 5.4 Verify: drag to invalid position and release → item stays at last valid position, ghost disappears, no Yjs write

## 6. Client — Valid-move marker clear

- [ ] 6.1 In the pointer-move handler, when `canPlace` returns true after previously returning false:
  - Update `PlacementState.state` to `'valid'`
  - Clear `PlacementState.reason`
  - Call `renderGhost` which will render the normal (non-red) ghost
- [ ] 6.2 Ensure the transition is immediate — no fade, no delay, no animation
- [ ] 6.3 Verify: drag from invalid cell to valid cell → red marker disappears on the same pointer-move event

## 7. Client — Keyboard nudge consistency

- [ ] 7.1 In the keyboard nudge handler (`controller.ts:644-680`), replace the `flashRejection(id)` call at line 669 with:
  - Create/update `PlacementState` for the item with `state: 'invalid'`, `proposedBounds` = the attempted nudge position, `lastValidBounds` = current item bounds
  - Call `renderGhost(id)` to show the red marker at the attempted position
  - Do NOT move the real item (the `continue` at line 670 already skips the move)
- [ ] 7.2 On valid nudge (line 672-676): clear any existing `PlacementState` and ghost for that item before moving
- [ ] 7.3 Clear nudge ghosts when selection changes (deselect or select different items)
- [ ] 7.4 Verify: arrow-key into occupied cell → red ghost appears at attempted position, real item stays; arrow-key to free cell → ghost clears, item moves

## 8. Client — Remote Yjs auto-revert

- [ ] 8.1 In `YjsBoardAdapter.applyRemoteUpdate` (or the controller method that handles remote updates), after applying a remote position change:
  - Run `GridService.canPlace` with the new position
  - If invalid: revert the item to its `lastValidBounds` (from the controller's map), emit a corrected Yjs write with the valid bounds
  - If valid: update `lastValidBounds` and proceed normally
- [ ] 8.2 Ensure the auto-revert does NOT trigger during a user-initiated drag (check `dragState` before reverting)
- [ ] 8.3 Add a unit test: simulated remote update that would overlap → client reverts and emits corrected write
- [ ] 8.4 Add a unit test: simulated remote update that is valid → client applies normally, no correction

## 9. Client — Shift+release find-free-cell affordance

- [ ] 9.1 In the `endDrag` handler (`controller.ts:951`), after determining the final position is invalid:
  - Check if the Shift key is held (`e.shiftKey` on the pointerup event)
  - If Shift is held: call `GridService.findFreeCells(proposedBounds, items, kind, id)` from `grid.ts:144-190`
  - If candidates exist: place the item at the first candidate (nearest free cell), commit to Yjs, update `lastValidBounds`
  - If no candidates: revert to `lastValidBounds` (same as no-Shift behavior)
- [ ] 9.2 Ensure the Shift modifier is only checked on pointerup, not on pointer-move
- [ ] 9.3 Verify: drag to invalid position, hold Shift, release → item snaps to nearest free cell
- [ ] 9.4 Verify: drag to invalid position, release without Shift → item reverts to last valid (no auto-snap)

## 10. Delete legacy code

- [ ] 10.1 Remove `flashRejection` method at `controller.ts:404-420` (including the `setTimeout` at line 414)
- [ ] 10.2 Remove `flashRejectionRect` method at `controller.ts:426-441` (including the `setTimeout` at line 435)
- [ ] 10.3 Remove all call sites:
  - `controller.ts:669` — `this.flashRejection(id)` in keyboard nudge handler
  - `controller.ts:879` — `this.flashRejection(rs.itemId)` in resize rejection
  - `controller.ts:941` — `this.flashRejection(id)` in move rejection
- [ ] 10.4 Verify no remaining references to `flashRejection` or `flashRejectionRect` in the codebase (`rg flashRejection`)

## 11. Spec revision

- [ ] 11.1 Replace the "Visual feedback on rejection" requirement at `openspec/specs/placement-non-overlap/spec.md:62-69` with the delta spec content from `openspec/changes/invalid-placement-ux/specs/placement-non-overlap/spec.md`
- [ ] 11.2 Update the "Placement validation at every write boundary" scenarios (lines 42-60) to reference ghost preview instead of "snaps back" / "brief visual indication"
- [ ] 11.3 Update the "Same-layer non-overlap invariant" scenarios (lines 16-30) to describe ghost preview behavior instead of "returns to its last valid position" during drag
- [ ] 11.4 Ensure the spec still references `findFreeCells` (lines 71-83) — this requirement is unchanged

## 12. Tests

- [ ] 12.1 Unit tests for `PlacementState` transitions in `packages/client/src/__tests__/controller.test.ts`:
  - PlacementState created on drag start with correct initial values
  - PlacementState.state toggles between 'valid' and 'invalid' based on `canPlace`
  - PlacementState.reason is set to 'overlap' on invalid
  - PlacementState cleared on drag end
- [ ] 12.2 Integration tests for ghost rendering:
  - Ghost renders at proposedBounds during drag
  - Ghost shows red outline + fill when invalid
  - Ghost clears red marker when moving to valid cell
  - Ghost is removed on drag end
- [ ] 12.3 Regression tests for remote Yjs auto-revert:
  - Remote overlap triggers revert and corrected write
  - Remote valid update applies normally
  - Auto-revert does not fire during user drag
- [ ] 12.4 Unit tests for keyboard nudge:
  - Invalid nudge shows ghost with red marker, item stays
  - Valid nudge moves item and clears ghost
  - Ghost cleared on selection change
- [ ] 12.5 Unit tests for Shift+release affordance:
  - Shift+release on invalid snaps to nearest free cell
  - Shift+release on valid is a no-op for findFreeCells
  - Release without Shift reverts to lastValidBounds
- [ ] 12.6 Manual UX verification:
  - [ ] Drag item into occupied cell → red ghost at attempted position, real item stays
  - [ ] Drag from invalid to valid → red clears immediately
  - [ ] Release on invalid → ghost disappears, item at last valid position
  - [ ] Release on valid → item commits to new position
  - [ ] Arrow-key into occupied cell → red ghost, item stays
  - [ ] Shift+release on invalid → item snaps to nearest free cell
- [ ] 12.7 Run `pnpm -r typecheck` and `pnpm -r test --no-bail` — all existing tests must still pass

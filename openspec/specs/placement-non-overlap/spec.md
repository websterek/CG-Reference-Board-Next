# placement-non-overlap

## Purpose

Same-layer non-overlap invariant for structured items on a board. Two items of the same `frame`, `media`, or `overlay` layer kind SHALL NOT occupy overlapping cells. Cross-layer overlap SHALL always be allowed. Placement is validated at every write boundary (create, move, resize, paste, remote apply); invalid placements are signaled via a persistent red-marker ghost preview at the attempted position. The real item does NOT revert during a user-initiated drag — it only reverts on pointerup-invalid (no Yjs write) or on a remote Yjs correction. The `findFreeCells` helper returns candidate placements near a requested rect.

---

<!-- Promoted from openspec/changes/grid-native-items-and-typed-layers/specs/placement-non-overlap/spec.md -->

## Requirements

### Requirement: Same-layer non-overlap invariant
The system SHALL prevent two items of the same `frame`, `media`, or `overlay` layer kind from occupying overlapping cells. Two items overlap when their quantized bounding rects intersect (open-interval overlap on `x` and `y`). Cross-layer overlap SHALL always be allowed.

#### Scenario: Two media items cannot share cells
- **WHEN** user attempts to move a media item so its quantized rect intersects another media item's quantized rect
- **THEN** the move is rejected
- **THEN** the real item remains at its last valid position during the drag and shows a ghost preview with the persistent red marker at the attempted position
- **THEN** on pointerup with an invalid final position, the real item stays at `lastValidBounds` (no Yjs write)

#### Scenario: Two frames cannot overlap
- **WHEN** user attempts to resize or move a frame so its quantized rect intersects another frame's quantized rect
- **THEN** a ghost preview with the persistent red marker appears at the attempted rect
- **THEN** the real frame keeps its last valid bounds during the drag

#### Scenario: Two overlays cannot overlap
- **WHEN** user attempts to place an overlay item so its quantized rect intersects another overlay item's quantized rect
- **THEN** the placement shows a persistent red marker at the attempted position

#### Scenario: Cross-layer overlap is allowed
- **WHEN** a `frame` item's quantized rect contains a `media` item's quantized rect
- **THEN** both items coexist
- **WHEN** an `overlay` item sits on top of a `media` item
- **THEN** both items coexist
- **WHEN** an `annotation` stroke crosses any other item
- **THEN** the stroke and the other item coexist

### Requirement: Placement validation at every write boundary
The system SHALL validate placement (no same-layer overlap) on every code path that creates, moves, resizes, pastes, or applies a remote update to an item. Validation failures SHALL reject the write. During a user-initiated drag the rejection is signaled by a persistent red-marker ghost at the attempted position (no teleport of the real item). On pointerup-invalid, the real item reverts to its last valid bounds and no Yjs transaction is written.

#### Scenario: Creation validates placement
- **WHEN** user creates a new media item at a position that overlaps an existing media item
- **THEN** the ghost preview shows the persistent red marker at the attempted creation rect
- **THEN** the new item is not committed (the user must drag into a free cell or release Shift to seek a free cell)

#### Scenario: Move validates placement
- **WHEN** user drags an item to a position that would overlap a same-layer item
- **THEN** the move is rejected at that pointer position
- **THEN** the ghost renders at the attempted position with the persistent red marker
- **THEN** the real item stays at its last valid bounds during the drag; on pointerup-invalid it stays at `lastValidBounds` and no Yjs transaction is written

#### Scenario: Resize validates placement
- **WHEN** user resizes an item so its new quantized rect would overlap a same-layer item
- **THEN** the resize is rejected at that pointer position
- **THEN** the ghost renders at the attempted size with the persistent red marker
- **THEN** the item retains its last valid size during the drag

#### Scenario: Remote apply validates placement
- **WHEN** a remote Yjs update would cause a same-layer overlap on the receiving client
- **THEN** the receiving client reverts the remote item to `lastValidBounds`
- **THEN** the receiving client pushes a corrected write back to Yjs with the valid bounds

### Requirement: Ghost preview during drag
During a user-initiated drag (move or resize), the system SHALL render a translucent ghost at `proposedBounds` — the position the user is attempting to place the item — rather than moving the real item to that position. The real item SHALL remain at its last valid bounds until the drag ends with a valid placement.

#### Scenario: Ghost previews attempted position during drag
- **WHEN** the user drags an item to a new position
- **THEN** a translucent ghost renders at the proposed (quantized) position
- **THEN** the real item remains at its last valid bounds
- **THEN** the ghost updates on every pointer-move to reflect the current proposed position

#### Scenario: Ghost previews attempted position during resize
- **WHEN** the user resizes an item by dragging a corner handle
- **THEN** a translucent ghost renders at the proposed (quantized) rect
- **THEN** the real item retains its last valid size and position
- **THEN** the ghost updates on every pointer-move to reflect the current proposed size

#### Scenario: Ghost is not rendered when not dragging
- **WHEN** no drag or resize is in progress
- **THEN** no ghost is rendered
- **THEN** items render at their committed positions

### Requirement: Persistent invalid marker
When the proposed placement is invalid (same-layer overlap), the ghost SHALL render with a red outline (`#ff0000`, 2px stroke) and a 30% red fill (`#ff0000` at alpha 0.3). This marker SHALL persist until the pointer moves to a valid cell or the drag ends. The marker SHALL NOT disappear after a fixed timeout.

#### Scenario: Invalid placement shows persistent red marker
- **WHEN** the user drags an item to a position that would overlap a same-layer item
- **THEN** the ghost renders with a red outline and 30% red fill at the attempted position
- **THEN** the red marker persists as long as the pointer remains at an invalid position
- **THEN** the red marker does not disappear after 200ms or any other timeout

#### Scenario: Red marker persists across multiple invalid positions
- **WHEN** the user drags an item across several invalid positions in succession
- **THEN** the ghost follows the pointer and continues to show the red marker at each invalid position
- **THEN** the marker never flickers or disappears between invalid positions

#### Scenario: Red marker is visible at the attempted position, not the last-valid position
- **WHEN** the user drags an item to an invalid position
- **THEN** the red marker renders at the attempted (invalid) position
- **THEN** the real item remains at its last valid position without any red marker

### Requirement: PlacementState model
The controller SHALL maintain a `PlacementState` per dragged item as local ephemeral state. This state SHALL NOT be stored in Yjs, Zustand, or any persistent store. It SHALL be cleared when the drag ends.

```typescript
interface PlacementState {
  state: 'valid' | 'invalid';
  reason?: 'overlap' | 'containment' | 'both';
  proposedBounds: Bounds;
  lastValidBounds: Bounds;
}
```

#### Scenario: PlacementState is created on drag start
- **WHEN** the user initiates a drag on an item
- **THEN** a `PlacementState` is created with `state: 'valid'`, `proposedBounds` set to the item's current bounds, and `lastValidBounds` set to the item's current bounds
- **THEN** the state is stored on the controller instance, not in Yjs or Zustand

#### Scenario: PlacementState updates on every pointer-move
- **WHEN** the user moves the pointer during a drag
- **THEN** `proposedBounds` is updated to the quantized position at the pointer location
- **THEN** `state` is set to `'invalid'` if `GridService.canPlace` returns false, or `'valid'` if it returns true
- **THEN** `reason` is set to the specific rejection reason when `state` is `'invalid'`

#### Scenario: PlacementState is cleared on drag end
- **WHEN** the user releases the pointer to end the drag
- **THEN** the `PlacementState` for that item is cleared
- **THEN** no PlacementState remains on the controller

### Requirement: No revert during user drag
The system SHALL NOT revert an item to its last valid bounds during a user-initiated drag. The real item SHALL remain at its last valid position throughout the drag, regardless of whether the proposed position is valid or invalid. The ghost preview SHALL show the attempted position.

#### Scenario: Item stays in place during invalid drag
- **WHEN** the user drags an item to an invalid position
- **THEN** the real item does not move from its last valid position
- **THEN** the ghost renders at the attempted (invalid) position with the red marker
- **THEN** the user can continue dragging to find a valid position

#### Scenario: Item stays in place during resize to invalid size
- **WHEN** the user resizes an item to a size that would overlap a same-layer item
- **THEN** the real item does not change size from its last valid bounds
- **THEN** the ghost renders at the attempted (invalid) size with the red marker

### Requirement: Pointerup-invalid revert
On pointerup, if the final `PlacementState.state` is `'invalid'`, the system SHALL revert the real item to `lastValidBounds`, clear the ghost, and clear the `PlacementState`. No Yjs transaction SHALL be written for the rejected placement.

#### Scenario: Revert on pointerup with invalid final position
- **WHEN** the user releases the pointer while the ghost shows an invalid position
- **THEN** the ghost is removed
- **THEN** the real item remains at (or reverts to) `lastValidBounds`
- **THEN** no Yjs transaction is emitted for the rejected position
- **THEN** the `PlacementState` is cleared

#### Scenario: Commit on pointerup with valid final position
- **WHEN** the user releases the pointer while the ghost shows a valid position
- **THEN** the ghost is removed
- **THEN** the real item is moved to `proposedBounds`
- **THEN** a Yjs transaction is emitted with the new position
- **THEN** `lastValidBounds` is updated to the new position
- **THEN** the `PlacementState` is cleared

### Requirement: Valid-move marker clear
When the pointer moves from an invalid position to a valid position during a drag, the red marker SHALL clear immediately. The ghost SHALL transition from the red invalid style to the normal translucent ghost style without delay.

#### Scenario: Red marker clears on move to valid cell
- **WHEN** the user drags an item from an invalid position to a valid position
- **THEN** the red outline and red fill are removed from the ghost immediately
- **THEN** the ghost renders in its normal translucent style
- **THEN** the transition happens on the same pointer-move event, with no fade or delay

#### Scenario: Red marker reappears on move back to invalid cell
- **WHEN** the user drags an item from a valid position back to an invalid position
- **THEN** the red outline and red fill reappear on the ghost immediately
- **THEN** the transition happens on the same pointer-move event

### Requirement: Keyboard nudge consistency
Arrow-key nudge SHALL follow the same ghost preview and marker rules as pointer drag. An invalid nudge SHALL leave the real item in place and show the red marker on a ghost at the attempted position. A valid nudge SHALL move the item and clear any marker.

#### Scenario: Invalid nudge shows red marker, item stays in place
- **WHEN** the user presses an arrow key that would move a selected item to an overlapping position
- **THEN** the real item does not move
- **THEN** a ghost renders at the attempted position with the red marker
- **THEN** the red marker persists until a valid nudge or the selection changes

#### Scenario: Valid nudge moves item and clears marker
- **WHEN** the user presses an arrow key that moves a selected item to a valid position
- **THEN** the real item moves to the new position
- **THEN** any existing red marker is cleared
- **THEN** `lastValidBounds` is updated

#### Scenario: Nudge ghost is cleared on selection change
- **WHEN** a ghost with a red marker is visible from a previous invalid nudge
- **AND** the user changes the selection (clicks another item or deselects)
- **THEN** the ghost and marker are cleared

### Requirement: Reason field for future multi-color
The `PlacementState.reason` field SHALL accept values `'overlap'`, `'containment'`, or `'both'` to encode the specific rejection cause. In v1, the renderer SHALL use a single red color (`#ff0000`) for all rejection reasons. The field structure SHALL support future multi-color encoding (red=overlap, amber=containment, magenta=both) without schema changes.

#### Scenario: Reason is set on invalid placement
- **WHEN** a placement is rejected due to same-layer overlap
- **THEN** `PlacementState.reason` is set to `'overlap'`
- **THEN** the ghost renders with the single red color in v1

#### Scenario: Reason is undefined on valid placement
- **WHEN** a placement is valid
- **THEN** `PlacementState.reason` is `undefined`
- **THEN** the ghost renders in its normal translucent style

#### Scenario: Reason field is structured for future use
- **WHEN** the renderer reads `PlacementState.reason`
- **THEN** it can switch on the reason value to select a color
- **THEN** in v1, all non-undefined reasons map to `#ff0000`

### Requirement: Auto-revert on remote Yjs correction
The system SHALL auto-revert an item to its last valid bounds ONLY when a remote Yjs update would create a same-layer overlap on the receiving client. The receiving client SHALL reconcile the item to its last valid bounds and emit a corrected write back to Yjs.

#### Scenario: Remote update causes overlap, client corrects
- **WHEN** a remote Yjs update moves an item to a position that overlaps a same-layer item on the receiving client
- **THEN** the receiving client reverts the remote item to its last valid bounds
- **THEN** the receiving client emits a corrected Yjs write with the valid bounds
- **THEN** the correction uses last-write-wins semantics

#### Scenario: Remote update is valid, no correction needed
- **WHEN** a remote Yjs update moves an item to a valid position
- **THEN** the receiving client applies the update normally
- **THEN** no corrected write is emitted

#### Scenario: User-initiated drag is never auto-reverted
- **WHEN** the user is actively dragging an item
- **THEN** no auto-revert occurs, even if the proposed position is invalid
- **THEN** the ghost preview and red marker handle the feedback

### Requirement: Shift+release find-free-cell affordance
Holding the Shift key on pointerup during a drag SHALL snap the item to the nearest free cell as returned by `GridService.findFreeCells`. This affordance SHALL be off by default; the user must explicitly hold Shift to activate it.

#### Scenario: Shift+release snaps to nearest free cell
- **WHEN** the user holds Shift and releases the pointer during a drag
- **AND** the final position is invalid
- **THEN** the system calls `findFreeCells` with the proposed rect
- **THEN** the item is placed at the nearest free cell (first candidate)
- **THEN** if no free cell is found within the search radius, the item reverts to `lastValidBounds`

#### Scenario: Shift+release on valid position is a no-op
- **WHEN** the user holds Shift and releases the pointer during a drag
- **AND** the final position is valid
- **THEN** the item is placed at the proposed position normally
- **THEN** `findFreeCells` is not called

#### Scenario: Release without Shift does not auto-snap
- **WHEN** the user releases the pointer without holding Shift
- **AND** the final position is invalid
- **THEN** the item reverts to `lastValidBounds`
- **THEN** `findFreeCells` is not called

### Requirement: findFreeCells returns candidate placements
The system SHALL expose a `findFreeCells(rect, kind, excludeId?)` function that returns up to N candidate placements near the requested `rect` that satisfy the same-layer non-overlap invariant. The search radius is capped at 8 cells in each direction by default.

#### Scenario: findFreeCells finds valid placements
- **WHEN** the function is called with a target rect and kind
- **THEN** it returns placements where the rect would not overlap any same-layer item
- **THEN** candidates are sorted by distance from the original rect
- **THEN** the function returns an empty array when no valid placement exists within the search radius

#### Scenario: findFreeCells excludes the moving item
- **WHEN** the function is called with `excludeId` matching the moving item
- **THEN** the moving item's current bounds are ignored in the overlap check
- **THEN** the function returns placements relative to the moving item's current bounds

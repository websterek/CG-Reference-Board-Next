# placement-non-overlap (delta)

## Purpose

This delta replaces the 200ms red flash rejection feedback with a persistent ghost preview that renders at the attempted (invalid) position. The ghost shows a red outline + 30% red fill and persists until the pointer moves to a valid cell or is released. The item no longer reverts during user-initiated drag; it only reverts on pointerup-invalid or on remote Yjs overlap correction.

---

## MODIFIED Requirements

### Requirement: Ghost Preview During Drag

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

---

### Requirement: Persistent Invalid Marker

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

---

### Requirement: PlacementState Model

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

---

### Requirement: No Revert During User Drag

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

---

### Requirement: Pointerup-Invalid Revert

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

---

### Requirement: Valid-Move Marker Clear

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

---

### Requirement: Keyboard Nudge Consistency

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

---

### Requirement: Reason Field for Future Multi-Color

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

---

### Requirement: Auto-Revert on Remote Yjs Correction

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

---

### Requirement: Shift+Release Find-Free-Cell Affordance

Holding the Shift key on pointerup during a drag SHALL snap the item to the nearest free cell as returned by `GridService.findFreeCells` (`grid.ts:144-190`). This affordance SHALL be off by default; the user must explicitly hold Shift to activate it.

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

# placement-non-overlap

## Purpose

Same-layer non-overlap invariant for structured items on a board. Two items of the same `frame`, `media`, or `overlay` layer kind SHALL NOT occupy overlapping cells. Cross-layer overlap SHALL always be allowed. Placement is validated at every write boundary (create, move, resize, paste, remote apply); rejected moves revert the item to its last valid bounds. The `findFreeCells` helper returns candidate placements near a requested rect.

---

<!-- Promoted from openspec/changes/grid-native-items-and-typed-layers/specs/placement-non-overlap/spec.md -->

## Requirements

### Requirement: Same-layer non-overlap invariant
The system SHALL prevent two items of the same `frame`, `media`, or `overlay` layer kind from occupying overlapping cells. Two items overlap when their quantized bounding rects intersect (open-interval overlap on `x` and `y`). Cross-layer overlap SHALL always be allowed.

#### Scenario: Two media items cannot share cells
- **WHEN** user attempts to move a media item so its quantized rect intersects another media item's quantized rect
- **THEN** the move is rejected
- **THEN** the moved item returns to its last valid (committed) position
- **THEN** no Yjs transaction is written for the rejected move

#### Scenario: Two frames cannot overlap
- **WHEN** user attempts to resize or move a frame so its quantized rect intersects another frame's quantized rect
- **THEN** the change is rejected
- **THEN** the frame returns to its last valid bounds

#### Scenario: Two overlays cannot overlap
- **WHEN** user attempts to place an overlay item so its quantized rect intersects another overlay item's quantized rect
- **THEN** the placement is rejected

#### Scenario: Cross-layer overlap is allowed
- **WHEN** a `frame` item's quantized rect contains a `media` item's quantized rect
- **THEN** both items coexist
- **WHEN** an `overlay` item sits on top of a `media` item
- **THEN** both items coexist
- **WHEN** an `annotation` stroke crosses any other item
- **THEN** the stroke and the other item coexist

### Requirement: Placement validation at every write boundary
The system SHALL validate placement (no same-layer overlap) on every code path that creates, moves, resizes, pastes, or applies a remote update to an item. Validation failures SHALL reject the write and return the item to its last valid bounds.

#### Scenario: Creation validates placement
- **WHEN** user creates a new media item at a position that overlaps an existing media item
- **THEN** the new item is not created
- **THEN** the user sees a brief visual indication of the rejection

#### Scenario: Move validates placement
- **WHEN** user drags an item to a position that would overlap a same-layer item
- **THEN** the move is rejected at that pointer position
- **THEN** the item snaps back to its last valid bounds

#### Scenario: Resize validates placement
- **WHEN** user resizes an item so its new quantized rect would overlap a same-layer item
- **THEN** the resize is rejected at that pointer position
- **THEN** the item retains its last valid size

#### Scenario: Remote apply validates placement
- **WHEN** a remote Yjs update would cause a same-layer overlap on the receiving client
- **THEN** the receiving client applies the rejection locally
- **THEN** the receiving client pushes a corrected write back to Yjs with valid bounds

### Requirement: Visual feedback on rejection
When a placement is rejected, the system SHALL briefly render a visual indicator (e.g., red outline flash for 200ms) on the rejected item so the user understands the move was blocked.

#### Scenario: Rejected move shows feedback
- **WHEN** a move is rejected due to same-layer overlap
- **THEN** the rejected item displays a red outline for 200ms
- **THEN** the outline fades after the feedback duration
- **THEN** the item is back at its last valid position

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

/**
 * PlacementState — controller-local ephemeral state describing the
 * validity of an in-progress drag, resize, or nudge.
 *
 * Per `invalid-placement-ux` proposal (D1):
 *   - Lives on the controller instance as a `Map<ItemId, PlacementState>`.
 *   - NOT stored in Yjs, Zustand, or any persistent store.
 *   - Created on drag/nudge start, updated on every pointermove or
 *     keyboard nudge, cleared on drag end.
 *
 * The shape is intentionally minimal: just enough information for the
 * ghost renderer to draw the right style at the proposed location and
 * for `endDrag` to know whether to commit or revert.
 */

import type { ItemId, Rect } from '@gridboard/domain';

/**
 * Specific reason a placement was rejected. In v1 this is always
 * `'overlap'` (same-layer non-overlap invariant), but the field is
 * structured for future multi-color encoding (D3).
 *
 * - 'overlap' — proposed rect intersects a same-layer item
 * - 'containment' — proposed rect is fully contained inside another same-layer item
 * - 'both' — intersects AND is contained
 */
export type PlacementReason = 'overlap' | 'containment' | 'both';

export interface PlacementState {
  /** Current validity of the proposed placement. */
  state: 'valid' | 'invalid';
  /** Specific rejection cause when `state === 'invalid'`; undefined when valid. */
  reason?: PlacementReason;
  /**
   * Where the user is attempting to place the item (board coordinates).
   * For drag, this tracks the quantized pointer location; for resize,
   * the quantized handle drag; for nudge, the target cell.
   */
  proposedBounds: Rect;
  /**
   * Where the item will live once the drag ends cleanly (either by
   * valid pointerup, by Shift+release snap, or by revert). This is the
   * "real" position of the real item during the drag — the ghost and
   * the real item diverge, with this field as the anchor.
   */
  lastValidBounds: Rect;
}

// ---------------------------------------------------------------------------
// Pure factory helpers — exported for unit testing without PixiJS
// ---------------------------------------------------------------------------

/**
 * Create the initial PlacementState for a drag start, where the proposed
 * position equals the item's current position.
 */
export function createInitialPlacementState(currentBounds: Rect): PlacementState {
  return {
    state: 'valid',
    proposedBounds: { ...currentBounds },
    lastValidBounds: { ...currentBounds },
  };
}

/**
 * Update an existing PlacementState with a new proposed bounds and the
 * validity outcome of `GridService.canPlace`. Returns a fresh object so
 * callers can rely on reference equality to skip re-renders.
 */
export function updatePlacementState(
  prev: PlacementState,
  proposedBounds: Rect,
  canPlace: boolean,
): PlacementState {
  if (canPlace) {
    // Drop `reason` when transitioning to valid so `hasInvalidReason`
    // (and downstream renderer colors) immediately reflect "valid".
    return {
      state: 'valid',
      proposedBounds: { ...proposedBounds },
      lastValidBounds: prev.lastValidBounds,
    };
  }
  return {
    state: 'invalid',
    reason: 'overlap',
    proposedBounds: { ...proposedBounds },
    lastValidBounds: prev.lastValidBounds,
  };
}

/**
 * Convenience helper used by tests and the keyboard-nudge handler to
 * build an invalid PlacementState directly (without a canPlace call).
 */
export function makeInvalidPlacement(
  currentBounds: Rect,
  attemptedBounds: Rect,
  reason: PlacementReason = 'overlap',
): PlacementState {
  return {
    state: 'invalid',
    reason,
    proposedBounds: { ...attemptedBounds },
    lastValidBounds: { ...currentBounds },
  };
}

/**
 * Type guard: true if a PlacementState has an `invalid` state with a
 * concrete reason. Used by the ghost renderer to decide whether to
 * apply the red marker (D3 — all non-undefined reasons map to red in
 * v1, but the structure supports future multi-color).
 */
export function hasInvalidReason(
  ps: PlacementState | undefined,
): ps is PlacementState & { state: 'invalid'; reason: PlacementReason } {
  return ps !== undefined && ps.state === 'invalid' && ps.reason !== undefined;
}

// Re-export common types for ergonomic imports inside controller.ts.
export type { ItemId, Rect };

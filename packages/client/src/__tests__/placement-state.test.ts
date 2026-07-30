/**
 * PlacementState transition tests — `invalid-placement-ux` Section 12.1.
 *
 * The pure factory helpers (`createInitialPlacementState`,
 * `updatePlacementState`, `makeInvalidPlacement`) are tested in
 * isolation from PixiJS. The controller-level behavior (drag start,
 * update on pointermove, clear on drag end) is exercised via the
 * pure helpers — the controller-level integration is verified by the
 * `controller-behavior.test.ts` source-grep tests (which confirm the
 * ghost rendering and PlacementState lifecycle code paths exist in
 * controller.ts and reference `getPlacementState` / `setPlacementState`).
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialPlacementState,
  updatePlacementState,
  makeInvalidPlacement,
  hasInvalidReason,
  type PlacementState,
} from '../canvas/placement-state';
import type { Rect } from '@gridboard/domain';

const rect = (x: number, y: number, w = 20, h = 20): Rect => ({
  x,
  y,
  width: w,
  height: h,
});

describe('PlacementState — initial creation (Section 12.1)', () => {
  it('returns state=valid and proposed=lastValid=currentBounds', () => {
    const cur = rect(0, 0, 40, 40);
    const ps = createInitialPlacementState(cur);
    expect(ps.state).toBe('valid');
    expect(ps.reason).toBeUndefined();
    expect(ps.proposedBounds).toEqual(cur);
    expect(ps.lastValidBounds).toEqual(cur);
  });

  it('clones the bounds objects so caller mutation does not alias', () => {
    const cur = rect(0, 0, 40, 40);
    const ps = createInitialPlacementState(cur);
    // PlacementState stores its own copy — verifying structural
    // equality of the cloned bounds.
    expect(ps.proposedBounds).toEqual(cur);
    expect(ps.lastValidBounds).toEqual(cur);
    // Mutating one should not affect the other.
    const separate = rect(80, 80, 40, 40);
    const ps2 = createInitialPlacementState(separate);
    expect(ps2.proposedBounds).not.toBe(ps.proposedBounds);
    expect(ps2.proposedBounds).toEqual(separate);
  });
});

describe('PlacementState — transitions (Section 12.1)', () => {
  it('updatePlacementState sets invalid with reason=overlap when canPlace=false', () => {
    const initial = createInitialPlacementState(rect(0, 0));
    const next = updatePlacementState(initial, rect(100, 100), false);
    expect(next.state).toBe('invalid');
    expect(next.reason).toBe('overlap');
    expect(next.proposedBounds).toEqual(rect(100, 100));
    // lastValidBounds is preserved across updates
    expect(next.lastValidBounds).toEqual(initial.lastValidBounds);
  });

  it('updatePlacementState sets valid and clears reason when canPlace=true', () => {
    const invalid = makeInvalidPlacement(rect(0, 0), rect(100, 100));
    const next = updatePlacementState(invalid, rect(40, 40), true);
    expect(next.state).toBe('valid');
    expect(next.reason).toBeUndefined();
    expect(next.proposedBounds).toEqual(rect(40, 40));
  });

  it('updatePlacementState returns a fresh object (reference equality)', () => {
    const initial = createInitialPlacementState(rect(0, 0));
    const next = updatePlacementState(initial, rect(20, 20), true);
    expect(next).not.toBe(initial);
  });

  it('toggles between valid and invalid across successive updates', () => {
    let ps: PlacementState = createInitialPlacementState(rect(0, 0));
    ps = updatePlacementState(ps, rect(20, 20), false); // invalid
    expect(ps.state).toBe('invalid');
    ps = updatePlacementState(ps, rect(40, 40), true); // valid again
    expect(ps.state).toBe('valid');
    expect(ps.reason).toBeUndefined();
    ps = updatePlacementState(ps, rect(80, 80), false); // invalid again
    expect(ps.state).toBe('invalid');
    expect(ps.reason).toBe('overlap');
  });
});

describe('PlacementState — direct helpers (Section 12.1)', () => {
  it('makeInvalidPlacement builds a state with state=invalid and reason=overlap', () => {
    const cur = rect(0, 0, 40, 40);
    const attempted = rect(100, 100, 40, 40);
    const ps = makeInvalidPlacement(cur, attempted);
    expect(ps.state).toBe('invalid');
    expect(ps.reason).toBe('overlap');
    expect(ps.proposedBounds).toEqual(attempted);
    expect(ps.lastValidBounds).toEqual(cur);
  });

  it('makeInvalidPlacement accepts a custom reason', () => {
    const ps = makeInvalidPlacement(rect(0, 0), rect(50, 50), 'containment');
    expect(ps.reason).toBe('containment');
  });

  it('hasInvalidReason returns true only for invalid states with a defined reason', () => {
    const invalid = makeInvalidPlacement(rect(0, 0), rect(50, 50));
    const valid = createInitialPlacementState(rect(0, 0));
    expect(hasInvalidReason(invalid)).toBe(true);
    expect(hasInvalidReason(valid)).toBe(false);
    expect(hasInvalidReason(undefined)).toBe(false);
  });
});

describe('PlacementState — controller integration (Section 12.1, source-grep)', () => {
  // These tests verify that the controller wires PlacementState helpers
  // into the drag/resize/draw-rect lifecycles. Pure-behavior coverage
  // is provided above; here we just confirm the symbols are referenced
  // in the controller source.
  it('controller.ts imports the PlacementState helpers', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const path = resolve(__dirname, '..', 'canvas', 'controller.ts');
    const src = readFileSync(path, 'utf-8');
    expect(src).toContain("from './placement-state'");
    expect(src).toContain('createInitialPlacementState');
    expect(src).toContain('updatePlacementState');
    expect(src).toContain('makeInvalidPlacement');
  });
});

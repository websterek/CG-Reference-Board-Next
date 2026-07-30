/**
 * invalid-placement-ux integration tests (Section 12).
 *
 * Tests the controller-level wiring of PlacementState, ghost rendering,
 * remote auto-revert, keyboard nudge, and Shift+release affordance. The
 * controller class requires a full PixiJS Application to instantiate,
 * so these tests verify the invariants at the level we can reach:
 * source-grep checks for code paths in controller.ts, mirroring the
 * convention used in `controller-behavior.test.ts`.
 *
 * Pure PlacementState logic is tested in `placement-state.test.ts`.
 * Domain-level `canPlace` / `findFreeCells` is tested in
 * `packages/domain/src/__tests__/grid.test.ts`.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const controllerPath = resolve(__dirname, '..', 'canvas', 'controller.ts');
const placementPath = resolve(__dirname, '..', 'canvas', 'placement-state.ts');
const controllerSrc = readFileSync(controllerPath, 'utf-8');
const placementSrc = readFileSync(placementPath, 'utf-8');

// ---------------------------------------------------------------------------
// Section 12.2 — Ghost rendering integration
// ---------------------------------------------------------------------------

describe('12.2: ghost rendering integration', () => {
  it('controller.ts creates a ghostLayer in the world above items', () => {
    expect(controllerSrc).toContain('private ghostLayer: Container | null = null');
    // Wired into the scene graph after selectionLayer
    expect(controllerSrc).toMatch(
      /this\.ghostLayer\s*=\s*new Container\(\)[\s\S]{0,200}world\.addChild\(this\.ghostLayer\)/,
    );
  });

  it('controller.ts implements renderGhost that reads PlacementState', () => {
    expect(controllerSrc).toContain('renderGhost(id: ItemId): void');
    // Reads PlacementState from the controller
    expect(controllerSrc).toMatch(/renderGhost[\s\S]{0,400}this\.placementStates\.get\(id\)/);
  });

  it('renderGhost uses red style for invalid PlacementState', () => {
    // The red constants and fill+stroke sequence are visible in the
    // invalid branch.
    expect(controllerSrc).toMatch(/0xff0000/);
    expect(controllerSrc).toMatch(/redFillAlpha = 0\.3|alpha: 0\.3/);
  });

  it('controller.ts implements clearGhost that destroys the Graphics', () => {
    expect(controllerSrc).toContain('clearGhost(id: ItemId): void');
    expect(controllerSrc).toMatch(/clearGhost[\s\S]{0,200}g\.destroy\(\)/);
  });

  it('PointerState tracking lives on the controller, not in Yjs or Zustand', () => {
    // placement-state.ts is a pure module that exports the interface
    // only — there is no Yjs / Zustand / store import.
    expect(placementSrc).not.toMatch(/from ['"]yjs['"]/);
    expect(placementSrc).not.toMatch(/from ['"]zustand['"]/);
  });
});

// ---------------------------------------------------------------------------
// Section 12.3 — Remote Yjs auto-revert wiring
// ---------------------------------------------------------------------------

describe('12.3: remote Yjs auto-revert wiring', () => {
  it('applyRemoteUpdate runs canPlace after applying the update', () => {
    // The function body must contain both `updateItem(...)` (the apply)
    // and `GridService.canPlace(...)` (the validation).
    const fnStart = controllerSrc.indexOf('applyRemoteUpdate(id: string');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = controllerSrc.indexOf('\n  }\n', fnStart);
    const body = controllerSrc.slice(fnStart, fnEnd);
    expect(body).toContain('this.updateItem(id, partial);');
    expect(body).toContain('GridService.canPlace');
  });

  it('applyRemoteUpdate checks dragState / resizeState to suppress revert during user drag', () => {
    const fnStart = controllerSrc.indexOf('applyRemoteUpdate(id: string');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = controllerSrc.indexOf('\n  }\n', fnStart);
    const body = controllerSrc.slice(fnStart, fnEnd);
    expect(body).toContain('this.dragState');
    expect(body).toContain('this.resizeState');
  });

  it('applyRemoteUpdate emits a corrected write via opts.onItemChange on invalid remote overlap', () => {
    const fnStart = controllerSrc.indexOf('applyRemoteUpdate(id: string');
    const fnEnd = controllerSrc.indexOf('\n  }\n', fnStart);
    const body = controllerSrc.slice(fnStart, fnEnd);
    // Either the invalid branch sets lastValidBounds OR it emits a correction.
    expect(body).toContain('this.opts.onItemChange');
  });
});

// ---------------------------------------------------------------------------
// Section 12.4 — Keyboard nudge: ghost + red marker
// ---------------------------------------------------------------------------

describe('12.4: keyboard nudge ghost consistency', () => {
  it('nudge handler uses makeInvalidPlacement and renderGhost for invalid nudges', () => {
    // The arrow-key branch (dx !== 0 || dy !== 0) must NOT contain
    // flashRejection anymore and must call renderGhost for invalid nudges.
    const arrowStart = controllerSrc.indexOf(
      'if (dx !== 0 || dy !== 0)',
    );
    expect(arrowStart).toBeGreaterThan(0);
    // The branch ends at `e.preventDefault();\n        return;`.
    const arrowEnd = controllerSrc.indexOf('e.preventDefault()', arrowStart);
    expect(arrowEnd).toBeGreaterThan(arrowStart);
    const body = controllerSrc.slice(arrowStart, arrowEnd);
    expect(body).not.toContain('flashRejection');
    expect(body).toContain('renderGhost');
    expect(body).toContain('makeInvalidPlacement');
  });

  it('valid nudge branch clears PlacementState before moving', () => {
    const arrowStart = controllerSrc.indexOf(
      'if (dx !== 0 || dy !== 0)',
    );
    const arrowEnd = controllerSrc.indexOf('e.preventDefault()', arrowStart);
    const body = controllerSrc.slice(arrowStart, arrowEnd);
    expect(body).toContain('this.clearPlacementState');
  });

  it('clearing selection in pointerdown clears all placement ghosts', () => {
    // Search for the empty-canvas selection clearing block.
    const markerIdx = controllerSrc.indexOf('// Section 7.3: clear nudge ghosts');
    expect(markerIdx).toBeGreaterThan(0);
    const body = controllerSrc.slice(markerIdx, markerIdx + 600);
    expect(body).toContain('this.clearAllPlacementStates');
  });
});

// ---------------------------------------------------------------------------
// Section 12.5 — Shift+release affordance
// ---------------------------------------------------------------------------

describe('12.5: Shift+release find-free-cell affordance', () => {
  it('controller exposes a tryShiftReleaseSnap helper', () => {
    expect(controllerSrc).toMatch(
      /private\s+tryShiftReleaseSnap\(\s*id:\s*ItemId[\s\S]*?\):\s*boolean/,
    );
  });

  it('tryShiftReleaseSnap calls GridService.findFreeCells', () => {
    const fnStart = controllerSrc.indexOf('tryShiftReleaseSnap(');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = controllerSrc.indexOf('\n  }\n', fnStart);
    const body = controllerSrc.slice(fnStart, fnEnd);
    expect(body).toContain('GridService.findFreeCells');
  });

  it('endDrag accepts the pointerup event and reads e.shiftKey', () => {
    // The function signature must include the optional PointerEvent
    // and the body must reference shiftKey.
    const endDragSig = controllerSrc.indexOf('const endDrag =');
    expect(endDragSig).toBeGreaterThan(0);
    const endDragEnd = controllerSrc.indexOf('\n    };\n', endDragSig);
    const body = controllerSrc.slice(endDragSig, endDragEnd);
    expect(body).toMatch(/e\?\s*\??:\s*PointerEvent/);
    expect(body).toContain('shiftHeld');
    expect(body).toContain('e?.shiftKey');
  });

  it('shiftKey is NOT checked during pointer-move', () => {
    // The pointermove handler must not reference shiftKey (Section 9.2).
    const pmStart = controllerSrc.indexOf("canvas.addEventListener('pointermove'");
    expect(pmStart).toBeGreaterThan(0);
    const pmEnd = controllerSrc.indexOf("const endDrag", pmStart);
    const body = controllerSrc.slice(pmStart, pmEnd);
    // Note: PointerEventLite carries shiftKey through ctx, but the
    // SHIFT affordance gating (tryShiftReleaseSnap) must only be
    // called from the pointerup handler.
    expect(body).not.toContain('tryShiftReleaseSnap');
  });
});

// ---------------------------------------------------------------------------
// Section 10 follow-up — flashRejection code is fully removed
// ---------------------------------------------------------------------------

describe('flashRejection code removal', () => {
  it('controller.ts no longer declares the flashRejection methods', () => {
    expect(controllerSrc).not.toMatch(/private flashRejection\(/);
    expect(controllerSrc).not.toMatch(/private flashRejectionRect\(/);
  });

  it('renderGhost and tryShiftReleaseSnap contain no setTimeout (persistent ghost)', () => {
    // Persistent ghost: no transient flash. Both `renderGhost` and
    // `tryShiftReleaseSnap` should be free of `setTimeout` calls —
    // verify by counting setTimeout occurrences in the file and
    // confirming none occur in the ghost-related method bodies.
    //
    // We use a simple presence check: the controller must NOT call
    // setTimeout at all (the only legitimate setTimeout in the entire
    // flash path was the now-removed `flashRejection` 200ms timer).
    const setTimeoutCount = (controllerSrc.match(/setTimeout\(/g) || []).length;
    expect(setTimeoutCount).toBe(0);
  });
});

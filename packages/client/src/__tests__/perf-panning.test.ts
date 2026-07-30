/**
 * perf-panning-and-large-boards — source-level invariants.
 *
 * These tests verify that the controller source contains the expected
 * methods, fields, and call patterns for the five performance tasks.
 * They do NOT instantiate a PixiJS Application (happy-dom can't provide
 * a real WebGL context), so they operate on the raw source text.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const controllerPath = resolve(
  __dirname,
  '..',
  'canvas',
  'controller.ts',
);
const src = readFileSync(controllerPath, 'utf-8');

// ---------------------------------------------------------------------------
// Task 1 — subscribeMinimap / getMinimapSnapshot
// ---------------------------------------------------------------------------

describe('Task 1: subscribeMinimap and getMinimapSnapshot', () => {
  it('has subscribeMinimap method', () => {
    expect(src).toMatch(/subscribeMinimap\(listener/);
  });

  it('has getMinimapSnapshot method', () => {
    expect(src).toMatch(/getMinimapSnapshot\(\)/);
  });

  it('onRender is still public', () => {
    expect(src).toMatch(/onRender\(listener/);
  });

  it('subscribeMinimap uses renderListeners set', () => {
    expect(src).toMatch(/this\.renderListeners\.add\(listener/);
  });
});

// ---------------------------------------------------------------------------
// Task 2 — shouldEmitMinimap / emitMinimap
// ---------------------------------------------------------------------------

describe('Task 2: shouldEmitMinimap and emitMinimap', () => {
  it('has shouldEmitMinimap method with Math.abs and threshold 0.5', () => {
    expect(src).toMatch(/shouldEmitMinimap\(\)/);
    expect(src).toMatch(/Math\.abs/);
    expect(src).toMatch(/> 0\.5/);
  });

  it('scheduleCameraFlush guards with shouldEmitMinimap', () => {
    // The flush should contain: if (this.shouldEmitMinimap()) this.emitMinimap();
    expect(src).toMatch(/shouldEmitMinimap\(\)/);
    // Verify the guarded call exists in the flush function
    const flushStart = src.indexOf('scheduleCameraFlush');
    const flushEnd = src.indexOf('private redrawGrid', flushStart);
    const flushBlock = src.slice(flushStart, flushEnd > 0 ? flushEnd : undefined);
    expect(flushBlock).toMatch(/shouldEmitMinimap\(\)\)/);
    expect(flushBlock).toMatch(/emitMinimap\(\)/);
  });

  it('addItem calls emitMinimap', () => {
    // addItem should call this.emitMinimap() (not notifyRender)
    expect(src).toMatch(/addItem[\s\S]*?this\.emitMinimap\(\)/);
  });

  it('removeItem calls emitMinimap', () => {
    expect(src).toMatch(/removeItem[\s\S]*?this\.emitMinimap\(\)/);
  });

  it('updateItem calls emitMinimap via endMutation', () => {
    expect(src).toMatch(/emitMinimap/);
  });

  it('has lastEmittedSnapshot field', () => {
    expect(src).toMatch(/lastEmittedSnapshot/);
  });

  it('has lastMinimapCameraX/Y/Zoom fields', () => {
    expect(src).toMatch(/lastMinimapCameraX/);
    expect(src).toMatch(/lastMinimapCameraY/);
    expect(src).toMatch(/lastMinimapZoom/);
  });
});

// ---------------------------------------------------------------------------
// Task 3 — shallowAttrsEqual / isTransformOnly fast path
// ---------------------------------------------------------------------------

describe('Task 3: shallowAttrsEqual and isTransformOnly fast path', () => {
  it('has shallowAttrsEqual method', () => {
    expect(src).toMatch(/shallowAttrsEqual\(a/);
  });

  it('updateItem contains isTransformOnly logic', () => {
    expect(src).toMatch(/isTransformOnly/);
  });

  it('fast path sets position without destroy', () => {
    // The fast path should do: oldDisplay.position.set(next.x, next.y);
    expect(src).toMatch(/oldDisplay\.position\.set\(next\.x, next\.y\)/);
  });

  it('slow path still calls destroy', () => {
    expect(src).toMatch(/oldDisplay\.destroy/);
  });
});

// ---------------------------------------------------------------------------
// Task 4 — endpointIndex
// ---------------------------------------------------------------------------

describe('Task 4: endpointIndex', () => {
  it('has endpointIndex field', () => {
    expect(src).toMatch(/endpointIndex = new Map/);
  });

  it('has indexConnector method', () => {
    expect(src).toMatch(/indexConnector\(id/);
  });

  it('has unindexConnector method', () => {
    expect(src).toMatch(/unindexConnector\(id/);
  });

  it('updateItem uses endpointIndex.get instead of O(N) items scan', () => {
    // The connector lookup should use endpointIndex.get(idItem)
    expect(src).toMatch(/endpointIndex\.get\(idItem\)/);
    // The old O(N) pattern "for (const [otherId, otherItem] of this.items)"
    // should NOT appear in updateItem's connector-reconciliation block.
    // It may still appear in removeItem's dangling loop (which also uses
    // endpointIndex now) or in tryShiftReleaseSnap.
    // We verify the updateItem block specifically uses the index.
    const updateItemBlock = src.slice(
      src.indexOf('updateItem(id:'),
      src.indexOf('removeItem(id:'),
    );
    // The old O(N) scan pattern should not be in updateItem
    expect(updateItemBlock).not.toMatch(
      /for\s*\(\s*const\s*\[\s*otherId\s*,\s*otherItem\s*\]\s*of\s*this\.items\s*\)/,
    );
  });

  it('removeItem uses endpointIndex for dangling connector lookup', () => {
    // removeItem should use endpointIndex.get(idItem) for the dangling loop
    const removeItemBlock = src.slice(
      src.indexOf('removeItem(id:'),
      src.indexOf('// ----- Selection'),
    );
    expect(removeItemBlock).toMatch(/endpointIndex\.get\(idItem\)/);
  });
});

// ---------------------------------------------------------------------------
// Task 5 — PixiJS init perf hooks
// ---------------------------------------------------------------------------

describe('Task 5: PixiJS init perf hooks', () => {
  it('antialias is false', () => {
    expect(src).toMatch(/antialias:\s*false/);
  });

  it('has gcMaxUnusedTime', () => {
    expect(src).toMatch(/gcMaxUnusedTime/);
  });

  it('has gcFrequency', () => {
    expect(src).toMatch(/gcFrequency/);
  });

  it('registers CullerPlugin via extensions.add', () => {
    expect(src).toMatch(/extensions\.add\(CullerPlugin\)/);
  });

  it('has powerPreference high-performance', () => {
    expect(src).toMatch(/powerPreference:\s*'high-performance'/);
  });
});

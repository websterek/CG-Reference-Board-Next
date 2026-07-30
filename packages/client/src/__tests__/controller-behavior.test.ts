/**
 * Controller behavior tests — spacebar pan independence + snap per mode (Tasks 14.9, 14.10).
 *
 * The CanvasController requires a full PixiJS Application to instantiate,
 * so these tests verify the invariants at the level we can reach:
 *
 * 14.9: The spacebar pan path in controller.ts does NOT reference
 *       `activeToolName` or `toolRegistry`. It checks `this.spacebar`
 *       before dispatching to the tool registry, so spacebar pan works
 *       regardless of which tool is active.
 *
 * 14.10: Mode snap policies from the ModeDefinition registry are correct,
 *        and GridService.snapPoint behaves accordingly.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getModeDef,
  getAllModes,
  GridService,
  DEFAULT_GRID_CONFIG,
} from '@gridboard/domain';

// ---------------------------------------------------------------------------
// 14.9 — Spacebar pan does not depend on activeTool
// ---------------------------------------------------------------------------

describe('14.9: spacebar pan independence from active tool', () => {
  /**
   * Read the controller source and extract the spacebar-related code
   * paths. We verify that:
   *   1. The keydown handler sets `this.spacebar = true` without checking
   *      `activeToolName` or `toolRegistry`.
   *   2. The pointerdown handler checks `this.spacebar` BEFORE dispatching
   *      to the tool registry.
   */
  const controllerPath = resolve(
    __dirname,
    '..',
    'canvas',
    'controller.ts',
  );
  const source = readFileSync(controllerPath, 'utf-8');

  it('spacebar keydown handler does not reference activeToolName or toolRegistry', () => {
    // Find the keydown handler block (around lines 893-946)
    const keydownStart = source.indexOf("window.addEventListener('keydown'");
    expect(keydownStart).toBeGreaterThan(0);

    // Extract the keydown handler body (from the arrow function to the
    // closing of the event listener)
    const keydownEnd = source.indexOf("window.addEventListener('keyup'", keydownStart);
    expect(keydownEnd).toBeGreaterThan(keydownStart);

    const keydownBlock = source.slice(keydownStart, keydownEnd);

    // The spacebar check should exist
    expect(keydownBlock).toContain("e.code === 'Space'");
    expect(keydownBlock).toContain('this.spacebar = true');

    // It should NOT reference activeToolName or toolRegistry
    expect(keydownBlock).not.toContain('activeToolName');
    expect(keydownBlock).not.toContain('toolRegistry');
  });

  it('spacebar pointerdown handler checks spacebar before tool dispatch', () => {
    // Find the pointerdown handler
    const pointerdownStart = source.indexOf("canvas.addEventListener('pointerdown'");
    expect(pointerdownStart).toBeGreaterThan(0);

    const pointermoveStart = source.indexOf("canvas.addEventListener('pointermove'", pointerdownStart);
    expect(pointermoveStart).toBeGreaterThan(pointerdownStart);

    const pointerdownBlock = source.slice(pointerdownStart, pointermoveStart);

    // The spacebar check should appear BEFORE the tool registry dispatch
    const spacebarCheckIdx = pointerdownBlock.indexOf('if (this.spacebar)');
    const toolDispatchIdx = pointerdownBlock.indexOf('this.toolRegistry.get');

    expect(spacebarCheckIdx).toBeGreaterThan(0);
    expect(toolDispatchIdx).toBeGreaterThan(0);
    // Spacebar check must come first — if it didn't, spacebar pan would
    // be intercepted by the active tool's onPointerDown.
    expect(spacebarCheckIdx).toBeLessThan(toolDispatchIdx);
  });

  it('spacebar pan dragState does not reference activeToolName', () => {
    // Find the pointermove handler's pan block
    const pointermoveStart = source.indexOf("canvas.addEventListener('pointermove'");
    expect(pointermoveStart).toBeGreaterThan(0);

    const endDragStart = source.indexOf('const endDrag', pointermoveStart);
    expect(endDragStart).toBeGreaterThan(pointermoveStart);

    const pointermoveBlock = source.slice(pointermoveStart, endDragStart);

    // The pan drag state handler should exist
    expect(pointermoveBlock).toContain("this.dragState.kind === 'pan'");

    // Extract only the pan case block: from "kind === 'pan'" to the next
    // "if (this.dragState.kind ===" or the closing of the pointermove handler
    const panCaseStart = pointermoveBlock.indexOf("this.dragState.kind === 'pan'");
    expect(panCaseStart).toBeGreaterThan(0);

    // Find the next dragState.kind check after the pan case
    const afterPan = pointermoveBlock.indexOf("this.dragState.kind ===", panCaseStart + 30);
    const panBlock = afterPan > 0
      ? pointermoveBlock.slice(panCaseStart, afterPan)
      : pointermoveBlock.slice(panCaseStart);

    // The pan block must NOT dispatch through the tool registry
    expect(panBlock).not.toContain('this.toolRegistry.get');
  });
});

// ---------------------------------------------------------------------------
// 14.10 — Snap enforced per mode
// ---------------------------------------------------------------------------

describe('14.10: snap enforced per mode', () => {
  const grid = { ...DEFAULT_GRID_CONFIG, cellSize: 20, snapEnabled: true };
  const noSnapGrid = { ...DEFAULT_GRID_CONFIG, cellSize: 20, snapEnabled: false };

  it('grid mode has snapPolicy mandatory', () => {
    const def = getModeDef('grid');
    expect(def.snapPolicy).toBe('mandatory');
  });

  it('annotation mode has snapPolicy off', () => {
    const def = getModeDef('annotation');
    expect(def.snapPolicy).toBe('off');
  });

  it('connector mode has snapPolicy mandatory', () => {
    const def = getModeDef('connector');
    expect(def.snapPolicy).toBe('mandatory');
  });

  it('all three modes are registered', () => {
    const modes = getAllModes();
    expect(modes.length).toBe(3);
    const ids = modes.map((m) => m.id);
    expect(ids).toContain('grid');
    expect(ids).toContain('annotation');
    expect(ids).toContain('connector');
  });

  it('in grid mode (snapEnabled=true), point snaps to grid cell', () => {
    // Grid mode → snapPolicy: 'mandatory' → snapEnabled: true
    const snapped = GridService.snapPoint({ x: 33, y: 47 }, grid);
    expect(snapped.x).toBe(40);
    expect(snapped.y).toBe(40);
  });

  it('in annotation mode (snapEnabled=false), point is unchanged', () => {
    // Annotation mode → snapPolicy: 'off' → snapEnabled: false
    const raw = GridService.snapPoint({ x: 33, y: 47 }, noSnapGrid);
    expect(raw.x).toBe(33);
    expect(raw.y).toBe(47);
  });

  it('in connector mode (snapEnabled=true), point snaps to grid cell', () => {
    // Connector mode → snapPolicy: 'mandatory' → snapEnabled: true
    const snapped = GridService.snapPoint({ x: 33, y: 47 }, grid);
    expect(snapped.x).toBe(40);
    expect(snapped.y).toBe(40);
  });

  it('snapEnabled=false returns exact input (annotation mode behavior)', () => {
    const result = GridService.snapPoint({ x: 13.7, y: 22.3 }, noSnapGrid);
    expect(result.x).toBe(13.7);
    expect(result.y).toBe(22.3);
  });

  it('snapEnabled=true quantizes to nearest cell (grid/connector mode behavior)', () => {
    const result = GridService.snapPoint({ x: 13.7, y: 22.3 }, grid);
    expect(result.x).toBe(20);
    expect(result.y).toBe(20);
  });
});

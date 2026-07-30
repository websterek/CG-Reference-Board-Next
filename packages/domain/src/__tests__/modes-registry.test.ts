import { describe, it, expect } from 'vitest';
import {
  getModeDef,
  getAllModes,
  isUniversalTool,
  resolveActiveToolOnModeSwitch,
} from '../modes/registry';

describe('modes registry', () => {
  // 12.1 — Mode registry has exactly 3 entries with correct values
  it('has exactly 3 default entries with correct values per the council table', () => {
    const modes = getAllModes();
    expect(modes).toHaveLength(3);

    const grid = modes.find((m) => m.id === 'grid')!;
    expect(grid).toBeDefined();
    expect(grid.displayName).toBe('Grid');
    expect(grid.toolIds).toEqual(['rectangle', 'frame', 'image', 'text']);
    expect(grid.defaultTool).toBe('select');
    expect(grid.snapPolicy).toBe('mandatory');

    const annotation = modes.find((m) => m.id === 'annotation')!;
    expect(annotation).toBeDefined();
    expect(annotation.displayName).toBe('Annotation');
    expect(annotation.toolIds).toEqual(['freehand', 'arrow', 'rectangle', 'text', 'eraser']);
    expect(annotation.defaultTool).toBe('freehand');
    expect(annotation.snapPolicy).toBe('off');

    const connector = modes.find((m) => m.id === 'connector')!;
    expect(connector).toBeDefined();
    expect(connector.displayName).toBe('Connector');
    expect(connector.toolIds).toEqual(['connector']);
    expect(connector.defaultTool).toBe('connector');
    expect(connector.snapPolicy).toBe('mandatory');
  });

  // 12.2 — getModeDef('grid') returns the grid definition
  it('getModeDef("grid") returns the grid mode definition', () => {
    const grid = getModeDef('grid');
    expect(grid.id).toBe('grid');
    expect(grid.displayName).toBe('Grid');
    expect(grid.defaultTool).toBe('select');
    expect(grid.snapPolicy).toBe('mandatory');
  });

  // 12.3 — getModeDef('unknown') throws
  it('getModeDef("unknown") throws', () => {
    expect(() => getModeDef('unknown')).toThrow('Unknown interaction mode: unknown');
  });

  // 12.4 — getAllModes() returns 3 entries in registration order
  it('getAllModes() returns 3 entries in registration order', () => {
    const modes = getAllModes();
    expect(modes).toHaveLength(3);
    expect(modes.map((m) => m.id)).toEqual(['grid', 'annotation', 'connector']);
  });

  // 12.5 — isUniversalTool('select') → true
  it('isUniversalTool("select") returns true', () => {
    expect(isUniversalTool('select')).toBe(true);
  });

  // 12.6 — isUniversalTool('rectangle') → false
  it('isUniversalTool("rectangle") returns false', () => {
    expect(isUniversalTool('rectangle')).toBe(false);
  });

  // 12.7 — resolveActiveToolOnModeSwitch: universal tool preserved
  it('resolveActiveToolOnModeSwitch preserves universal tool on mode switch', () => {
    const result = resolveActiveToolOnModeSwitch('select', 'annotation', {});
    expect(result).toBe('select');
  });

  // 12.8 — resolveActiveToolOnModeSwitch: mode-scoped tool reset to default
  it('resolveActiveToolOnModeSwitch resets mode-scoped tool to default', () => {
    const result = resolveActiveToolOnModeSwitch('rectangle', 'annotation', {});
    expect(result).toBe('freehand');
  });

  // 12.9 — resolveActiveToolOnModeSwitch: last-used tool restored
  it('resolveActiveToolOnModeSwitch restores last-used tool for the target mode', () => {
    const result = resolveActiveToolOnModeSwitch(
      'rectangle',
      'annotation',
      { annotation: 'text' },
    );
    expect(result).toBe('text');
  });

  it('resolveActiveToolOnModeSwitch falls through to default when lastUsed equals currentTool', () => {
    // currentTool is 'text' (non-universal), lastUsed for annotation is also 'text'.
    // The check `lastUsedForMode !== currentTool` is false, so we fall through to defaultTool.
    const result = resolveActiveToolOnModeSwitch(
      'text',
      'annotation',
      { annotation: 'text' },
    );
    expect(result).toBe('freehand');
  });

  // 12.10 — resolveActiveToolOnModeSwitch: first entry uses defaultTool
  it('resolveActiveToolOnModeSwitch uses defaultTool on first mode entry', () => {
    const result = resolveActiveToolOnModeSwitch('rectangle', 'grid', {});
    expect(result).toBe('select');
  });
});

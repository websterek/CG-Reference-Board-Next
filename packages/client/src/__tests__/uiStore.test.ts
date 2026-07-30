/**
 * uiStore unit tests — interaction mode state + activeTool transitions (Tasks 14.5-14.7).
 *
 * Per tool-registry-and-modes: setInteractionMode now calls
 * resolveActiveToolOnModeSwitch, which preserves universal tools and
 * resets mode-scoped tools to the target mode's defaultTool.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../state/uiStore';

describe('uiStore — interactionMode + activeTool transitions', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeTool: 'select',
      interactionMode: 'grid',
      lastUsedToolPerMode: {},
    });
  });

  // -----------------------------------------------------------------------
  // Basic mode state
  // -----------------------------------------------------------------------
  it('default mode is grid', () => {
    const { interactionMode } = useUIStore.getState();
    expect(interactionMode).toBe('grid');
  });

  it('default activeTool is select (grid defaultTool)', () => {
    const { activeTool } = useUIStore.getState();
    expect(activeTool).toBe('select');
  });

  it('setInteractionMode("annotation") updates state', () => {
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().interactionMode).toBe('annotation');
  });

  it('setInteractionMode("grid") returns to grid', () => {
    useUIStore.getState().setInteractionMode('annotation');
    useUIStore.getState().setInteractionMode('grid');
    expect(useUIStore.getState().interactionMode).toBe('grid');
  });

  // -----------------------------------------------------------------------
  // 14.5 — Switching mode with Select active preserves Select
  // -----------------------------------------------------------------------
  it('14.5: switching mode with Select active preserves Select', () => {
    // Start in grid with select
    useUIStore.getState().setActiveTool('select');
    expect(useUIStore.getState().activeTool).toBe('select');

    // Switch to annotation — select is universal, should be preserved
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().activeTool).toBe('select');

    // Switch to connector — still preserved
    useUIStore.getState().setInteractionMode('connector');
    expect(useUIStore.getState().activeTool).toBe('select');
  });

  // -----------------------------------------------------------------------
  // 14.6 — Switching mode with Rectangle active resets to annotation's defaultTool
  // -----------------------------------------------------------------------
  it('14.6: switching mode with Rectangle active resets to annotation defaultTool (freehand)', () => {
    // Set active tool to rectangle (mode-scoped)
    useUIStore.getState().setActiveTool('rectangle');
    expect(useUIStore.getState().activeTool).toBe('rectangle');

    // Switch to annotation — rectangle is not universal, resets to freehand
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().activeTool).toBe('freehand');
  });

  // -----------------------------------------------------------------------
  // 14.7 — Last-used tool per mode remembered
  // -----------------------------------------------------------------------
  it('14.7: last-used tool per mode is remembered across mode switches', () => {
    // Start in grid with rectangle (mode-scoped, not universal)
    useUIStore.getState().setActiveTool('rectangle');

    // Switch to annotation — rectangle is mode-scoped, resets to freehand
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().activeTool).toBe('freehand');

    // Pick 'text' in annotation mode
    useUIStore.getState().setActiveTool('text');
    expect(useUIStore.getState().activeTool).toBe('text');

    // Switch to grid — text is mode-scoped, lastUsed.grid is 'rectangle'
    useUIStore.getState().setInteractionMode('grid');
    expect(useUIStore.getState().activeTool).toBe('rectangle');

    // Switch back to annotation — lastUsed.annotation is 'text'
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().activeTool).toBe('text');
  });

  // -----------------------------------------------------------------------
  // Universal tools preserved across all mode switches
  // -----------------------------------------------------------------------
  it('Move (universal) is preserved on mode switch', () => {
    useUIStore.getState().setActiveTool('move');
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().activeTool).toBe('move');
  });

  it('Hand (universal) is preserved on mode switch', () => {
    useUIStore.getState().setActiveTool('hand');
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().activeTool).toBe('hand');
  });

  // -----------------------------------------------------------------------
  // setActiveTool updates lastUsedToolPerMode
  // -----------------------------------------------------------------------
  it('setActiveTool records last-used tool for current mode', () => {
    useUIStore.getState().setInteractionMode('annotation');
    useUIStore.getState().setActiveTool('text');
    const state = useUIStore.getState();
    expect(state.lastUsedToolPerMode['annotation']).toBe('text');
  });

  // -----------------------------------------------------------------------
  // First mode entry uses defaultTool
  // -----------------------------------------------------------------------
  it('first entry into connector mode uses connector defaultTool', () => {
    // Set a non-universal tool first so the mode switch triggers a reset
    useUIStore.getState().setActiveTool('rectangle');
    useUIStore.getState().setInteractionMode('connector');
    expect(useUIStore.getState().activeTool).toBe('connector');
  });
});

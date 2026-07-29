/**
 * uiStore unit tests — interaction mode state (Task 9.1).
 */

import { describe, it, expect } from 'vitest';
import { useUIStore } from '../state/uiStore';

describe('uiStore — interactionMode (Task 9.1)', () => {
  it('default mode is grid', () => {
    const { interactionMode } = useUIStore.getState();
    expect(interactionMode).toBe('grid');
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

  it('switching mode does not change activeTool', () => {
    useUIStore.getState().setActiveTool('rectangle');
    useUIStore.getState().setInteractionMode('annotation');
    expect(useUIStore.getState().activeTool).toBe('rectangle');
    useUIStore.getState().setInteractionMode('grid');
    expect(useUIStore.getState().activeTool).toBe('rectangle');
  });
});

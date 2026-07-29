/**
 * Toolbar unit tests — mode-based button filtering (Task 9.2, 9.3).
 *
 * Uses React Testing Library with happy-dom environment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Toolbar } from '../ui/Toolbar';
import { useUIStore } from '../state/uiStore';
import type { ToolbarAction } from '../ui/Toolbar';

describe('Toolbar — mode-based button filtering (Task 9.2, 9.3)', () => {
  let actions: ToolbarAction[] = [];

  beforeEach(() => {
    actions = [];
    // Reset store to defaults before each test
    useUIStore.setState({
      activeTool: 'select',
      interactionMode: 'grid',
    });
  });

  afterEach(() => {
    cleanup();
  });

  function renderToolbar() {
    return render(
      <Toolbar
        onAction={(a) => actions.push(a)}
        connected={true}
        role="owner"
      />,
    );
  }

  it('renders mode toggle button', () => {
    renderToolbar();
    expect(screen.getByLabelText('Toggle interaction mode')).toBeDefined();
  });

  it('in grid mode, shows Select, Rectangle, Frame buttons', () => {
    renderToolbar();
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Rectangle tool')).toBeDefined();
    expect(screen.getByLabelText('Frame tool')).toBeDefined();
  });

  it('in grid mode, hides Annotation button', () => {
    renderToolbar();
    expect(screen.queryByLabelText('Annotation freehand tool')).toBeNull();
  });

  it('in annotation mode, shows Annotation button', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    expect(screen.getByLabelText('Annotation freehand tool')).toBeDefined();
  });

  it('in annotation mode, hides Select, Rectangle, Frame buttons', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    expect(screen.queryByLabelText('Select tool')).toBeNull();
    expect(screen.queryByLabelText('Rectangle tool')).toBeNull();
    expect(screen.queryByLabelText('Frame tool')).toBeNull();
  });

  it('Delete button is visible in both modes', () => {
    renderToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();

    cleanup();
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();
  });

  it('clicking mode toggle switches from grid to annotation', () => {
    renderToolbar();
    const toggle = screen.getByLabelText('Toggle interaction mode');
    expect(toggle.textContent).toContain('Grid');

    fireEvent.click(toggle);

    expect(useUIStore.getState().interactionMode).toBe('annotation');
    expect(actions).toContainEqual({ type: 'set-mode', mode: 'annotation' });
  });

  it('clicking mode toggle switches from annotation to grid', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    const toggle = screen.getByLabelText('Toggle interaction mode');
    expect(toggle.textContent).toContain('Annotation');

    fireEvent.click(toggle);

    expect(useUIStore.getState().interactionMode).toBe('grid');
    expect(actions).toContainEqual({ type: 'set-mode', mode: 'grid' });
  });

  it('mode toggle emits set-mode action', () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText('Toggle interaction mode'));
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0]!.type).toBe('set-mode');
  });
});

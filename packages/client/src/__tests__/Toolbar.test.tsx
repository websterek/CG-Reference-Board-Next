/**
 * Toolbar integration tests — universal row + mode-scoped row (Tasks 14.1-14.4, 14.11).
 *
 * Uses React Testing Library with happy-dom environment.
 * The Toolbar now reads from the ToolDefinition registry, so we must
 * populate it before each test and reset it after.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useUIStore } from '../state/uiStore';
import {
  populateDefaultToolRegistry,
  _resetToolRegistryForTests,
} from '../canvas/tools';
import type { ToolbarAction } from '../ui/Toolbar';
import { Toolbar } from '../ui/Toolbar';

describe('Toolbar — universal row + mode-scoped row', () => {
  let actions: ToolbarAction[] = [];

  beforeEach(() => {
    actions = [];
    _resetToolRegistryForTests();
    populateDefaultToolRegistry();
    useUIStore.setState({
      activeTool: 'select',
      interactionMode: 'grid',
      lastUsedToolPerMode: {},
    });
  });

  afterEach(() => {
    cleanup();
    _resetToolRegistryForTests();
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

  // -----------------------------------------------------------------------
  // 14.1 — Universal row in grid mode
  // -----------------------------------------------------------------------
  it('14.1: shows universal row (Select/Move/Hand) in grid mode', () => {
    renderToolbar();
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Move tool')).toBeDefined();
    expect(screen.getByLabelText('Hand tool')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 14.2 — Universal row in annotation mode
  // -----------------------------------------------------------------------
  it('14.2: shows universal row (Select/Move/Hand) in annotation mode', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Move tool')).toBeDefined();
    expect(screen.getByLabelText('Hand tool')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 14.3 — Universal row in connector mode
  // -----------------------------------------------------------------------
  it('14.3: shows universal row (Select/Move/Hand) in connector mode', () => {
    useUIStore.getState().setInteractionMode('connector');
    renderToolbar();
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Move tool')).toBeDefined();
    expect(screen.getByLabelText('Hand tool')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 14.4 — Mode-scoped row changes when switching grid → annotation
  // -----------------------------------------------------------------------
  it('14.4: mode-scoped row changes when switching from grid to annotation', () => {
    renderToolbar();

    // Grid mode: Rectangle present, Freehand absent
    expect(screen.getByLabelText('Rectangle tool')).toBeDefined();
    expect(screen.queryByLabelText('Freehand tool')).toBeNull();

    // Switch to annotation mode
    cleanup();
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();

    // Annotation mode: Freehand present, Frame absent
    expect(screen.getByLabelText('Freehand tool')).toBeDefined();
    expect(screen.queryByLabelText('Frame tool')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Grid mode mode-scoped row contents
  // -----------------------------------------------------------------------
  it('grid mode shows Rectangle, Frame, Image, Text in mode-scoped row', () => {
    renderToolbar();
    expect(screen.getByLabelText('Rectangle tool')).toBeDefined();
    expect(screen.getByLabelText('Frame tool')).toBeDefined();
    expect(screen.getByLabelText('Image tool')).toBeDefined();
    expect(screen.getByLabelText('Text tool')).toBeDefined();
    // Freehand should NOT be visible in grid mode
    expect(screen.queryByLabelText('Freehand tool')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Annotation mode mode-scoped row contents
  // -----------------------------------------------------------------------
  it('annotation mode shows Freehand, Arrow, Rectangle, Text, Eraser in mode-scoped row', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    expect(screen.getByLabelText('Freehand tool')).toBeDefined();
    expect(screen.getByLabelText('Arrow tool')).toBeDefined();
    expect(screen.getByLabelText('Rectangle tool')).toBeDefined();
    expect(screen.getByLabelText('Text tool')).toBeDefined();
    expect(screen.getByLabelText('Eraser tool')).toBeDefined();
    // Frame and Image should NOT be visible in annotation mode
    expect(screen.queryByLabelText('Frame tool')).toBeNull();
    expect(screen.queryByLabelText('Image tool')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Connector mode mode-scoped row contents
  // -----------------------------------------------------------------------
  it('connector mode shows Connector in mode-scoped row', () => {
    useUIStore.getState().setInteractionMode('connector');
    renderToolbar();
    expect(screen.getByLabelText('Connector tool')).toBeDefined();
    // Grid/annotation tools should NOT be visible
    expect(screen.queryByLabelText('Rectangle tool')).toBeNull();
    expect(screen.queryByLabelText('Freehand tool')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Delete button visible in all modes
  // -----------------------------------------------------------------------
  it('Delete button is visible in all modes', () => {
    renderToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();

    cleanup();
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();

    cleanup();
    useUIStore.getState().setInteractionMode('connector');
    renderToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Mode toggle — grid → annotation
  // -----------------------------------------------------------------------
  it('clicking mode toggle switches from grid to annotation', () => {
    renderToolbar();
    const toggle = screen.getByLabelText('Toggle interaction mode');
    expect(toggle.textContent).toContain('Grid');

    fireEvent.click(toggle);

    expect(useUIStore.getState().interactionMode).toBe('annotation');
    expect(actions).toContainEqual({ type: 'set-mode', mode: 'annotation' });
  });

  // -----------------------------------------------------------------------
  // Mode toggle — annotation → connector
  // -----------------------------------------------------------------------
  it('clicking mode toggle switches from annotation to connector', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolbar();
    const toggle = screen.getByLabelText('Toggle interaction mode');
    expect(toggle.textContent).toContain('Annotation');

    fireEvent.click(toggle);

    expect(useUIStore.getState().interactionMode).toBe('connector');
    expect(actions).toContainEqual({ type: 'set-mode', mode: 'connector' });
  });

  // -----------------------------------------------------------------------
  // 14.11 — Mode toggle cycles through all 3 modes and wraps
  // -----------------------------------------------------------------------
  it('14.11: mode toggle cycles through all 3 modes and wraps around', () => {
    renderToolbar();
    const toggle = screen.getByLabelText('Toggle interaction mode');

    // Start: grid
    expect(useUIStore.getState().interactionMode).toBe('grid');

    // Click 1: grid → annotation
    fireEvent.click(toggle);
    expect(useUIStore.getState().interactionMode).toBe('annotation');

    // Click 2: annotation → connector
    fireEvent.click(toggle);
    expect(useUIStore.getState().interactionMode).toBe('connector');

    // Click 3: connector → grid (wraps)
    fireEvent.click(toggle);
    expect(useUIStore.getState().interactionMode).toBe('grid');

    // All three set-mode actions emitted
    expect(actions).toContainEqual({ type: 'set-mode', mode: 'annotation' });
    expect(actions).toContainEqual({ type: 'set-mode', mode: 'connector' });
    expect(actions).toContainEqual({ type: 'set-mode', mode: 'grid' });
  });

  // -----------------------------------------------------------------------
  // Mode toggle emits set-mode action
  // -----------------------------------------------------------------------
  it('mode toggle emits set-mode action', () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText('Toggle interaction mode'));
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0]!.type).toBe('set-mode');
  });

  // -----------------------------------------------------------------------
  // Renders mode toggle button
  // -----------------------------------------------------------------------
  it('renders mode toggle button', () => {
    renderToolbar();
    expect(screen.getByLabelText('Toggle interaction mode')).toBeDefined();
  });
});

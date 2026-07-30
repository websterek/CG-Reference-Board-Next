/**
 * ToolsToolbar integration tests — universal row + mode-scoped row.
 *
 * Migrated from the legacy `Toolbar.test.tsx` after deletion of the
 * duplicate `Toolbar.tsx` component (see openspec change
 * `frontend-modularity-phase1-dead-code`). This file covers the
 * ship-target `ToolsToolbar` rendered by `BoardPage`. Cases that
 * targeted the dead `Toolbar.tsx`'s hidden `<span>` artifacts and its
 * legacy mode-toggle button are dropped — those affordances no longer
 * exist.
 *
 * Uses React Testing Library with happy-dom environment.
 * The toolbar reads from the ToolDefinition registry, so the registry
 * must be populated before each test and reset after.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useUIStore } from '../state/uiStore';
import {
  populateDefaultToolRegistry,
  _resetToolRegistryForTests,
} from '../canvas/tools';
import { ToolsToolbar, type ToolToolbarAction } from '../ui/ToolsToolbar';

describe('ToolsToolbar — universal row + mode-scoped row', () => {
  let actions: ToolToolbarAction[] = [];

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

  function renderToolsToolbar() {
    return render(
      <ToolsToolbar
        onAction={(a) => actions.push(a)}
      />,
    );
  }

  // -----------------------------------------------------------------------
  // Universal row in every mode
  // -----------------------------------------------------------------------
  it('shows universal row (Select/Move/Hand) in grid mode', () => {
    renderToolsToolbar();
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Move tool')).toBeDefined();
    expect(screen.getByLabelText('Hand tool')).toBeDefined();
  });

  it('shows universal row (Select/Move/Hand) in annotation mode', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolsToolbar();
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Move tool')).toBeDefined();
    expect(screen.getByLabelText('Hand tool')).toBeDefined();
  });

  it('shows universal row (Select/Move/Hand) in connector mode', () => {
    useUIStore.getState().setInteractionMode('connector');
    renderToolsToolbar();
    expect(screen.getByLabelText('Select tool')).toBeDefined();
    expect(screen.getByLabelText('Move tool')).toBeDefined();
    expect(screen.getByLabelText('Hand tool')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Mode-scoped row changes when switching grid → annotation
  // -----------------------------------------------------------------------
  it('mode-scoped row changes when switching from grid to annotation', () => {
    renderToolsToolbar();

    // Grid mode: Rectangle present, Freehand absent
    expect(screen.getByLabelText('Rectangle tool')).toBeDefined();
    expect(screen.queryByLabelText('Freehand tool')).toBeNull();

    // Switch to annotation mode
    cleanup();
    useUIStore.getState().setInteractionMode('annotation');
    renderToolsToolbar();

    // Annotation mode: Freehand present, Frame absent
    expect(screen.getByLabelText('Freehand tool')).toBeDefined();
    expect(screen.queryByLabelText('Frame tool')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Grid mode mode-scoped row contents
  // -----------------------------------------------------------------------
  it('grid mode shows Rectangle, Frame, Image, Text in mode-scoped row', () => {
    renderToolsToolbar();
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
    renderToolsToolbar();
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
    renderToolsToolbar();
    expect(screen.getByLabelText('Connector tool')).toBeDefined();
    // Grid/annotation tools should NOT be visible
    expect(screen.queryByLabelText('Rectangle tool')).toBeNull();
    expect(screen.queryByLabelText('Freehand tool')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Delete button visible in all modes
  // -----------------------------------------------------------------------
  it('Delete button is visible in all modes', () => {
    renderToolsToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();

    cleanup();
    useUIStore.getState().setInteractionMode('annotation');
    renderToolsToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();

    cleanup();
    useUIStore.getState().setInteractionMode('connector');
    renderToolsToolbar();
    expect(screen.getByLabelText('Delete selection')).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Click on a tool emits a set-tool action and updates active tool
  // -----------------------------------------------------------------------
  it('clicking a tool button emits set-tool action and updates the active tool', () => {
    renderToolsToolbar();
    const move = screen.getByLabelText('Move tool');
    fireEvent.click(move);

    expect(useUIStore.getState().activeTool).toBe('move');
    expect(actions).toContainEqual({ type: 'set-tool', tool: 'move' });
  });

  it('clicking Delete emits a delete-selected action', () => {
    renderToolsToolbar();
    fireEvent.click(screen.getByLabelText('Delete selection'));
    expect(actions).toContainEqual({ type: 'delete-selected' });
  });

  // -----------------------------------------------------------------------
  // aria-pressed reflects the active tool
  // -----------------------------------------------------------------------
  it('marks the active tool button with aria-pressed=true', () => {
    useUIStore.getState().setActiveTool('rectangle');
    renderToolsToolbar();
    expect(screen.getByLabelText('Rectangle tool').getAttribute('aria-pressed')).toBe('true');
    // A non-active universal tool should be aria-pressed=false
    expect(screen.getByLabelText('Select tool').getAttribute('aria-pressed')).toBe('false');
  });

  // -----------------------------------------------------------------------
  // Click on a mode-scoped tool works the same as a universal tool
  // -----------------------------------------------------------------------
  it('clicking a mode-scoped tool emits set-tool and updates the active tool', () => {
    useUIStore.getState().setInteractionMode('annotation');
    renderToolsToolbar();
    const freehand = screen.getByLabelText('Freehand tool');
    fireEvent.click(freehand);

    expect(useUIStore.getState().activeTool).toBe('freehand');
    expect(actions).toContainEqual({ type: 'set-tool', tool: 'freehand' });
  });
});

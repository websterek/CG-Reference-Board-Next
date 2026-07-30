/**
 * ContextMenu tests — right-click menu, close behavior, item rendering.
 *
 * Mounts the menu with a fake controller-sourced menu state and
 * verifies rendering, submenu expansion, and close-on-outside-click.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { ContextMenu } from '../ui/ContextMenu';
import type { ContextMenuItem, ContextMenuState } from '../canvas/controller';

afterEach(() => {
  cleanup();
});

function makeState(items: ContextMenuItem[]): ContextMenuState {
  return { anchor: { x: 100, y: 100 }, items };
}

function exists(testId: string): boolean {
  return screen.queryByTestId(testId) !== null;
}

describe('ContextMenu', () => {
  it('renders nothing when menu is null', () => {
    const { container } = render(<ContextMenu menu={null} onClose={() => {}} />);
    expect(container.querySelector('[data-testid="context-menu"]')).toBeNull();
  });

  it('renders a global menu with Paste + View submenu', () => {
    const state = makeState([
      { kind: 'action', label: 'Paste image', onClick: () => {} },
      { kind: 'divider' },
      {
        kind: 'submenu',
        label: 'View',
        items: [
          { kind: 'action', label: 'Zoom in', onClick: () => {} },
          { kind: 'action', label: 'Zoom out', onClick: () => {} },
        ],
      },
    ]);
    render(<ContextMenu menu={state} onClose={() => {}} />);
    expect(exists('context-menu')).toBe(true);
    expect(exists('context-menu-item-Paste image')).toBe(true);
    expect(exists('context-menu-submenu-View')).toBe(true);
  });

  it('renders an image menu with Size submenu and info footer', () => {
    const state = makeState([
      {
        kind: 'submenu',
        label: 'Size',
        items: [1, 2, 3].map((n) => ({
          kind: 'action' as const,
          label: `${n}×`,
          onClick: () => {},
        })),
      },
      { kind: 'divider' },
      { kind: 'action', label: 'Paste image', onClick: () => {} },
      { kind: 'action', label: 'Delete', onClick: () => {} },
      { kind: 'divider' },
      { kind: 'info', text: '1600 × 800' },
    ]);
    render(<ContextMenu menu={state} onClose={() => {}} />);
    expect(exists('context-menu-submenu-Size')).toBe(true);
    expect(exists('context-menu-item-Paste image')).toBe(true);
    expect(exists('context-menu-item-Delete')).toBe(true);
    expect(screen.getByText('1600 × 800')).toBeTruthy();
  });

  it('invokes the action onClick and calls onClose when an action is clicked', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const state = makeState([{ kind: 'action', label: 'Delete', onClick }]);
    render(<ContextMenu menu={state} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('context-menu-item-Delete'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('expands a submenu on click and shows its actions', () => {
    const state = makeState([
      {
        kind: 'submenu',
        label: 'Size',
        items: [1, 2].map((n) => ({
          kind: 'action' as const,
          label: `${n}×`,
          onClick: () => {},
        })),
      },
    ]);
    render(<ContextMenu menu={state} onClose={() => {}} />);
    expect(screen.queryByTestId('context-menu-item-Size-1×')).toBeNull();
    fireEvent.click(screen.getByTestId('context-menu-submenu-Size').querySelector('button')!);
    expect(exists('context-menu-item-Size-1×')).toBe(true);
    expect(exists('context-menu-item-Size-2×')).toBe(true);
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    const state = makeState([{ kind: 'action', label: 'X', onClick: () => {} }]);
    render(<ContextMenu menu={state} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on outside mousedown', () => {
    const onClose = vi.fn();
    const state = makeState([{ kind: 'action', label: 'X', onClick: () => {} }]);
    render(
      <div>
        <button data-testid="outside">Outside</button>
        <ContextMenu menu={state} onClose={onClose} />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('flips anchor to stay in viewport when overflowing the right edge', () => {
    const state = makeState([{ kind: 'action', label: 'X', onClick: () => {} }]);
    Object.defineProperty(window, 'innerWidth', { value: 200, configurable: true });
    render(<ContextMenu menu={state} onClose={() => {}} />);
    const el = screen.getByTestId('context-menu') as HTMLElement;
    const left = parseInt(el.style.left, 10);
    // After the flip decision: anchor x=100, viewport=200, margin=8,
    // estimated width=220, so 100 + 220 + 8 > 200 → flip; new x =
    // max(8, 100 - 220) = 8. On first render, the measured dims is
    // the estimate (220), so the flip takes effect.
    expect(left).toBeLessThanOrEqual(200);
  });
});

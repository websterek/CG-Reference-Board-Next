/**
 * MinimapPanel regression tests — guards the pointerdown-only
 * navigation fix (see openspec change
 * `frontend-modularity-phase1-dead-code`, section 7).
 *
 * Before the fix, both `handlePointerDown` and `handleClick` were
 * registered on the same surface and both called `handlePointer`,
 * so a single primary click navigated the canvas twice. These tests
 * lock the corrected behavior: one pointerdown yields exactly one
 * navigation, and non-primary buttons are ignored.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MinimapPanel } from '../ui/MinimapPanel';

describe('MinimapPanel — single-fire navigation', () => {
  const items = [
    { id: 'a', x: 0, y: 0, width: 50, height: 50 },
    { id: 'b', x: 100, y: 100, width: 80, height: 80 },
  ];
  const camera = { x: 50, y: 50, zoom: 1 };
  const viewport = { width: 200, height: 200 };

  beforeEach(() => {
    // happy-dom doesn't implement getBoundingClientRect or
    // pointer-capture on every element reliably, and returns null
    // from canvas.getContext('2d'). Stub all three so the minimap's
    // useEffect populates `geometryRef.current` (without that, the
    // pointerdown handler short-circuits and `onNavigate` is never
    // called).
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 180,
        bottom: 120,
        width: 180,
        height: 120,
        toJSON: () => ({}),
      }),
    });

    const noop = () => {};
    const fakeCtx: Partial<CanvasRenderingContext2D> = {
      setTransform: noop,
      clearRect: noop,
      fillRect: noop,
      strokeRect: noop,
      fillText: noop,
    };
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => fakeCtx,
    });

    const capturedPointers = new WeakMap<Element, Set<number>>();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement, pointerId: number) {
        let set = capturedPointers.get(this);
        if (!set) {
          set = new Set();
          capturedPointers.set(this, set);
        }
        set.add(pointerId);
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement, pointerId: number) {
        const set = capturedPointers.get(this);
        if (set) set.delete(pointerId);
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement, pointerId: number) {
        const set = capturedPointers.get(this);
        return set ? set.has(pointerId) : false;
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('invokes onNavigate exactly once on a single primary pointerdown', () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <MinimapPanel
        items={items}
        camera={camera}
        viewport={viewport}
        onNavigate={onNavigate}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onFit={() => {}}
      />,
    );
    const surface = getByLabelText('Board minimap — click to navigate');

    fireEvent.pointerDown(surface, { button: 0, pointerId: 1, pointerType: 'mouse' });

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('ignores non-primary buttons (right/middle click)', () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <MinimapPanel
        items={items}
        camera={camera}
        viewport={viewport}
        onNavigate={onNavigate}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onFit={() => {}}
      />,
    );
    const surface = getByLabelText('Board minimap — click to navigate');

    fireEvent.pointerDown(surface, { button: 2, pointerId: 2, pointerType: 'mouse' });
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.pointerDown(surface, { button: 1, pointerId: 3, pointerType: 'mouse' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not register a click handler on the minimap surface', () => {
    // The double-fire bug came from a click handler on the same node as
    // the pointerdown handler. After the fix, a follow-up click event
    // on the surface must NOT trigger an extra navigation. We simulate
    // the browser firing both events (pointerdown + click) on a single
    // user gesture and assert only one navigation happens.
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <MinimapPanel
        items={items}
        camera={camera}
        viewport={viewport}
        onNavigate={onNavigate}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onFit={() => {}}
      />,
    );
    const surface = getByLabelText('Board minimap — click to navigate');

    fireEvent.pointerDown(surface, { button: 0, pointerId: 4, pointerType: 'mouse' });
    fireEvent.click(surface, { button: 0 });

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('emits one navigation per pointermove while a button is held, plus no extra on pointerup', () => {
    const onNavigate = vi.fn();
    const { getByLabelText } = render(
      <MinimapPanel
        items={items}
        camera={camera}
        viewport={viewport}
        onNavigate={onNavigate}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onFit={() => {}}
      />,
    );
    const surface = getByLabelText('Board minimap — click to navigate');

    fireEvent.pointerDown(surface, { button: 0, pointerId: 5, pointerType: 'mouse', clientX: 30, clientY: 30 });
    fireEvent.pointerMove(surface, { buttons: 1, clientX: 40, clientY: 40, pointerId: 5 });
    fireEvent.pointerMove(surface, { buttons: 1, clientX: 50, clientY: 50, pointerId: 5 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 5 });
    fireEvent.click(surface, { button: 0 });

    // 1 (down) + 2 (move) = 3 navigations. No extra from pointerup or
    // the trailing click. (Before the fix this would be 5+: down,
    // move, move, up, click, click.)
    expect(onNavigate).toHaveBeenCalledTimes(3);
  });
});

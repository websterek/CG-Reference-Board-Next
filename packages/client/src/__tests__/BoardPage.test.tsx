/**
 * BoardPage — render-count regression for the minimap subscription.
 *
 * Guards the useSyncExternalStore change in `perf-panning-and-large-boards`
 * (Change 1). Before that change, BoardPage held `useState<MinimapSnapshot>`
 * and called `setMinimap` from `controller.onRender`, so every pan frame
 * committed a re-render of BoardPage and its children (ModeTabs,
 * ToolsToolbar, UserPanel, MinimapPanel). After Change 1, BoardPage
 * subscribes via `useSyncExternalStore`; the controller returns the same
 * snapshot reference when nothing visibly changed, so React does not
 * re-commit. This test fires 60 controller emits that don't change the
 * snapshot reference, then one emit that does, and asserts:
 *
 *   - ToolsToolbar re-renders exactly once (the initial mount) for the
 *     60 same-ref emits.
 *   - ToolsToolbar re-renders a second time when the snapshot reference
 *     finally changes.
 *   - The controller's `subscribeMinimap` was wired up (BoardPage called
 *     it at least once during mount).
 *
 * We do not render the real CanvasController / HocuspocusProvider /
 * YjsBoardAdapter — happy-dom can't run PixiJS. We mock them so we
 * control when subscribers get notified and with what payload.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

// --- Mocks -------------------------------------------------------------

// Mock the controller with a hand-rolled fake so we can fire emits.
const controllerMock = {
  subscribeMinimap: vi.fn(),
  getMinimapSnapshot: vi.fn(),
  // Unused by BoardPage but referenced in cleanup / typing:
  applyToolbarAction: vi.fn(),
  applyRemoteUpdate: vi.fn(),
  hydrateItems: vi.fn(),
  destroy: vi.fn(),
  setZoom: vi.fn(),
  getCamera: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  resetView: vi.fn(),
  fitToContent: vi.fn(),
  centerOn: vi.fn(),
};

vi.mock('../canvas/controller', () => ({
  CanvasController: vi.fn().mockImplementation(() => controllerMock),
}));

vi.mock('../collab/YjsBoardAdapter', () => ({
  YjsBoardAdapter: vi.fn().mockImplementation(() => ({
    onItemChanged: vi.fn(),
    onInitialSync: vi.fn(),
    toDomainItems: vi.fn(() => []),
    applyLocalAction: vi.fn(),
    createLocal: vi.fn(),
    deleteLocal: vi.fn(),
  })),
}));

vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    document: {},
  })),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'test-board' }),
}));

// Wrap ToolsToolbar in a render-counter so we can assert commit count
// without changing production code. The component is wrapped at the
// module level (vi.mock factory runs before BoardPage imports it), so
// BoardPage sees the wrapped version.
const toolsToolbarRenderSpy = vi.fn();
vi.mock('../ui/ToolsToolbar', async () => {
  const actual = await vi.importActual<typeof import('../ui/ToolsToolbar')>('../ui/ToolsToolbar');
  const Wrapped = (props: React.ComponentProps<typeof actual.ToolsToolbar>) => {
    toolsToolbarRenderSpy();
    return <actual.ToolsToolbar {...props} />;
  };
  return {
    ...actual,
    ToolsToolbar: Wrapped,
  };
});

// Suppress noisy unimplemented-method warnings from PixiJS by stubbing
// the canvas context, similar to MinimapPanel.test.tsx.
const noop = () => {};
const fakeCtx: Partial<CanvasRenderingContext2D> = {
  setTransform: noop,
  clearRect: noop,
  fillRect: noop,
  strokeRect: noop,
  fillText: noop,
};
beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => fakeCtx,
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100,
      toJSON: () => ({}),
    }),
  });
});

// --- Test --------------------------------------------------------------

import { BoardPage } from '../app/BoardPage';
import type { MinimapSnapshot } from '../canvas/controller';

type Listener = () => void;
let listeners: Listener[] = [];
let lastSnapshot: MinimapSnapshot | null = null;

function setSnapshot(next: MinimapSnapshot | null) {
  lastSnapshot = next;
  for (const l of listeners) l();
}

beforeEach(() => {
  listeners = [];
  lastSnapshot = null;
  controllerMock.subscribeMinimap.mockImplementation((cb: Listener) => {
    listeners.push(cb);
    return () => {
      listeners = listeners.filter((l) => l !== cb);
    };
  });
  controllerMock.getMinimapSnapshot.mockImplementation(() => lastSnapshot);
  toolsToolbarRenderSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BoardPage — useSyncExternalStore minimap subscription (perf Change 1)', () => {
  it('subscribes to the controller minimap on mount', async () => {
    await act(async () => {
      render(<BoardPage />);
    });
    expect(controllerMock.subscribeMinimap).toHaveBeenCalledTimes(1);
  });

  it('does not re-render chrome when the snapshot reference is stable', async () => {
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<BoardPage />);
    });
    const initialRenders = toolsToolbarRenderSpy.mock.calls.length;
    expect(initialRenders).toBeGreaterThan(0);

    // First emit: snapshot is set to a non-null reference. This causes
    // exactly one re-render (the page transitions from null to a value).
    const stable: MinimapSnapshot = {
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 100, height: 100 },
      items: [],
    };
    await act(async () => {
      setSnapshot(stable);
    });
    const baselineRenders = toolsToolbarRenderSpy.mock.calls.length;
    expect(baselineRenders).toBeGreaterThan(initialRenders);

    // Now fire 60 notifications that re-emit the same snapshot reference.
    // useSyncExternalStore compares with Object.is and skips the commit,
    // so ToolsToolbar must NOT re-render.
    await act(async () => {
      for (let i = 0; i < 60; i++) {
        for (const l of listeners) l();
      }
    });
    const afterStableRenders = toolsToolbarRenderSpy.mock.calls.length;
    expect(afterStableRenders).toBe(baselineRenders);

    view?.unmount();
  });

  it('re-renders chrome exactly once when the snapshot reference changes', async () => {
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<BoardPage />);
    });
    const initialRenders = toolsToolbarRenderSpy.mock.calls.length;

    // First emit: snapshot is non-null for the first time.
    const snap1: MinimapSnapshot = {
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 100, height: 100 },
      items: [],
    };
    await act(async () => {
      setSnapshot(snap1);
    });
    const afterFirstRenders = toolsToolbarRenderSpy.mock.calls.length;
    expect(afterFirstRenders).toBeGreaterThan(initialRenders);

    // Second emit: snapshot reference changes. This simulates a pan
    // frame that crossed the 0.5-unit threshold or a zoom change.
    const snap2: MinimapSnapshot = {
      camera: { x: 10, y: 0, zoom: 1 },
      viewport: { width: 100, height: 100 },
      items: [],
    };
    await act(async () => {
      setSnapshot(snap2);
    });
    const afterSecondRenders = toolsToolbarRenderSpy.mock.calls.length;
    // Exactly one additional commit.
    expect(afterSecondRenders - afterFirstRenders).toBe(1);

    view?.unmount();
  });

  it('unsubscribes on unmount so listeners are released', async () => {
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<BoardPage />);
    });
    expect(listeners.length).toBe(1);
    await act(async () => {
      view?.unmount();
    });
    expect(listeners.length).toBe(0);
  });
});

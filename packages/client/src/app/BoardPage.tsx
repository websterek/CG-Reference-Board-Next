/**
 * BoardPage — composes the canvas + floating UI panels.
 *
 * Layout (per the redesign brief):
 *   - Top-left:    horizontal mode tabs (above) + vertical icon-only
 *                  tools toolbar (below). The two are independent
 *                  floating panels, not nested, so they read as
 *                  separate affordances.
 *   - Top-right:   user panel (connection, name, role, actions).
 *   - Bottom-right: minimap panel + zoom + fit.
 *
 * The canvas occupies the full viewport; all panels are absolute-
 * positioned on top of it with translucent surfaces and soft borders.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { ModeTabs } from '../ui/ModeTabs';
import { ToolsToolbar, type ToolToolbarAction } from '../ui/ToolsToolbar';
import { UserPanel } from '../ui/UserPanel';
import { MinimapPanel } from '../ui/MinimapPanel';
import type { MinimapItem } from '../ui/MinimapPanel';
import { ContextMenu } from '../ui/ContextMenu';
import type { ContextMenuState } from '../canvas/controller';
import { CanvasController } from '../canvas/controller';
import { YjsBoardAdapter, type RemoteUpdate } from '../collab/YjsBoardAdapter';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useUIStore } from '../state/uiStore';
import type { BoardItem } from '@gridboard/domain';
import { asItemId } from '@gridboard/domain';

export function BoardPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const containerRef = useRef<HTMLDivElement>(null);
  // The controller is created in useEffect below, but useSyncExternalStore
  // wires its subscription on the first render — when the ref would still
  // be null. We use a state slot to force a re-render when the controller
  // appears, so useSyncExternalStore rebinds with a non-null controller.
  // The ref is kept for cleanup paths (e.g. controller.destroy()).
  const controllerRef = useRef<CanvasController | null>(null);
  const [controller, setController] = useState<CanvasController | null>(null);
  const adapterRef = useRef<YjsBoardAdapter | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<string>('unknown');
  const [userName, setUserName] = useState<string | undefined>(undefined);

  const subscribeMinimap = useCallback(
    (cb: () => void) =>
      controller?.subscribeMinimap(cb) ?? (() => {}),
    [controller],
  );
  const getMinimapSnapshot = useCallback(
    () => controller?.getMinimapSnapshot() ?? null,
    [controller],
  );
  const minimap = useSyncExternalStore(subscribeMinimap, getMinimapSnapshot);

  const subscribeContextMenu = useCallback(
    (cb: (menu: ContextMenuState | null) => void) =>
      controller?.subscribeContextMenu(cb) ?? (() => {}),
    [controller],
  );
  const getContextMenuSnapshot = useCallback(
    () => controllerRef.current
      ? (controllerRef.current as unknown as { lastEmittedContextMenu: ContextMenuState | null }).lastEmittedContextMenu
      : null,
    [],
  );
  const contextMenu = useSyncExternalStore(subscribeContextMenu, getContextMenuSnapshot);

  useEffect(() => {
    if (!id || !containerRef.current) return;

    const token = localStorage.getItem(`gridboard:token:${id}`) ?? '';
    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${wsScheme}://${window.location.host}/collab`;

    const provider = new HocuspocusProvider({
      url,
      name: `board:${id}`,
      token,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
    });
    providerRef.current = provider;

    const adapter = new YjsBoardAdapter(provider.document);
    adapterRef.current = adapter;

    const controller = new CanvasController({
      container: containerRef.current,
      getItems: () => adapter.toDomainItems() as Iterable<BoardItem>,
      onItemChange: (u) => adapter.applyLocalAction({ id: u.id, partial: u.partial }),
      onItemDelete: (del) => adapter.deleteLocal(asItemId(del.id)),
      onItemCreate: (add) => adapter.createLocal(add.item),
      boardId: id,
    });
    // Wire paste errors to the UI store so the user sees a toast.
    controller.onPasteError = (error: Error) => {
      useUIStore.getState().pushToast?.({
        level: 'error',
        message: `Image paste failed: ${error.message}`,
      });
    };
    controllerRef.current = controller;
    setController(controller);

    // Install the global paste listener. Bail if the user is typing in
    // a text input (so pasting into an inspector field still works).
    const onWindowPaste = (e: ClipboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      void controller.pasteImageFromClipboard(e);
    };
    window.addEventListener('paste', onWindowPaste);

    const onRemote = (u: RemoteUpdate) => {
      controller.applyRemoteUpdate(u.id, u.partial);
    };
    adapter.onItemChanged(onRemote);

    adapter.onInitialSync(() => {
      const items = adapter.toDomainItems();
      controller.hydrateItems(items);
    });

    // Sync the controller's tool state to whatever the UI store
    // booted with, so the very first click on the canvas acts with
    // the highlighted tool.
    controller.applyToolbarAction({
      type: 'set-tool',
      tool: useUIStore.getState().activeTool,
    });

    // Decode role + name from token (UI only — server still validates).
    try {
      const segments = token.split('.');
      const payload = segments[1];
      if (!payload) throw new Error('no payload');
      const decoded = JSON.parse(atob(payload)) as {
        role?: string;
        name?: string;
        sub?: string;
      };
      setRole(decoded.role ?? 'unknown');
      setUserName(decoded.name ?? decoded.sub);
    } catch {
      setRole('anon');
    }

    return () => {
      window.removeEventListener('paste', onWindowPaste);
      provider.destroy();
      controller.destroy();
      providerRef.current = null;
      adapterRef.current = null;
      controllerRef.current = null;
      setController(null);
    };
  }, [id]);

  // Tools toolbar action handler — bridge to controller.
  const handleToolAction = useCallback((action: ToolToolbarAction) => {
    controllerRef.current?.applyToolbarAction(action);
  }, []);

  const handleModeChange = useCallback((_modeId: string) => {
    // The ModeTabs already pushed the mode to the uiStore. Read it
    // back and tell the controller so the snap policy updates, then
    // re-apply the (possibly new) active tool so the new mode's
    // tool takes effect immediately.
    const { interactionMode, activeTool } = useUIStore.getState();
    controllerRef.current?.applyToolbarAction({ type: 'set-mode', mode: interactionMode });
    controllerRef.current?.applyToolbarAction({ type: 'set-tool', tool: activeTool });
  }, []);

  const handleZoomIn = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const cam = ctrl.getCamera();
    ctrl.setZoom(cam.zoom * 1.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const cam = ctrl.getCamera();
    ctrl.setZoom(cam.zoom / 1.2);
  }, []);

  const handleResetZoom = useCallback(() => {
    controllerRef.current?.resetView();
  }, []);

  const handleFit = useCallback(() => {
    controllerRef.current?.fitToContent();
  }, []);

  const handleNavigate = useCallback((p: { x: number; y: number }) => {
    controllerRef.current?.centerOn(p);
  }, []);

  // Build minimap items with a soft per-kind color.
  const minimapItems: MinimapItem[] = (minimap?.items ?? []).map((it) => ({
    id: it.id,
    x: it.x,
    y: it.y,
    width: it.width,
    height: it.height,
    color: kindColor(it.type),
  }));

  return (
    <div className="board-page">
      <div ref={containerRef} className="board-page__canvas" data-testid="canvas" />
      <ModeTabs onModeChange={handleModeChange} />
      <ToolsToolbar onAction={handleToolAction} />
      <UserPanel
        connected={connected}
        role={role}
        userName={userName}
        onSettings={() => {}}
        onShare={() => {}}
      />
      <MinimapPanel
        items={minimapItems}
        camera={minimap?.camera ?? { x: 0, y: 0, zoom: 1 }}
        viewport={minimap?.viewport ?? { width: 0, height: 0 }}
        onNavigate={handleNavigate}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onFit={handleFit}
      />
      <ContextMenu
        menu={contextMenu}
        onClose={() => controllerRef.current?.closeContextMenu()}
      />
      <ToastList />
    </div>
  );
}

/**
 * Minimal toast list renderer — reads from the UI store and renders
 * a small floating panel. Each toast auto-dismisses after 4 seconds.
 */
function ToastList() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  useEffect(() => {
    if (toasts.length === 0) return;
    const timeouts = toasts.map((t) =>
      window.setTimeout(() => dismiss(t.id), 4000),
    );
    return () => {
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, [toasts, dismiss]);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-list" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.level}`} data-testid={`toast-${t.level}`}>
          {t.message}
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Subdued color hint for each item type on the minimap. Frames are
 * drawn with a slightly cooler hue so they're visually distinct from
 * media items; rectangles and images share a neutral blue-grey.
 */
function kindColor(type: string): number {
  switch (type) {
    case 'frame':
      return 0x8aa6c6;
    case 'image':
      return 0x9aa0ac;
    case 'annotation-stroke':
      return 0xc6a08a;
    case 'connector':
      return 0x8a9ac6;
    case 'rectangle':
    default:
      return 0x6b7280;
  }
}

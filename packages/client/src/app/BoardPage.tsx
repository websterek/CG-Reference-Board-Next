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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ModeTabs } from '../ui/ModeTabs';
import { ToolsToolbar, type ToolToolbarAction } from '../ui/ToolsToolbar';
import { UserPanel } from '../ui/UserPanel';
import { MinimapPanel } from '../ui/MinimapPanel';
import type { MinimapItem } from '../ui/MinimapPanel';
import { CanvasController, type MinimapSnapshot } from '../canvas/controller';
import { YjsBoardAdapter, type RemoteUpdate } from '../collab/YjsBoardAdapter';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useUIStore } from '../state/uiStore';
import type { BoardItem } from '@gridboard/domain';
import { asItemId } from '@gridboard/domain';

export function BoardPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? '';
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const adapterRef = useRef<YjsBoardAdapter | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const [connected, setConnected] = useState(false);
  const [role, setRole] = useState<string>('unknown');
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [minimap, setMinimap] = useState<MinimapSnapshot | null>(null);

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
    });
    controllerRef.current = controller;

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

    // Subscribe to minimap snapshots. The controller pushes after
    // every item/camera change.
    const unsubscribe = controller.onRender(setMinimap);

    return () => {
      unsubscribe();
      provider.destroy();
      controller.destroy();
      providerRef.current = null;
      adapterRef.current = null;
      controllerRef.current = null;
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

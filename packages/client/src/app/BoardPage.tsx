/**
 * BoardPage — mounts the CanvasController, opens the Hocuspocus connection.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Toolbar } from '../ui/Toolbar';
import { CanvasController } from '../canvas/controller';
import { YjsBoardAdapter, type RemoteUpdate } from '../collab/YjsBoardAdapter';
import { HocuspocusProvider } from '@hocuspocus/provider';
import type { BoardItem, ItemId } from '@gridboard/domain';
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

    // Decode role from token (UI only — server still validates).
    try {
      const segments = token.split('.');
      const payload = segments[1];
      if (!payload) throw new Error('no payload');
      const decoded = JSON.parse(atob(payload)) as { role?: string };
      setRole(decoded.role ?? 'unknown');
    } catch {
      setRole('anon');
    }

    return () => {
      provider.destroy();
      controller.destroy();
      providerRef.current = null;
      adapterRef.current = null;
      controllerRef.current = null;
    };
  }, [id]);

  return (
    <div className="board-page">
      <Toolbar
        onAction={(action) => controllerRef.current?.applyToolbarAction(action)}
        connected={connected}
        role={role}
      />
      <div ref={containerRef} className="board-page__canvas" data-testid="canvas" />
    </div>
  );
}

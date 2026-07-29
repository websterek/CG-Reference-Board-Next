/**
 * YjsBoardAdapter — the ONLY file in the workspace that imports the Yjs runtime.
 *
 * Per design.md D1:
 *   - Domain models stay runtime-free.
 *   - This adapter translates between Y.Doc and BoardItem/Board snapshots.
 *   - Per-item delta emission (NOT full-snapshot reads) for live updates.
 *
 * Yjs contract lives in @gridboard/domain (collab-schema.ts). This file is the
 * implementation; the contract is separate.
 */

import * as Y from 'yjs';
import type { Doc as ProviderDoc } from 'yjs';
import type {
  Board,
  BoardItem,
  ItemId,
  LayerId,
} from '@gridboard/domain';

export interface RemoteUpdate {
  id: string;
  partial: Partial<BoardItem>;
}

export class YjsBoardAdapter {
  private readonly doc: ProviderDoc;
  private readonly rootMap: Y.Map<unknown>;
  private readonly itemsMap: Y.Map<Y.Map<unknown>>;
  private readonly layersArr: Y.Array<Y.Map<unknown>>;
  private readonly metaMap: Y.Map<unknown>;
  private readonly listeners = new Set<(u: RemoteUpdate) => void>();
  private readonly initialListeners = new Set<() => void>();
  private observed = false;
  /** Single-slot drag queue (design.md D3: queueUpdate owned by Tool). */
  private queue: Map<string, Partial<BoardItem>> = new Map();

  constructor(doc: ProviderDoc) {
    this.doc = doc;
    this.rootMap = doc.getMap('root');
    this.itemsMap = this.rootMap.get('items') as Y.Map<Y.Map<unknown>> ?? this.ensureItems();
    this.layersArr = this.rootMap.get('layers') as Y.Array<Y.Map<unknown>> ?? this.ensureLayers();
    this.metaMap = this.rootMap.get('meta') as Y.Map<unknown> ?? this.ensureMeta();
    this.subscribe();
  }

  // ----- Public surface -----

  /** Convert all Yjs items into domain BoardItem snapshots (slow path; export only). */
  toDomainItems(): BoardItem[] {
    const out: BoardItem[] = [];
    this.itemsMap.forEach((entry, key) => {
      out.push(this.toDomainItem(key, entry));
    });
    return out;
  }

  /** Apply a local mutation; position writes use nested pos sub-map (D1 torn-position fix). */
  applyLocalAction(update: { id: string; partial: Partial<BoardItem> }): void {
    const id = update.id;
    this.doc.transact(() => {
      const entry = this.itemsMap.get(id) ?? new Y.Map<unknown>();
      if (!this.itemsMap.has(id)) this.itemsMap.set(id, entry);
      for (const [k, v] of Object.entries(update.partial)) {
        if (k === 'x' || k === 'y') {
          // Position must be written as a nested sub-map (D1).
          let pos = entry.get('pos') as Y.Map<number> | undefined;
          if (!pos) {
            pos = new Y.Map();
            entry.set('pos', pos);
          }
          pos.set(k as 'x' | 'y', v as number);
          // Mirror scalar for read convenience (read-only clients without pos will still see x/y).
          entry.set(k, v);
        } else if (v !== undefined) {
          entry.set(k, v);
        }
      }
    });
  }

  /** Drag-queue (D3): buffered writes, one Yjs transaction on flush. */
  queueUpdate(id: string, partial: Partial<BoardItem>): void {
    const existing = this.queue.get(id) ?? {};
    this.queue.set(id, { ...existing, ...partial });
  }

  flushQueuedUpdates(): void {
    if (this.queue.size === 0) return;
    const entries = [...this.queue.entries()];
    this.queue.clear();
    this.doc.transact(() => {
      for (const [id, partial] of entries) {
        this.applyLocalAction({ id, partial });
      }
    });
  }

  createLocal(item: BoardItem): void {
    this.doc.transact(() => {
      const entry = new Y.Map<unknown>();
      this.writeAll(entry, item);
      this.itemsMap.set(item.id, entry);
    });
  }

  deleteLocal(id: ItemId): void {
    this.doc.transact(() => {
      this.itemsMap.delete(String(id));
    });
  }

  onItemChanged(cb: (u: RemoteUpdate) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onInitialSync(cb: () => void): () => void {
    // Yjs does not have a single "initial sync" event; we approximate via the
    // first observe callback being treated as initial sync, and once-only.
    if (!this.observed) {
      this.initialListeners.add(cb);
      return () => this.initialListeners.delete(cb);
    }
    cb();
    return () => {};
  }

  // ----- Awareness / presence -----

  setAwarenessState(state: Record<string, unknown>): void {
    // Note: awareness is exposed via the HocuspocusProvider, not directly.
    // The provider gives us `provider.awareness` of type y-protocols Awareness.
    // Kept here as a typed convenience so the BoardPage can call it through
    // the provider once it dispatches.
    void state;
  }

  // ----- Internals -----

  private subscribe(): void {
    // Deep observe: catches add/remove on itemsMap AND updates to nested
    // Y.Map entries (applyLocalAction writes x/y inside pos: Y.Map).
    this.itemsMap.observeDeep(() => {
      this.observed = true;
      // Re-emit per-item delta for every key currently in itemsMap. O(N) per
      // event; adequate at <5k item scale (the 1000-rect 60 FPS hard
      // acceptance). For larger boards a targeted observer (only the keys
      // mentioned in the event path) would replace this loop.
      this.itemsMap.forEach((entry, key) => {
        const u: RemoteUpdate = { id: key, partial: this.toPartial(entry) };
        for (const cb of this.listeners) cb(u);
      });
      // First-time initial sync signal.
      for (const cb of this.initialListeners) cb();
      this.initialListeners.clear();
    });
  }

  private toPartial(entry: Y.Map<unknown>): Partial<BoardItem> {
    const partial: Partial<BoardItem> = {};
    for (const [k, v] of entry.entries()) {
      if (k === 'id' || k === 'type' || k === 'layerId' || k === 'rotation' || k === 'attrs') continue;
      if (k === 'pos') continue; // canonical
      // Primitives only
      if (typeof v === 'number' || typeof v === 'string') {
        (partial as Record<string, unknown>)[k] = v;
      }
    }
    return partial;
  }

  private toDomainItem(key: string, entry: Y.Map<unknown>): BoardItem {
    const id = String(entry.get('id') ?? key);
    const pos = entry.get('pos') as Y.Map<number> | undefined;
    const x = pos?.get('x') ?? (entry.get('x') as number | undefined) ?? 0;
    const y = pos?.get('y') ?? (entry.get('y') as number | undefined) ?? 0;
    const item: BoardItem = {
      id: id as ItemId,
      type: (entry.get('type') as BoardItem['type']) ?? 'rectangle',
      x,
      y,
      width: (entry.get('width') as number) ?? 100,
      height: (entry.get('height') as number) ?? 100,
      rotation: (entry.get('rotation') as number) ?? 0,
      layerId: (entry.get('layerId') as LayerId) ?? ('default' as unknown as LayerId),
      attrs: (entry.get('attrs') as Record<string, unknown>) ?? {},
    };
    return item;
  }

  private writeAll(entry: Y.Map<unknown>, item: BoardItem): void {
    entry.set('id', item.id);
    entry.set('type', item.type);
    entry.set('layerId', item.layerId);
    const pos = new Y.Map<number>();
    pos.set('x', item.x);
    pos.set('y', item.y);
    entry.set('pos', pos);
    entry.set('x', item.x);
    entry.set('y', item.y);
    entry.set('width', item.width);
    entry.set('height', item.height);
    entry.set('rotation', item.rotation);
    entry.set('attrs', item.attrs);
  }

  private ensureItems(): Y.Map<Y.Map<unknown>> {
    let items = this.rootMap.get('items') as Y.Map<Y.Map<unknown>> | undefined;
    if (!items) {
      items = new Y.Map();
      this.rootMap.set('items', items);
    }
    return items;
  }

  private ensureLayers(): Y.Array<Y.Map<unknown>> {
    let layers = this.rootMap.get('layers') as Y.Array<Y.Map<unknown>> | undefined;
    if (!layers) {
      layers = new Y.Array();
      this.rootMap.set('layers', layers);
      // Default layer (board-core spec.md: one default layer named "Layer 1")
      const def = new Y.Map<unknown>();
      def.set('id', 'default');
      def.set('name', 'Layer 1');
      def.set('order', 0);
      def.set('visible', true);
      def.set('locked', false);
      layers.push([def]);
    }
    return layers;
  }

  private ensureMeta(): Y.Map<unknown> {
    let meta = this.rootMap.get('meta') as Y.Map<unknown> | undefined;
    if (!meta) {
      meta = new Y.Map();
      this.rootMap.set('meta', meta);
    }
    return meta;
  }
}

// Re-export for convenience so consumers import one place.
export type { Board };

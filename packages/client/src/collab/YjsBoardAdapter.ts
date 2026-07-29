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
  LayerKind,
} from '@gridboard/domain';
import {
  layerKindFor,
  defaultLayerIdFor,
  GridService,
  DEFAULT_LAYERS,
  DEFAULT_GRID_CONFIG,
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
    this.ensureFixedLayers();
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
      const isNew = !this.itemsMap.has(id);
      const entry = this.itemsMap.get(id) ?? new Y.Map<unknown>();
      if (isNew) this.itemsMap.set(id, entry);
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
        } else if (k === 'layerId' && isNew) {
          // On create, force layerId from the item type (D3 auto-routing).
          // The caller-supplied value is ignored; we compute from `type`.
          // (We'll set it after the loop once `type` is known.)
        } else if (v !== undefined) {
          entry.set(k, v);
        }
      }
      // After writing all fields, force layerId from type for new items.
      if (isNew) {
        const type = (entry.get('type') as string | undefined) ?? 'rectangle';
        const kind = layerKindFor(type as BoardItem['type']);
        entry.set('layerId', defaultLayerIdFor(kind));
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
      // Force layerId from the item type (D3 auto-routing).
      const kind = layerKindFor(item.type);
      const routedItem = { ...item, layerId: defaultLayerIdFor(kind) };
      this.writeAll(entry, routedItem);
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
        const raw: RemoteUpdate = { id: key, partial: this.toPartial(entry) };
        const validated = this.validateAndCorrectRemote(raw);
        if (validated === null) return; // drop — no valid placement
        for (const cb of this.listeners) cb(validated);
        // If corrected, queue a follow-up local write so other peers converge.
        if (validated !== raw) {
          setTimeout(() => {
            this.applyLocalAction(validated);
          }, 0);
        }
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

  /**
   * Bootstrap four fixed layers (D3). Runs on every constructor call.
   *
   * - Fresh board (0 layers): seed the four DEFAULT_LAYERS in z-order.
   * - Legacy board (1 layer with id='default', name='Layer 1'): seed the four
   *   fixed layers, reassign all items to 'media', remove the legacy layer.
   * - Already migrated (4+ layers with fixed ids): no-op.
   */
  private ensureFixedLayers(): void {
    const current = this.layersArr.toArray();
    const isLegacy =
      current.length === 1 &&
      current[0]?.get('id') === 'default' &&
      current[0]?.get('name') === 'Layer 1';
    const isFresh = current.length === 0;

    if (!isLegacy && !isFresh) return;

    this.doc.transact(() => {
      // Insert the four fixed layers in z-order.
      for (const meta of DEFAULT_LAYERS) {
        const entry = new Y.Map<unknown>();
        entry.set('id', meta.id);
        entry.set('name', meta.name);
        entry.set('order', meta.order);
        entry.set('visible', true);
        entry.set('locked', false);
        entry.set('kind', meta.kind);
        this.layersArr.push([entry]);
      }

      // Legacy migration: reassign all items to 'media'.
      if (isLegacy) {
        this.itemsMap.forEach((entry) => {
          entry.set('layerId', 'media');
        });

        // Remove the legacy 'default' layer (it's at index 0 before the four new ones).
        this.layersArr.delete(0, 1);
      }
    });
  }

  /**
   * Validate a remote update against the same-layer non-overlap invariant.
   *
   * Reads the current item state from the Yjs doc, computes the implied full
   * item after applying the update, and runs `canPlace` against all other items
   * of the same layer kind.
   *
   * @returns The update unchanged if valid; a corrected update with a free-cell
   *          position if one is found; or `null` if no free cell exists (the
   *          update is dropped — a future write from the originator's
   *          lastValidBounds will be applied).
   */
  validateAndCorrectRemote(update: RemoteUpdate): RemoteUpdate | null {
    const entry = this.itemsMap.get(update.id);
    if (!entry) return update; // item doesn't exist yet — allow creation

    const item = this.toDomainItem(update.id, entry);
    const kind = layerKindFor(item.type);

    // Compute the implied rect after applying the update.
    const proposed = {
      x: (update.partial.x as number | undefined) ?? item.x,
      y: (update.partial.y as number | undefined) ?? item.y,
      width: (update.partial.width as number | undefined) ?? item.width,
      height: (update.partial.height as number | undefined) ?? item.height,
    };

    // Build the set of other items (same kind) to check against.
    const others: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layerKind: LayerKind;
    }> = [];
    this.itemsMap.forEach((otherEntry, otherKey) => {
      if (otherKey === update.id) return;
      const other = this.toDomainItem(otherKey, otherEntry);
      const otherKind = layerKindFor(other.type);
      others.push({
        id: other.id,
        x: other.x,
        y: other.y,
        width: other.width,
        height: other.height,
        layerKind: otherKind,
      });
    });

    if (GridService.canPlace(proposed, others, kind, update.id)) {
      return update;
    }

    // Overlap detected — try to find a free cell.
    const candidates = GridService.findFreeCells(proposed, others, kind, update.id, {
      cellSize: DEFAULT_GRID_CONFIG.cellSize,
      radius: 8,
    });

    if (candidates.length === 0) return null;

    const corrected = candidates[0]!;
    return {
      id: update.id,
      partial: {
        ...update.partial,
        x: corrected.x,
        y: corrected.y,
        width: corrected.width,
        height: corrected.height,
      },
    };
  }
}

// Re-export for convenience so consumers import one place.
export type { Board };

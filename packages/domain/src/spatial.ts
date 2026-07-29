/**
 * SpatialIndex — RBush wrapper keyed by item ID.
 * Operates on board-coordinate bounding boxes, not Pixi-specific.
 *
 * Design: AGENTS.md mandates RBush for spatial indexing. The domain exposes
 * a narrow wrapper so CanvasController and tools can perform hit-test and
 * viewport queries without knowing about Pixi.
 */

import RBush from 'rbush';
import type { BoardItem, ItemId, LayerKind, Rect } from './board';

interface IndexedItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: ItemId;
  layerKind: LayerKind;
}

class IndexedItemRBush extends RBush<IndexedItem> {
  // rbush types treat items as `any` for inserts; this is the canonical library usage.
}

export class SpatialIndex {
  private readonly tree = new IndexedItemRBush();
  private readonly byId = new Map<ItemId, IndexedItem>();

  insert(item: BoardItem, layerKind: LayerKind): void {
    this.remove(item.id); // idempotent
    const idx: IndexedItem = {
      minX: item.x,
      minY: item.y,
      maxX: item.x + item.width,
      maxY: item.y + item.height,
      id: item.id,
      layerKind,
    };
    this.tree.insert(idx);
    this.byId.set(item.id, idx);
  }

  remove(id: ItemId): void {
    const existing = this.byId.get(id);
    if (existing) {
      this.tree.remove(existing);
      this.byId.delete(id);
    }
  }

  update(item: BoardItem, layerKind: LayerKind): void {
    this.insert(item, layerKind); // remove+insert is the canonical RBush pattern
  }

  /** Return items whose bounding box intersects `bounds` (board coords). */
  search(bounds: Rect): BoardItem['id'][] {
    return this.tree
      .search({
        minX: bounds.x,
        minY: bounds.y,
        maxX: bounds.x + bounds.width,
        maxY: bounds.y + bounds.height,
      })
      .map((entry) => entry.id);
  }

  /** Convenience: 1×1 box query at a point. */
  searchPoint(point: { x: number; y: number }, pad = 0.5): ItemId[] {
    return this.search({
      x: point.x - pad,
      y: point.y - pad,
      width: pad * 2,
      height: pad * 2,
    });
  }

  /** Items whose bbox is fully inside the viewport (useful for render list). */
  searchViewport(viewport: Rect): ItemId[] {
    return this.tree
      .search({
        minX: viewport.x,
        minY: viewport.y,
        maxX: viewport.x + viewport.width,
        maxY: viewport.y + viewport.height,
      })
      .map((entry) => entry.id);
  }

  /**
   * Find items of a specific layer kind that overlap the given rect.
   * Returns the full IndexedItem entries (with id and layerKind) so callers
   * can use the result for both overlap checks and further processing.
   */
  findOverlapping(
    rect: Rect,
    kind: LayerKind,
    excludeId?: ItemId,
  ): IndexedItem[] {
    return this.tree
      .search({
        minX: rect.x,
        minY: rect.y,
        maxX: rect.x + rect.width,
        maxY: rect.y + rect.height,
      })
      .filter((entry) => entry.layerKind === kind && entry.id !== excludeId);
  }

  clear(): void {
    this.tree.clear();
    this.byId.clear();
  }

  size(): number {
    return this.byId.size;
  }
}

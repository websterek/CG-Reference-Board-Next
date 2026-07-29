/**
 * ItemTypeDefinition — per-type contract.
 *
 * Adding a new item type is a MULTI-FILE change spanning the three packages:
 *   - packages/domain: add an ItemTypeDefinition entry to ITEM_TYPES
 *   - packages/client: add a renderer + tool (or extend an existing tool)
 *   - packages/server: only if the type crosses the network boundary
 *     (e.g., image asset storage)
 *
 * The "single registration point" contract is in this file; the per-type
 * implementation lives in the items/ subdirectory and corresponding client
 * packages. See board-core spec.md "Adding a new item type".
 */

import type { z } from 'zod';
import type { BoardItem, ItemType, Point, Rect } from '../board';

export interface ItemTypeDefinition<Attrs = unknown> {
  readonly type: ItemType;
  readonly schema: z.ZodType<Attrs>;
  readonly defaultAttrs: Attrs;
  readonly defaultSize: { width: number; height: number };
  getBounds(item: BoardItem): Rect;
  hitTest(item: BoardItem, point: Point): boolean;
}

/**
 * Image item — width/height on the domain item map to naturalWidth/naturalHeight
 * via display/natural ratio; the storage reference is an `assetId` (no embedded URL).
 */

import { z } from 'zod';
import type { BoardItem, ItemType, Point, Rect } from '../board';
import type { ItemTypeDefinition } from './index';

export type ImageStatus = 'loading' | 'ready' | 'error';

export interface ImageAttrs {
  readonly assetId: string;
  readonly mimeType: string;
  readonly status: ImageStatus;
}

export const ImageAttrsSchema = z.object({
  assetId: z.string().min(1),
  mimeType: z.string().min(1),
  status: z.enum(['loading', 'ready', 'error']),
});

export function isImageItem(item: BoardItem): item is BoardItem & { attrs: ImageAttrs } {
  return item.type === 'image' && ImageAttrsSchema.safeParse(item.attrs).success;
}

export const DEFAULT_IMAGE_SIZE = { width: 200, height: 200 };

/**
 * ImageItem definition. Renderer lives in packages/client (the domain never
 * touches PixiJS). Display bounds = the item's x/y/width/height; naturalSize
 * is preserved as `attrs` for ratio calculations.
 */
export const ImageItemDefinition: ItemTypeDefinition<ImageAttrs> = {
  type: 'image' as ItemType,
  layerKind: 'media' as const,
  schema: ImageAttrsSchema,
  defaultAttrs: { assetId: '', mimeType: 'image/png', status: 'loading' },
  defaultSize: DEFAULT_IMAGE_SIZE,
  getBounds(item): Rect {
    return { x: item.x, y: item.y, width: item.width, height: item.height };
  },
  hitTest(item: BoardItem, point: Point): boolean {
    return (
      point.x >= item.x &&
      point.x <= item.x + item.width &&
      point.y >= item.y &&
      point.y <= item.y + item.height
    );
  },
};

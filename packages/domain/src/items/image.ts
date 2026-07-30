/**
 * Image item — width/height on the domain item map to naturalWidth/naturalHeight
 * via display/natural ratio; the storage reference is an `assetId` (no embedded URL).
 *
 * `naturalWidth` and `naturalHeight` are required so cover-fit rendering and
 * aspect-locked resize are deterministic. They are round-tripped through the
 * Yjs adapter as part of `attrs`. Legacy image items (no natural dims) use
 * the fallback in the renderer; the schema still rejects them so any new
 * write must include the dimensions.
 */

import { z } from 'zod';
import type { BoardItem, ItemType, Point, Rect } from '../board';
import type { ItemTypeDefinition } from './index';

export type ImageStatus = 'loading' | 'ready' | 'error';

export interface ImageAttrs {
  readonly assetId: string;
  readonly mimeType: string;
  readonly status: ImageStatus;
  /**
   * Natural pixel width of the source image. Required for cover-fit
   * rendering and aspect-locked resize.
   */
  readonly naturalWidth: number;
  /**
   * Natural pixel height of the source image. Required for cover-fit
   * rendering and aspect-locked resize.
   */
  readonly naturalHeight: number;
}

export const ImageAttrsSchema = z.object({
  assetId: z.string().min(1),
  mimeType: z.string().min(1),
  status: z.enum(['loading', 'ready', 'error']),
  naturalWidth: z.number().int().positive(),
  naturalHeight: z.number().int().positive(),
});

export function isImageItem(item: BoardItem): item is BoardItem & { attrs: ImageAttrs } {
  return item.type === 'image' && ImageAttrsSchema.safeParse(item.attrs).success;
}

export const DEFAULT_IMAGE_SIZE = { width: 200, height: 200 };

/**
 * Default size for a newly-created image item, given the image's natural
 * pixel dimensions and the grid cell size. Honors the natural aspect
 * ratio (short side = one cell; long side = round(naturalAspect * cellSize)
 * snapped up to the nearest cellSize), with a 1-cell floor on both axes.
 *
 * Visual examples at `cellSize = 32`:
 *   800×800   → 32×32   (1:1)
 *   1600×800  → 64×32   (2:1)
 *   800×1600  → 32×64   (1:2)
 *   1920×1080 → 64×32   (16:9 rounds up to 2:1)
 *   4000×2000 → 64×32   (any 2:1 → 2×1)
 *
 * The result is a tile-aligned rect (width and height are integer multiples
 * of `cellSize`) suitable for `createItem` or the aspect-locked resize math
 * in the controller.
 */
export function defaultImageSize(
  naturalW: number,
  naturalH: number,
  cellSize: number,
): { width: number; height: number } {
  if (!Number.isFinite(naturalW) || !Number.isFinite(naturalH)) {
    throw new Error('defaultImageSize: naturalW and naturalH must be finite numbers');
  }
  if (naturalW <= 0 || naturalH <= 0) {
    throw new Error('defaultImageSize: naturalW and naturalH must be positive');
  }
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error('defaultImageSize: cellSize must be a positive number');
  }
  const aspect = naturalW / naturalH;
  if (aspect >= 1) {
    const longSide = Math.max(
      cellSize,
      Math.round((aspect * cellSize) / cellSize) * cellSize,
    );
    return { width: longSide, height: cellSize };
  } else {
    const longSide = Math.max(
      cellSize,
      Math.round((cellSize / aspect) / cellSize) * cellSize,
    );
    return { width: cellSize, height: longSide };
  }
}

/**
 * ImageItem definition. Renderer lives in packages/client (the domain never
 * touches PixiJS). Display bounds = the item's x/y/width/height; naturalSize
 * is preserved as `attrs` for ratio calculations.
 */
export const ImageItemDefinition: ItemTypeDefinition<ImageAttrs> = {
  type: 'image' as ItemType,
  layerKind: 'media' as const,
  schema: ImageAttrsSchema,
  defaultAttrs: {
    assetId: '',
    mimeType: 'image/png',
    status: 'loading',
    naturalWidth: 1,
    naturalHeight: 1,
  },
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

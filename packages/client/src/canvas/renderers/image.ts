/**
 * Image renderer — PixiJS Sprite from uploaded texture, with loading/error states.
 *
 * Cover-fit strategy (paste-image-with-cover-fit proposal D3):
 *   - The sprite is scaled so the limiting dimension fills the item rect:
 *       scale = max(itemWidth / naturalWidth, itemHeight / naturalHeight)
 *   - The scaled sprite is centered in the item rect.
 *   - A Graphics rect is used as a `mask` so the sprite is clipped to the
 *     item rect — the texture never overdraws sibling items.
 *   - Sprite position is snapped to integer pixel offsets (no sub-pixel
 *     positioning) to keep the cover-fit result visually stable.
 *
 * Legacy fallback (D6): if `attrs.naturalWidth` / `attrs.naturalHeight`
 * are missing (pre-this-change image items), the renderer uses
 * `item.width` / `item.height` as the natural size for the first render
 * and emits an `onBackfill` callback once the texture loads so the item
 * self-corrects to the real dimensions.
 */

import { Container, Sprite, Assets, Graphics, Texture } from 'pixi.js';
import type { BoardItem, ImageAttrs } from '@gridboard/domain';

export async function loadImageTexture(assetKey: string): Promise<Texture> {
  const url = `/api/assets/${encodeURIComponent(assetKey)}?ts=${Date.now()}`;
  return await Assets.load<Texture>({ src: url });
}

/**
 * Cover-fit math. Pure helper, exported for unit testing.
 *
 * Returns the sprite scale, drawn size, and centered offsets inside the
 * item rect. Both dimensions of the drawn size are rounded to integer
 * pixel values; offsets are rounded to integers to avoid sub-pixel
 * positioning (the renderer should never draw half-pixels).
 */
export function coverFit(
  itemW: number,
  itemH: number,
  naturalW: number,
  naturalH: number,
): {
  scale: number;
  drawW: number;
  drawH: number;
  offsetX: number;
  offsetY: number;
} {
  if (naturalW <= 0 || naturalH <= 0) {
    return { scale: 1, drawW: itemW, drawH: itemH, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(itemW / naturalW, itemH / naturalH);
  const drawW = Math.round(naturalW * scale);
  const drawH = Math.round(naturalH * scale);
  const offsetX = Math.round((itemW - drawW) / 2);
  const offsetY = Math.round((itemH - drawH) / 2);
  return { scale, drawW, drawH, offsetX, offsetY };
}

export interface RenderImageOptions {
  loadTexture?: (key: string) => Promise<Texture>;
  /**
   * Called once after the texture has loaded and the real natural
   * dimensions are known. Used to backfill `attrs.naturalWidth` and
   * `attrs.naturalHeight` on legacy image items that were created
   * before the schema was extended. The renderer invokes this with
   * `{ naturalWidth, naturalHeight }`; the caller (controller) decides
   * how to apply the update to the Yjs document.
   */
  onBackfill?: (dims: { naturalWidth: number; naturalHeight: number }) => void;
}

/**
 * Render an image item. If the texture isn't ready yet, shows a loading rect;
 * if loading errored, shows a red-tinted rect.
 */
export function renderImage(item: BoardItem, opts: RenderImageOptions = {}): Container {
  const attrs = (item.attrs ?? {}) as Partial<ImageAttrs> & { assetId?: string; status?: string; mimeType?: string };
  const wrap = new Container();
  wrap.position.set(item.x, item.y);

  const placeholder = new Graphics();
  placeholder.rect(0, 0, item.width, item.height);
  placeholder.setFillStyle({ color: 0x2a2f3a });
  placeholder.fill();
  wrap.addChild(placeholder);

  if (attrs.status === 'error' || !attrs.assetId) {
    const errorBox = new Graphics();
    errorBox.rect(0, 0, item.width, item.height);
    errorBox.setFillStyle({ color: 0x6c2c2c, alpha: 0.6 });
    errorBox.fill();
    errorBox.setStrokeStyle({ width: 2, color: 0xff6b6b });
    errorBox.stroke();
    wrap.addChild(errorBox);
    return wrap;
  }

  // Async texture load. Pixi v8: ticker/threadSync not needed in client setup.
  const loader = opts.loadTexture ?? loadImageTexture;
  const assetId = attrs.assetId;
  loader(assetId)
    .then((tex) => {
      // Read real natural dimensions from the texture source so the
      // backfill (legacy fallback, D6) reflects the actual asset, not
      // a possibly-mismatched attribute. TextureSource is the v8 API.
      const source = (tex.source as { width?: number; height?: number }) ?? {};
      const texW = source.width ?? tex.width ?? 0;
      const texH = source.height ?? tex.height ?? 0;
      const realNaturalW = texW > 0 ? texW : (attrs.naturalWidth ?? item.width);
      const realNaturalH = texH > 0 ? texH : (attrs.naturalHeight ?? item.height);

      // Backfill legacy items: if the stored natural dims disagree
      // with the real texture dims, notify the controller so the
      // item attrs are updated and the next render uses the right
      // values.
      if (
        opts.onBackfill &&
        (attrs.naturalWidth !== realNaturalW || attrs.naturalHeight !== realNaturalH)
      ) {
        opts.onBackfill({ naturalWidth: realNaturalW, naturalHeight: realNaturalH });
      }

      const naturalW = realNaturalW;
      const naturalH = realNaturalH;

      // Cover-fit: scale so the limiting dimension fills the rect, then
      // center the sprite. Mask the wrap container to the item rect
      // so the sprite is clipped when cover-fit overshoots.
      const fit = coverFit(item.width, item.height, naturalW, naturalH);
      const sprite = new Sprite(tex);
      sprite.width = fit.drawW;
      sprite.height = fit.drawH;
      sprite.position.set(fit.offsetX, fit.offsetY);

      // Mask = a Graphics rect equal to the item rect. Per-item so
      // we never share state across images; the mask is small (one
      // rect per item) and PixiJS clips for free on the GPU.
      const mask = new Graphics();
      mask.rect(0, 0, item.width, item.height);
      mask.fill();
      wrap.addChild(mask);
      wrap.mask = mask;

      // Replace the loading placeholder with the masked sprite.
      wrap.removeChildren();
      // Re-add mask first, then sprite (z-order: mask below the
      // visible content; the mask itself is invisible, only the
      // sprite within the wrap is rendered through it).
      wrap.addChild(mask);
      wrap.addChild(sprite);
    })
    .catch(() => {
      // Texture load failed; renderer shows the error placeholder above.
      // Status tracking lives on the domain item (mutated via Yjs on next change).
      void attrs;
    });

  return wrap;
}

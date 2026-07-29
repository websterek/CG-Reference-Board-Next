/**
 * Image renderer — PixiJS Sprite from uploaded texture, with loading/error states.
 * Used by CanvasController when an item is type='image'.
 */

import { Container, Sprite, Assets, Graphics, Texture } from 'pixi.js';
import type { BoardItem, ImageAttrs } from '@gridboard/domain';

export async function loadImageTexture(assetKey: string): Promise<Texture> {
  const url = `/api/assets/${encodeURIComponent(assetKey)}?ts=${Date.now()}`;
  return await Assets.load<Texture>({ src: url });
}

/**
 * Render an image item. If the texture isn't ready yet, shows a loading rect;
 * if loading errored, shows a red-tinted rect.
 */
export function renderImage(item: BoardItem, opts: {
  loadTexture?: (key: string) => Promise<Texture>;
} = {}): Container {
  const attrs = (item.attrs ?? {}) as unknown as ImageAttrs;
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
  loader(attrs.assetId)
    .then((tex) => {
      const sprite = new Sprite(tex);
      sprite.width = item.width;
      sprite.height = item.height;
      wrap.removeChildren();
      wrap.addChild(sprite);
    })
    .catch(() => {
      // Texture load failed; renderer shows the error placeholder above.
      // Status tracking lives on the domain item (mutated via Yjs on next change).
      void attrs;
    });

  return wrap;
}

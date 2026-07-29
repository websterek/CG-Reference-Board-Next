/**
 * PixiCanvas — React bridge component.
 *
 * The CanvasController is created imperatively in BoardPage; PixiCanvas mounts
 * only as a thin ref bridge so React owns no canvas state.
 */

import { useEffect, useRef } from 'react';
import type { CanvasController } from './controller';

export interface PixiCanvasProps {
  controller: CanvasController;
}

export function PixiCanvas(_props: PixiCanvasProps) {
  // The CanvasController is mounted imperatively from BoardPage. This
  // component exists so its DOM container can be referenced, and so future
  // HMR can hot-swap without unmounting the controller.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Mount-time diagnostics only; no runtime mutation here.
    return () => {
      // Cleanup happens in BoardPage's effect.
    };
  }, []);
  return <div ref={ref} style={{ display: 'none' }} aria-hidden="true" data-pixi-canvas-bridge />;
}

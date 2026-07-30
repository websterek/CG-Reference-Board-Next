/**
 * MinimapPanel — bottom-right floating panel.
 *
 * Renders a 2D preview of all items on the board with a translucent
 * rectangle showing the current viewport. Click anywhere on the
 * minimap to re-center the camera; drag the viewport rect to pan.
 *
 * The panel is "dumb": the parent passes the current camera, the set
 * of item bounds, and a `onNavigate(point)` callback. The minimap
 * never reads canvas state directly.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Point, Rect } from '@gridboard/domain';

export interface MinimapItem {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Optional per-kind color; falls back to a neutral gray. */
  readonly color?: number;
}

export interface MinimapPanelProps {
  items: ReadonlyArray<MinimapItem>;
  camera: { x: number; y: number; zoom: number };
  viewport: { width: number; height: number };
  onNavigate: (boardPoint: Point) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onResetZoom?: () => void;
}

interface MinimapGeometry {
  worldBounds: Rect;
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/**
 * Compute a fitting transform: shrink the world bounds to fit inside
 * the panel rect with a small inset.
 */
function computeGeometry(
  items: ReadonlyArray<MinimapItem>,
  camera: { x: number; y: number; zoom: number },
  viewport: { width: number; height: number },
  panelWidth: number,
  panelHeight: number,
): MinimapGeometry {
  const pad = 8;
  const innerW = Math.max(1, panelWidth - pad * 2);
  const innerH = Math.max(1, panelHeight - pad * 2);

  // Compute world bounds from items. Falls back to the visible
  // viewport if there are no items so the minimap still shows the
  // current view.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.width > maxX) maxX = it.x + it.width;
    if (it.y + it.height > maxY) maxY = it.y + it.height;
  }
  if (!Number.isFinite(minX)) {
    // No items — use the visible viewport in board coords.
    const vpW = viewport.width / camera.zoom;
    const vpH = viewport.height / camera.zoom;
    minX = camera.x - vpW / 2;
    minY = camera.y - vpH / 2;
    maxX = camera.x + vpW / 2;
    maxY = camera.y + vpH / 2;
  }
  // Add padding around items so the viewport rect never sits on the
  // panel edge.
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const worldPadX = worldW * 0.08;
  const worldPadY = worldH * 0.08;
  minX -= worldPadX;
  minY -= worldPadY;
  const paddedW = worldW + worldPadX * 2;
  const paddedH = worldH + worldPadY * 2;

  const scale = Math.min(innerW / paddedW, innerH / paddedH);
  const drawW = paddedW * scale;
  const drawH = paddedH * scale;
  const offsetX = pad + (innerW - drawW) / 2;
  const offsetY = pad + (innerH - drawH) / 2;

  return {
    worldBounds: { x: minX, y: minY, width: paddedW, height: paddedH },
    scale,
    offsetX,
    offsetY,
    width: panelWidth,
    height: panelHeight,
  };
}

const NEUTRAL_COLOR = '#3a3f4a';

function rgbaFromHex(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function MinimapPanel({
  items,
  camera,
  viewport,
  onNavigate,
  onZoomIn,
  onZoomOut,
  onFit,
  onResetZoom,
}: MinimapPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const geometryRef = useRef<MinimapGeometry | null>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 180, h: 120 });

  // Re-render the minimap whenever items, camera, or panel size change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    sizeRef.current = { w: cssW, h: cssH };
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const geom = computeGeometry(items, camera, viewport, cssW, cssH);
    geometryRef.current = geom;

    // Subtle background grid for the panel.
    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    ctx.fillRect(0, 0, cssW, cssH);

    // Items
    for (const it of items) {
      const x = geom.offsetX + (it.x - geom.worldBounds.x) * geom.scale;
      const y = geom.offsetY + (it.y - geom.worldBounds.y) * geom.scale;
      const w = Math.max(1, it.width * geom.scale);
      const h = Math.max(1, it.height * geom.scale);
      ctx.fillStyle = rgbaFromHex(it.color ?? 0x3a3f4a, 0.85);
      ctx.fillRect(x, y, w, h);
    }

    if (items.length === 0) {
      ctx.fillStyle = NEUTRAL_COLOR;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Empty board', cssW / 2, cssH / 2);
    }

    // Viewport rectangle
    const vpW = viewport.width / camera.zoom;
    const vpH = viewport.height / camera.zoom;
    const vpX = geom.offsetX + (camera.x - vpW / 2 - geom.worldBounds.x) * geom.scale;
    const vpY = geom.offsetY + (camera.y - vpH / 2 - geom.worldBounds.y) * geom.scale;
    const vw = vpW * geom.scale;
    const vh = vpH * geom.scale;

    ctx.strokeStyle = 'rgba(91, 141, 239, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(91, 141, 239, 0.12)';
    ctx.fillRect(vpX, vpY, vw, vh);
    ctx.strokeRect(vpX + 0.5, vpY + 0.5, vw, vh);
  }, [items, camera.x, camera.y, camera.zoom, viewport.width, viewport.height]);

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      const geom = geometryRef.current;
      const container = containerRef.current;
      if (!geom || !container) return;
      const rect = container.getBoundingClientRect();
      const localX = clientX - rect.left - geom.offsetX;
      const localY = clientY - rect.top - geom.offsetY;
      const boardX = geom.worldBounds.x + localX / geom.scale;
      const boardY = geom.worldBounds.y + localY / geom.scale;
      onNavigate({ x: boardX, y: boardY });
    },
    [onNavigate],
  );

  // Single pointerdown handler. `onClick` is intentionally omitted:
  // React bubbles `pointerdown` then `click`; registering both causes
  // every click to navigate twice. The mouse-button guard prevents
  // right-click / middle-click from triggering navigation, and the
  // pointer-capture guard prevents a stray second pointerdown during
  // an active drag from re-emitting the initial navigate.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      handlePointer(e.clientX, e.clientY);
    },
    [handlePointer],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      handlePointer(e.clientX, e.clientY);
    },
    [handlePointer],
  );

  const zoomPct = useMemo(() => Math.round(camera.zoom * 100), [camera.zoom]);

  return (
    <aside
      className="panel minimap-panel"
      role="region"
      aria-label="Minimap and navigation"
      data-testid="minimap-panel"
    >
      <div
        className="minimap-panel__viewport"
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        role="application"
        aria-label="Board minimap — click to navigate"
      >
        <canvas
          ref={canvasRef}
          className="minimap-panel__canvas"
          aria-hidden="true"
        />
      </div>
      <div className="minimap-panel__nav">
        <span />
        <div
          className="minimap-panel__zoom"
          role="group"
          aria-label="Zoom"
        >
          <button
            type="button"
            className="minimap-panel__zoom-btn"
            onClick={onZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="minimap-panel__zoom-readout"
            onClick={onResetZoom}
            aria-label={`Zoom ${zoomPct} percent — click to reset`}
            title="Click to reset zoom"
          >
            {zoomPct}%
          </button>
          <button
            type="button"
            className="minimap-panel__zoom-btn"
            onClick={onZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="minimap-panel__fit"
          onClick={onFit}
          aria-label="Fit board to screen"
          title="Fit to screen"
        >
          Fit
        </button>
        <span />
      </div>
    </aside>
  );
}

/**
 * ContextMenu — floating right-click menu for the board canvas.
 *
 * Per paste-image-with-cover-fit proposal D7:
 *   - Renders at the given `anchor` in screen coordinates.
 *   - Flips to stay inside the viewport if the natural position
 *     would overflow the right / bottom edge.
 *   - Closes on outside click, Escape, scroll, or selecting a menu
 *     entry.
 *   - Supports action / submenu / divider / info kinds.
 *
 * The menu is a positioned <div> overlay; the canvas is below it.
 * Hover and keyboard focus are handled by native <button>/<details>
 * elements for accessibility.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContextMenuItem, ContextMenuState } from '../canvas/controller';

export interface ContextMenuProps {
  /** The current menu state. Null = closed. */
  menu: ContextMenuState | null;
  /** Called whenever the menu should close. */
  onClose: () => void;
}

interface MenuDimensions {
  width: number;
  height: number;
}

const VIEWPORT_MARGIN = 8;
const ESTIMATED_WIDTH = 220;
const ESTIMATED_HEIGHT = 240;

export function ContextMenu({ menu, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<MenuDimensions>({
    width: ESTIMATED_WIDTH,
    height: ESTIMATED_HEIGHT,
  });
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);

  // Measure after mount to compute the flipped anchor.
  useEffect(() => {
    if (!menu || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    setDims({ width: rect.width, height: rect.height });
  }, [menu]);

  // Close on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, onClose]);

  // Close on outside click.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use mousedown so the close happens before any other click handler
    // that might re-open the menu.
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [menu, onClose]);

  // Close on scroll.
  useEffect(() => {
    if (!menu) return;
    const onScroll = () => onClose();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [menu, onClose]);

  const anchor = useMemo(() => {
    if (!menu) return null;
    // Flip to stay in the viewport: if the menu would overflow on the
    // right or bottom, anchor to the opposite edge of the cursor.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wouldOverflowRight = menu.anchor.x + dims.width + VIEWPORT_MARGIN > vw;
    const wouldOverflowBottom = menu.anchor.y + dims.height + VIEWPORT_MARGIN > vh;
    return {
      x: wouldOverflowRight
        ? Math.max(VIEWPORT_MARGIN, menu.anchor.x - dims.width)
        : menu.anchor.x,
      y: wouldOverflowBottom
        ? Math.max(VIEWPORT_MARGIN, menu.anchor.y - dims.height)
        : menu.anchor.y,
    };
  }, [menu, dims]);

  if (!menu || !anchor) return null;

  const handleAction = (item: Extract<ContextMenuItem, { kind: 'action' }>) => {
    item.onClick();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label="Board context menu"
      style={{
        position: 'fixed',
        left: `${anchor.x}px`,
        top: `${anchor.y}px`,
        zIndex: 1000,
      }}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="context-menu"
    >
      {menu.items.map((item, idx) => {
        if (item.kind === 'divider') {
          return <div key={idx} className="context-menu__divider" role="separator" />;
        }
        if (item.kind === 'info') {
          return (
            <div key={idx} className="context-menu__info" role="note">
              {item.text}
            </div>
          );
        }
        if (item.kind === 'action') {
          return (
            <button
              key={idx}
              type="button"
              role="menuitem"
              className="context-menu__item"
              onClick={() => handleAction(item)}
              data-testid={`context-menu-item-${item.label}`}
            >
              <span className="context-menu__label">{item.label}</span>
              {item.shortcut && (
                <span className="context-menu__shortcut">{item.shortcut}</span>
              )}
            </button>
          );
        }
        // submenu
        return (
          <div
            key={idx}
            className="context-menu__submenu"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openSubmenu === idx}
            onMouseEnter={() => setOpenSubmenu(idx)}
            onMouseLeave={() => setOpenSubmenu((cur) => (cur === idx ? null : cur))}
            data-testid={`context-menu-submenu-${item.label}`}
          >
            <button
              type="button"
              className="context-menu__item"
              onClick={() => setOpenSubmenu((cur) => (cur === idx ? null : idx))}
            >
              <span className="context-menu__label">{item.label}</span>
              <span className="context-menu__arrow" aria-hidden="true">▸</span>
            </button>
            {openSubmenu === idx && (
              <div className="context-menu__submenu-panel" role="menu">
                {item.items.map((sub, sIdx) => {
                  if (sub.kind === 'action') {
                    return (
                      <button
                        key={sIdx}
                        type="button"
                        role="menuitem"
                        className="context-menu__item"
                        onClick={() => handleAction(sub)}
                        data-testid={`context-menu-item-${item.label}-${sub.label}`}
                      >
                        <span className="context-menu__label">{sub.label}</span>
                      </button>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

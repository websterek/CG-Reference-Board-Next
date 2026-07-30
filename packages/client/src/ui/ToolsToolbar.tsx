/**
 * ToolsToolbar — vertical floating panel of icon-only tool buttons.
 *
 * Anchored to the top-left of the canvas, directly below the
 * `ModeTabs` horizontal panel. Each button is a single 32×32 square
 * with an icon centered inside; a tooltip on hover shows the full
 * name, and the active tool is highlighted with the accent color.
 *
 * Three sections (top → bottom):
 *   1. Universal tools: Select / Move / Hand.
 *   2. Mode-scoped tools: the active mode's `toolIds` minus universal.
 *   3. Delete affordance.
 *
 * Universal tools (Select / Move / Hand) are always visible.
 * Mode-scoped tools change as the user switches modes.
 *
 * Per the brief: "always active one of the tools" — the active tool
 * is highlighted on first render (the uiStore initializes
 * `activeTool` to the active mode's `defaultTool`, which is a
 * guaranteed-non-universal tool in the new default scheme).
 *
 * NOTE: This is the SHIP-TARGET toolbar. A previous duplicate
 * `packages/client/src/ui/Toolbar.tsx` was deleted in the
 * `frontend-modularity-phase1-dead-code` change
 * (see openspec/changes/frontend-modularity-phase1-dead-code/design.md).
 * Do not reintroduce a `Toolbar.tsx` parallel to this file — extend
 * this one instead, or split the tool registry if a new affordance
 * grows beyond the current vertical icon panel.
 */

import {
  getAllTools,
  getToolsForMode,
  type ToolDefinition,
} from '../canvas/tools';
import { useUIStore } from '../state/uiStore';

export type ToolToolbarAction =
  | { type: 'set-tool'; tool: string }
  | { type: 'delete-selected' };

export interface ToolsToolbarProps {
  onAction: (action: ToolToolbarAction) => void;
}

/**
 * Inline SVG icon set for the default tools. Each icon is a 16×16
 * single-color glyph (uses `currentColor`) so the highlight color
 * controls the icon hue.
 *
 * Unknown tool IDs fall through to a generic dot.
 */
function ToolGlyph({ tool }: { tool: string }) {
  const stroke = 'currentColor';
  switch (tool) {
    case 'select':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill={stroke} stroke="none" aria-hidden="true">
          <path d="M5 3l14 9-6 1.5L10 21z" />
        </svg>
      );
    case 'move':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="5 9 2 12 5 15" />
          <polyline points="9 5 12 2 15 5" />
          <polyline points="15 19 12 22 9 19" />
          <polyline points="19 9 22 12 19 15" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="12" y1="2" x2="12" y2="22" />
        </svg>
      );
    case 'hand':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 11V6a2 2 0 0 0-4 0v5" />
          <path d="M14 10V4a2 2 0 0 0-4 0v6" />
          <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
          <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      );
    case 'rectangle':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="1" />
        </svg>
      );
    case 'frame':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="3 2" />
        </svg>
      );
    case 'image':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case 'text':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 5h14" />
          <path d="M12 5v14" />
        </svg>
      );
    case 'freehand':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 21c2-2 3-4 5-6s4-2 6-1 4 3 7 2" />
          <path d="M3 17c2-1 3-2 4-3" />
        </svg>
      );
    case 'arrow':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="20" x2="18" y2="6" />
          <polyline points="10 6 18 6 18 14" />
        </svg>
      );
    case 'eraser':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 20H7L3 16l9-9 8 8-4 4" />
          <line x1="13" y1="6" x2="18" y2="11" />
        </svg>
      );
    case 'connector':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="5" cy="6" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M7 7l10 10" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill={stroke} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: ToolDefinition;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tools-toolbar__btn${active ? ' tools-toolbar__btn--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${tool.displayName} tool`}
      title={`${tool.displayName}${active ? ' (active)' : ''}`}
    >
      <span className="tools-toolbar__icon" aria-hidden="true">
        <ToolGlyph tool={tool.id} />
      </span>
    </button>
  );
}

export function ToolsToolbar({ onAction }: ToolsToolbarProps) {
  const { activeTool, setActiveTool, interactionMode } = useUIStore();

  const allTools = getAllTools();
  const universalTools = allTools.filter((t) => t.alwaysAvailable);
  const modeScopedTools = getToolsForMode(interactionMode);
  const modeTools = modeScopedTools.filter((t) => !t.alwaysAvailable);

  return (
    <aside
      className="panel tools-toolbar"
      role="region"
      aria-label="Tools"
      data-testid="tools-toolbar"
    >
      {/* Universal tools */}
      <div className="tools-toolbar__group" role="toolbar" aria-label="Universal tools">
        {universalTools.map((t) => (
          <ToolButton
            key={t.id}
            tool={t}
            active={activeTool === t.id}
            onClick={() => {
              setActiveTool(t.id);
              onAction({ type: 'set-tool', tool: t.id });
            }}
          />
        ))}
      </div>

      <div className="tools-toolbar__divider" aria-hidden="true" />

      {/* Mode-scoped tools */}
      <div className="tools-toolbar__group" role="toolbar" aria-label="Mode tools">
        {modeTools.map((t) => (
          <ToolButton
            key={t.id}
            tool={t}
            active={activeTool === t.id}
            onClick={() => {
              setActiveTool(t.id);
              onAction({ type: 'set-tool', tool: t.id });
            }}
          />
        ))}
      </div>

      <div className="tools-toolbar__divider" aria-hidden="true" />

      {/* Delete affordance */}
      <div className="tools-toolbar__group">
        <button
          type="button"
          className="tools-toolbar__btn"
          onClick={() => onAction({ type: 'delete-selected' })}
          aria-label="Delete selection"
          title="Delete selection"
        >
          <span className="tools-toolbar__icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </span>
        </button>
      </div>
    </aside>
  );
}

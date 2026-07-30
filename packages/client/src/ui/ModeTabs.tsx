/**
 * ModeTabs — slim horizontal panel of mode tabs.
 *
 * Floating panel anchored to the top-left of the canvas, sitting
 * directly above the `ToolsToolbar` vertical panel. The two are
 * visually independent panels (not nested) so the user can read
 * "mode" and "tool" as two separate affordances, matching common
 * creative-tool conventions (Figma, Photoshop, Miro).
 *
 * Each tab is icon-only with the mode display name in the tooltip
 * and a small label below the icon (kept compact for the slim
 * horizontal layout).
 */

import { getAllModes } from '@gridboard/domain';
import { useUIStore } from '../state/uiStore';

export interface ModeTabsProps {
  onModeChange: (modeId: string) => void;
}

/**
 * Compact 14×14 SVG icons per mode. Kept inline so the panel
 * renders without external dependencies.
 */
function ModeIcon({ mode }: { mode: string }) {
  const stroke = 'currentColor';
  if (mode === 'grid') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    );
  }
  if (mode === 'annotation') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    );
  }
  if (mode === 'connector') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="5" cy="6" r="2.5" />
        <circle cx="19" cy="18" r="2.5" />
        <path d="M7 7l10 10" />
      </svg>
    );
  }
  // Generic dot for unknown modes.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function ModeTabs({ onModeChange }: ModeTabsProps) {
  const { interactionMode, setInteractionMode } = useUIStore();
  const modes = getAllModes();

  return (
    <nav
      className="panel mode-tabs"
      role="tablist"
      aria-label="Interaction mode"
      data-testid="mode-tabs"
    >
      {modes.map((m) => {
        const isActive = m.id === interactionMode;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`mode-tabs__tab${isActive ? ' mode-tabs__tab--active' : ''}`}
            onClick={() => {
              if (isActive) return;
              setInteractionMode(m.id);
              onModeChange(m.id);
            }}
            title={m.displayName}
            aria-label={`${m.displayName} mode`}
          >
            <span className="mode-tabs__icon" aria-hidden="true">
              <ModeIcon mode={m.id} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}

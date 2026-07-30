/**
 * Toolbar — UI chrome (universal + mode-scoped tool buttons).
 *
 * Renders two rows:
 *   - Universal row: Select, Move, Hand (always visible).
 *   - Mode-scoped row: tools from `getToolsForMode(interactionMode)`
 *     excluding the universal tools.
 *
 * Per tool-registry-and-modes proposal: mode-conditional tool hiding
 * (the old `{!isGrid && ...}` block) is removed. The toolbar is driven
 * by the `ToolDefinition` registry, not hardcoded JSX.
 */

import {
  getAllModes,
  getModeDef,
} from '@gridboard/domain';
import {
  getAllTools,
  getToolsForMode,
} from '../canvas/tools';
import type { ToolDefinition } from '../canvas/tools';
import { useUIStore } from '../state/uiStore';

// ToolbarAction mirrors the controller's ToolbarAction shape (see
// packages/client/src/canvas/controller.ts). Keep this in sync; both
// sides accept `{type, ...}` records with `string` tool/mode values.
export type ToolbarAction =
  | { type: 'set-tool'; tool: string }
  | { type: 'set-mode'; mode: string }
  | { type: 'delete-selected' };

export interface ToolbarProps {
  onAction: (action: ToolbarAction) => void;
  connected: boolean;
  role: string;
}

export function Toolbar({ onAction, connected, role }: ToolbarProps) {
  const { activeTool, setActiveTool, interactionMode, setInteractionMode } = useUIStore();

  // Universal tools: present in every mode. Driven by the
  // ToolDefinition registry (`alwaysAvailable: true`).
  const allTools: ToolDefinition[] = getAllTools();
  const universalTools = allTools.filter((t) => t.alwaysAvailable);
  const modeTools = getToolsForMode(interactionMode).filter((t) => !t.alwaysAvailable);

  const handleModeToggle = () => {
    const modes = getAllModes();
    const idx = modes.findIndex((m) => m.id === interactionMode);
    const next = idx === -1 ? modes[0]! : modes[(idx + 1) % modes.length]!;
    setInteractionMode(next.id);
    onAction({ type: 'set-mode', mode: next.id });
  };

  const modeLabel = getModeDef(interactionMode).displayName;

  return (
    <header className="toolbar">
      <div className="toolbar__group">
        <button
          className="btn btn--mode"
          onClick={handleModeToggle}
          aria-label="Toggle interaction mode"
          data-mode={interactionMode}
        >
          Mode: {modeLabel}
        </button>

        {/* Universal row — Select, Move, Hand. Always visible. */}
        <div className="toolbar__universal" role="toolbar" aria-label="Universal tools">
          {universalTools.map((t) => (
            <button
              key={t.id}
              className={`btn ${activeTool === t.id ? 'btn--active' : ''}`}
              onClick={() => {
                setActiveTool(t.id);
                onAction({ type: 'set-tool', tool: t.id });
              }}
              aria-pressed={activeTool === t.id}
              aria-label={`${t.displayName} tool`}
              title={t.displayName}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* Mode-scoped row — tools for the current mode, excluding universal. */}
        <div
          className="toolbar__modescoped"
          role="toolbar"
          aria-label={`${modeLabel} tools`}
        >
          {modeTools.map((t) => (
            <button
              key={t.id}
              className={`btn ${activeTool === t.id ? 'btn--active' : ''}`}
              onClick={() => {
                setActiveTool(t.id);
                onAction({ type: 'set-tool', tool: t.id });
              }}
              aria-pressed={activeTool === t.id}
              aria-label={`${t.displayName} tool`}
              title={t.displayName}
            >
              {t.icon}
            </button>
          ))}
        </div>

        <button
          className="btn"
          onClick={() => onAction({ type: 'delete-selected' })}
          aria-label="Delete selection"
        >
          🗑
        </button>
      </div>
      <div className="toolbar__status">
        <span className={connected ? 'status status--ok' : 'status status--off'}>
          {connected ? '● connected' : '○ offline'}
        </span>
        <span className="role">role: {role}</span>
      </div>
    </header>
  );
}


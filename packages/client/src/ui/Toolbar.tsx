/**
 * Toolbar — UI chrome (select / rectangle / delete tools).
 *
 * NEVER imports yjs or @hocuspocus — see ESLint `no-restricted-imports` rule
 * that enforces D1 boundary.
 */

import { useUIStore } from '../state/uiStore';
import type { InteractionMode } from '../state/uiStore';

// ToolbarAction: shared shape with CanvasController. Mirror it locally so the
// UI layer doesn't import from canvas/.
export type ToolbarAction =
  | { type: 'set-tool'; tool: 'select' | 'rectangle' | 'frame' | 'annotation-freehand' }
  | { type: 'set-mode'; mode: InteractionMode }
  | { type: 'delete-selected' };

export interface ToolbarProps {
  onAction: (action: ToolbarAction) => void;
  connected: boolean;
  role: string;
}

export function Toolbar({ onAction, connected, role }: ToolbarProps) {
  const { activeTool, setActiveTool, interactionMode, setInteractionMode } = useUIStore();

  const isGrid = interactionMode === 'grid';

  const handleModeToggle = () => {
    const next: InteractionMode = isGrid ? 'annotation' : 'grid';
    setInteractionMode(next);
    onAction({ type: 'set-mode', mode: next });
  };

  return (
    <header className="toolbar">
      <div className="toolbar__group">
        <button
          className="btn btn--mode"
          onClick={handleModeToggle}
          aria-pressed={!isGrid}
          aria-label="Toggle interaction mode"
        >
          Mode: {isGrid ? 'Grid' : 'Annotation'}
        </button>

        {isGrid && (
          <>
            <button
              className={`btn ${activeTool === 'select' ? 'btn--active' : ''}`}
              onClick={() => {
                setActiveTool('select');
                onAction({ type: 'set-tool', tool: 'select' });
              }}
              aria-pressed={activeTool === 'select'}
              aria-label="Select tool"
            >
              ▦
            </button>
            <button
              className={`btn ${activeTool === 'rectangle' ? 'btn--active' : ''}`}
              onClick={() => {
                setActiveTool('rectangle');
                onAction({ type: 'set-tool', tool: 'rectangle' });
              }}
              aria-pressed={activeTool === 'rectangle'}
              aria-label="Rectangle tool"
            >
              ▭
            </button>
            <button
              className={`btn ${activeTool === 'frame' ? 'btn--active' : ''}`}
              onClick={() => {
                setActiveTool('frame');
                onAction({ type: 'set-tool', tool: 'frame' });
              }}
              aria-pressed={activeTool === 'frame'}
              aria-label="Frame tool"
            >
              ⊞
            </button>
          </>
        )}

        {!isGrid && (
          <button
            className={`btn ${activeTool === 'annotation-freehand' ? 'btn--active' : ''}`}
            onClick={() => {
              setActiveTool('annotation-freehand');
              onAction({ type: 'set-tool', tool: 'annotation-freehand' });
            }}
            aria-pressed={activeTool === 'annotation-freehand'}
            aria-label="Annotation freehand tool"
          >
            ✎
          </button>
        )}

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

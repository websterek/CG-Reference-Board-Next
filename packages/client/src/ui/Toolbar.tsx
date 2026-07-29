/**
 * Toolbar — UI chrome (select / rectangle / delete tools).
 *
 * NEVER imports yjs or @hocuspocus — see ESLint `no-restricted-imports` rule
 * that enforces D1 boundary.
 */

import { useUIStore } from '../state/uiStore';

// ToolbarAction: shared shape with CanvasController. Mirror it locally so the
// UI layer doesn't import from canvas/.
export type ToolbarAction =
  | { type: 'set-tool'; tool: 'select' | 'rectangle' }
  | { type: 'delete-selected' };

export interface ToolbarProps {
  onAction: (action: ToolbarAction) => void;
  connected: boolean;
  role: string;
}

export function Toolbar({ onAction, connected, role }: ToolbarProps) {
  const { activeTool, setActiveTool } = useUIStore();

  return (
    <header className="toolbar">
      <div className="toolbar__group">
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

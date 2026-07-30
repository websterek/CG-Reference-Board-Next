/**
 * UserPanel — top-right floating panel with connection status, user
 * identity, role, and quick actions (settings, share).
 *
 * Pure presentational: takes `connected` and `role` from the parent so
 * the actual auth/connection logic stays in the controller / adapter.
 */

export interface UserPanelProps {
  connected: boolean;
  role: string;
  userName?: string;
  onSettings?: () => void;
  onShare?: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
  admin: 'Admin',
  anon: 'Guest',
  unknown: 'Guest',
};

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function UserPanel({ connected, role, userName, onSettings, onShare }: UserPanelProps) {
  const roleLabel = ROLE_LABEL[role] ?? ROLE_LABEL['unknown']!;
  const display = userName && userName.trim().length > 0 ? userName : 'You';
  const statusLabel = connected ? 'Connected' : 'Offline';

  return (
    <aside
      className="panel user-panel"
      role="region"
      aria-label="User and connection"
      data-testid="user-panel"
    >
      <span
        className={`user-panel__status${connected ? ' user-panel__status--ok' : ''}`}
        aria-label={statusLabel}
        title={statusLabel}
        data-testid="user-panel-status"
      />
      <span className="user-panel__avatar" aria-hidden="true">
        {initialsOf(display)}
      </span>
      <span className="user-panel__name" title={display}>
        {display}
      </span>
      <span className="user-panel__role" title={`Role: ${roleLabel}`}>
        {roleLabel}
      </span>
      <span className="user-panel__sep" aria-hidden="true" />
      <button
        type="button"
        className="user-panel__btn"
        aria-label="Share board"
        title="Share"
        onClick={onShare}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>
      <button
        type="button"
        className="user-panel__btn"
        aria-label="Open settings"
        title="Settings"
        onClick={onSettings}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </aside>
  );
}

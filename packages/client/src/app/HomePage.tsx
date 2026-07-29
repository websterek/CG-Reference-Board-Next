/**
 * Home page — "New Board" button.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function HomePage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNewBoard() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled board' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { id: string };
      // Persist token for later joins (V1: kept in localStorage).
      const token = (data as unknown as { token?: string }).token;
      if (token) localStorage.setItem(`gridboard:token:${data.id}`, token);
      navigate(`/board/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  return (
    <main className="home">
      <header>
        <h1>GridBoard</h1>
        <p className="subtitle">Self-hosted collaborative reference board</p>
      </header>
      <section className="home__cta">
        <button onClick={handleNewBoard} disabled={creating} className="btn btn--primary">
          {creating ? 'Creating…' : 'New Board'}
        </button>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}

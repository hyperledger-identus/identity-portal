import { useCallback, useEffect, useState } from 'react';
import { api } from './utils/api';

/**
 * List widget: shows the prism DIDs stored by the active agent
 * (`GET /api/dids`), which dispatches to the active agent (local edge or
 * cloud). Fetches on mount; the refresh button re-reads the list (e.g. after
 * creating a DID with the Create widget).
 */
export function DidList() {
  const [dids, setDids] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/dids');
      if (error) {
        const message =
          error && typeof error === 'object' && 'error' in error
            ? String((error as { error: unknown }).error)
            : 'Could not load the DIDs.';
        setError(message);
      } else {
        setDids(data?.dids ?? []);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your DIDs</h2>
          <p className="mt-1 text-sm text-slate-700">
            Prism DIDs stored by the active agent.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !loading && dids.length === 0 && (
        <p className="text-sm text-slate-700">
          No DIDs yet. Create one with the Create widget.
        </p>
      )}
      {dids.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dids.map((did) => (
            <li
              key={did}
              className="overflow-auto rounded-md bg-slate-50 p-3 font-mono text-xs text-ink"
            >
              {did}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

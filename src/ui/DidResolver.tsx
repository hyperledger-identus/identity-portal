import { useState } from 'react';
import { api } from './utils/api';

/**
 * Debug widget: resolves a DID to its DID document through the portal API
 * (`GET /api/dids/resolve/:did`), which dispatches to the active agent
 * (local edge or cloud). Shows the raw JSON result.
 */
export function DidResolver() {
  const [did, setDid] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resolve = async () => {
    const value = did.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await api.GET('/dids/resolve/:did', {
        did: value,
      });
      if (error) {
        const message =
          error && typeof error === 'object' && 'error' in error
            ? String((error as { error: unknown }).error)
            : 'Could not resolve the DID.';
        setError(message);
      } else {
        setResult(data);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Resolve DID</h2>
        <p className="mt-1 text-sm text-slate-700">
          Enter a DID and resolve it to its DID document.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={did}
          onChange={(event) => setDid(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') resolve();
          }}
          placeholder="did:prism:..."
          className="flex-1 rounded-md border border-line px-3 py-2 text-sm text-ink"
        />
        <button
          type="button"
          onClick={resolve}
          disabled={loading || did.trim().length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {loading ? 'Resolving…' : 'Resolve'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result != null && (
        <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}

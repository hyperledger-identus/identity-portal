import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './utils/api';

/**
 * Debug widget: resolves a DID to its DID document through the portal API
 * (`GET /api/dids/resolve/:did`), which dispatches to the active agent
 * (local edge or cloud). Shows the raw JSON result.
 *
 * `did` is the DID the owner wants resolved (the resolve page reads it from
 * the address); it is resolved on mount and whenever it changes. `onRequest`
 * receives a newly typed DID so the owner can put it in the address.
 */
export function DidResolver({
  did: requested = '',
  onRequest,
}: {
  did?: string;
  onRequest?: (did: string) => void;
}) {
  const [did, setDid] = useState(requested);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Only the newest request may write its outcome.
  const latest = useRef(0);

  const resolve = useCallback(async (value: string) => {
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await api.GET('/dids/resolve/:did', {
        did: value,
      });
      if (request !== latest.current) return;
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
      if (request === latest.current) setError('Request failed.');
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDid(requested);
    if (requested) {
      resolve(requested);
      return;
    }
    latest.current += 1;
    setResult(null);
    setError(null);
    setLoading(false);
  }, [requested, resolve]);

  const submit = () => {
    const value = did.trim();
    if (!value) return;
    if (onRequest && value !== requested) {
      onRequest(value);
    } else {
      resolve(value);
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
            if (event.key === 'Enter') submit();
          }}
          placeholder="did:prism:..."
          className="flex-1 rounded-md border border-line px-3 py-2 text-sm text-ink"
        />
        <button
          type="button"
          onClick={submit}
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

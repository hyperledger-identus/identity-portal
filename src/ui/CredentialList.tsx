import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppRouter } from '../api/registry';
import { api } from './utils/api';
import type { EndpointAt, OutputOf } from './utils/api/types';

type HolderCredentialRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/credentials'>
>['credentials'][number];

const CREDENTIAL_LIST_PAGE_SIZE = 10;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

/**
 * Dashboard card: lists verifiable credentials already in the holder wallet
 * (`GET /api/credentials`). Distinct from issuer OOB offers.
 */
export function CredentialList({
  refreshToken = 0,
}: {
  refreshToken?: number;
}) {
  const [credentials, setCredentials] = useState<HolderCredentialRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const seenRefreshToken = useRef(refreshToken);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/credentials', {
        offset,
        limit: CREDENTIAL_LIST_PAGE_SIZE,
      });
      if (error) {
        setError(apiErrorMessage(error, 'Could not load the credentials.'));
      } else {
        setCredentials(data?.credentials ?? []);
        if ((data?.credentials ?? []).length === 0 && offset > 0) {
          setOffset((o) => Math.max(0, o - CREDENTIAL_LIST_PAGE_SIZE));
        }
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (seenRefreshToken.current === refreshToken) {
      return;
    }
    seenRefreshToken.current = refreshToken;
    if (offset !== 0) {
      setOffset(0);
    } else {
      load();
    }
  }, [refreshToken, offset, load]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your credentials</h2>
          <p className="mt-1 text-sm text-slate-700">
            Verifiable credentials in the holder wallet. These are issued VCs,
            not issuer offers.
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
      {!error && !loading && credentials.length === 0 && (
        <p className="text-sm text-slate-700">No credentials yet.</p>
      )}
      {credentials.length > 0 && (
        <ul className="flex flex-col gap-3">
          {credentials.map((record) => {
            const expanded = expandedId === record.id;
            return (
              <li
                key={record.id}
                className="flex flex-col gap-3 rounded-md bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {record.format}
                    </p>
                    <p className="mt-1 overflow-auto font-mono text-xs text-ink">
                      Issuer {record.issuer ?? '—'}
                    </p>
                    <p className="overflow-auto font-mono text-xs text-ink">
                      Subject {record.subject ?? '—'}
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-600">
                      {record.issuedAt ?? '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId((current) =>
                          current === record.id ? null : record.id,
                        )
                      }
                      className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-white"
                    >
                      {expanded ? 'Close' : 'Details'}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="flex flex-col gap-3">
                    <p className="overflow-auto font-mono text-xs text-ink">
                      {record.id}
                    </p>
                    <pre className="overflow-auto rounded-md bg-white p-4 text-xs text-ink">
                      {JSON.stringify(record.claims ?? {}, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(credentials.length > 0 || offset > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Previous page"
            onClick={() =>
              setOffset((o) => Math.max(0, o - CREDENTIAL_LIST_PAGE_SIZE))
            }
            disabled={offset === 0 || loading}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          {credentials.length > 0 && (
            <p className="text-sm text-slate-700">
              Showing {offset + 1}–{offset + credentials.length}
            </p>
          )}
          <button
            type="button"
            aria-label="Next page"
            onClick={() => setOffset((o) => o + CREDENTIAL_LIST_PAGE_SIZE)}
            disabled={loading || credentials.length < CREDENTIAL_LIST_PAGE_SIZE}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

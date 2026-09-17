import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppRouter } from '../api/registry';
import { toProtocolStateLabel } from '../utils/agent/types';
import { api } from './utils/api';
import type { EndpointAt, OutputOf } from './utils/api/types';

type OfferRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/offers'>
>['offers'][number];

const PAGE_SIZE = 10;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function truncateMiddle(value: string, head = 22, tail = 10): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

/**
 * Dashboard card: lists issuer credential offers (`GET /api/offers`) with
 * protocol state labels. Expand a row for claims JSON and the full invitation
 * URL. Pagination matches DidList; there is no automatic polling.
 */
export function OfferList({ refreshToken = 0 }: { refreshToken?: number }) {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const seenRefreshToken = useRef(refreshToken);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/offers', {
        offset,
        limit: PAGE_SIZE,
      });
      if (error) {
        setError(apiErrorMessage(error, 'Could not load the offers.'));
      } else {
        setOffers(data?.offers ?? []);
        if ((data?.offers ?? []).length === 0 && offset > 0) {
          setOffset((o) => Math.max(0, o - PAGE_SIZE));
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
          <h2 className="text-lg font-semibold text-ink">Your offers</h2>
          <p className="mt-1 text-sm text-slate-700">
            Issuer credential offers stored by the active agent.
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
      {!error && !loading && offers.length === 0 && (
        <p className="text-sm text-slate-700">No credential offers yet.</p>
      )}
      {offers.length > 0 && (
        <ul className="flex flex-col gap-3">
          {offers.map((record) => {
            const expanded = expandedId === record.recordId;
            const issuing = record.issuingDID ?? '';
            const invitation = record.invitationUrl ?? '';
            return (
              <li
                key={record.recordId}
                className="flex flex-col gap-3 rounded-md bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      {formatCreatedAt(record.createdAt)}
                    </p>
                    {issuing ? (
                      <p
                        className="mt-1 font-mono text-xs text-ink"
                        title={issuing}
                      >
                        {truncateMiddle(issuing)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-600">
                      {toProtocolStateLabel(record.protocolState)}{' '}
                      <span className="font-mono font-normal normal-case tracking-normal text-slate-500">
                        {record.protocolState}
                      </span>
                    </p>
                    {invitation ? (
                      <p
                        className="mt-1 overflow-auto font-mono text-xs text-ink"
                        title={invitation}
                      >
                        {truncateMiddle(invitation, 28, 12)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId((current) =>
                          current === record.recordId ? null : record.recordId,
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
                    <pre className="overflow-auto rounded-md bg-white p-4 text-xs text-ink">
                      {JSON.stringify(record.claims, null, 2)}
                    </pre>
                    {invitation ? (
                      <p className="overflow-auto font-mono text-xs text-ink">
                        {invitation}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-700">
                        No invitation URL on this offer.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {(offers.length > 0 || offset > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          {offers.length > 0 && (
            <p className="text-sm text-slate-700">
              Showing {offset + 1}–{offset + offers.length}
            </p>
          )}
          <button
            type="button"
            aria-label="Next page"
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={loading || offers.length < PAGE_SIZE}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

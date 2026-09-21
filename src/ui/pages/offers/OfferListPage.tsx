import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AppRouter } from '../../../api/registry';
import { toProtocolStateLabel } from '../../../utils/agent/types';
import { api } from '../../utils/api';
import type { EndpointAt, OutputOf } from '../../utils/api/types';

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
 * `/issuer/offers`: the issuer credential offers held by the active agent
 * (`GET /api/offers`), with protocol state labels. Every row links to the
 * offer's own page; creation lives on `/issuer/offers/new`. There is no
 * automatic polling.
 */
export function OfferListPage() {
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

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

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your offers</h2>
          <p className="mt-1 text-sm text-slate-700">
            Issuer credential offers stored by the active agent. Open one for
            its claims and invitation URL.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:shrink-0">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <Link
            to="new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            New offer
          </Link>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !loading && offers.length === 0 && (
        <p className="text-sm text-slate-700">
          No credential offers yet. Create the first one with “New offer”.
        </p>
      )}
      {offers.length > 0 && (
        <ul className="flex flex-col gap-3">
          {offers.map((record) => {
            const issuing = record.issuingDID ?? '';
            const invitation = record.invitationUrl ?? '';
            return (
              <li key={record.recordId}>
                <Link
                  to={encodeURIComponent(record.recordId)}
                  className="flex flex-col gap-1 rounded-md bg-slate-50 p-3 transition hover:bg-slate-100"
                >
                  <span className="text-sm text-ink">
                    {formatCreatedAt(record.createdAt)}
                  </span>
                  {issuing ? (
                    <span className="font-mono text-xs text-ink" title={issuing}>
                      {truncateMiddle(issuing)}
                    </span>
                  ) : null}
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
                    {toProtocolStateLabel(record.protocolState)}{' '}
                    <span className="font-mono font-normal normal-case tracking-normal text-slate-500">
                      {record.protocolState}
                    </span>
                  </span>
                  {invitation ? (
                    <span
                      className="overflow-auto font-mono text-xs text-ink"
                      title={invitation}
                    >
                      {truncateMiddle(invitation, 28, 12)}
                    </span>
                  ) : null}
                </Link>
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

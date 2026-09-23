import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AppRouter } from '../../../api/registry';
import { api } from '../../utils/api';
import type { EndpointAt, OutputOf } from '../../utils/api/types';

type PrismDIDRecord = OutputOf<EndpointAt<AppRouter, 'get', '/dids'>>['dids'][number];

const DID_LIST_PAGE_SIZE = 10;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function statusLabel(status: PrismDIDRecord['status']): string {
  if (status === 'created') return 'Created';
  if (status === 'published') return 'Published';
  return 'Deactivated';
}

const ROW_LINK_CLASS =
  'rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-white';

/**
 * `/dids`: the prism DIDs stored by the active agent (`GET /api/dids`), with
 * publish and deactivate on the row. Creating, updating and resolving live on
 * their own pages: `/dids/new`, `/dids/:did/update` and `/dids/resolve`.
 */
export function DidListPage() {
  const location = useLocation();
  // The create page hands over the DID it just made so the list can name it.
  const created =
    (location.state as { created?: string } | null)?.created ?? null;
  const [dids, setDids] = useState<PrismDIDRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/dids', {
        offset,
        limit: DID_LIST_PAGE_SIZE,
      });
      if (error) {
        setError(apiErrorMessage(error, 'Could not load the DIDs.'));
      } else {
        setDids(data?.dids ?? []);
        if ((data?.dids ?? []).length === 0 && offset > 0) {
          setOffset((o) => Math.max(0, o - DID_LIST_PAGE_SIZE));
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

  const publish = async (did: string) => {
    setBusy(`${did}:publish`);
    setError(null);
    try {
      const { error } = await api.POST('/dids/:did/publish', { did });
      if (error) {
        setError(apiErrorMessage(error, 'Could not publish the DID.'));
      } else {
        await load();
      }
    } catch {
      setError('Request failed.');
    } finally {
      setBusy(null);
    }
  };

  const deactivate = async (did: string) => {
    if (!window.confirm('Deactivate this DID? This cannot be undone.')) {
      return;
    }
    setBusy(`${did}:deactivate`);
    setError(null);
    try {
      const { error } = await api.POST('/dids/:did/deactivate', { did });
      if (error) {
        setError(apiErrorMessage(error, 'Could not deactivate the DID.'));
      } else {
        await load();
        // The cloud registrar's list status tracks publication only, never the
        // lifecycle, so a deactivated DID comes back as `PUBLISHED` forever.
        // Mark the row that was just deactivated so its actions do not
        // reappear; the local agent reports `deactivated` by itself and the
        // mark changes nothing there.
        setDids((prev) =>
          prev.map((record) =>
            record.did === did ? { ...record, status: 'deactivated' } : record,
          ),
        );
      }
    } catch {
      setError('Request failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your DIDs</h2>
          <p className="mt-1 text-sm text-slate-700">
            Prism DIDs stored by the active agent. Publish or deactivate from
            here; updating and resolving open on their own pages.
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
            to="resolve"
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
          >
            Resolve a DID
          </Link>
          <Link
            to="new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            New DID
          </Link>
        </div>
      </div>
      {created && (
        <div className="flex flex-col gap-1 rounded-md border border-line p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
            Created
          </p>
          <p className="overflow-auto font-mono text-xs text-ink">{created}</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !loading && dids.length === 0 && (
        <p className="text-sm text-slate-700">
          No DIDs yet. Create the first one with “New DID”.
        </p>
      )}
      {dids.length > 0 && (
        <ul className="flex flex-col gap-3">
          {dids.map((record) => {
            const isBusy = busy?.startsWith(`${record.did}:`) ?? false;
            const didPath = encodeURIComponent(record.did);
            return (
              <li
                key={record.did}
                className="flex flex-col gap-3 rounded-md bg-slate-50 p-3 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="overflow-auto font-mono text-xs text-ink">
                    {record.did}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-600">
                    {statusLabel(record.status)}
                    {record.transactionId
                      ? ` · tx ${record.transactionId}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`resolve?did=${didPath}`} className={ROW_LINK_CLASS}>
                    Resolve
                  </Link>
                  {record.status === 'created' && (
                    <button
                      type="button"
                      onClick={() => publish(record.did)}
                      disabled={isBusy}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-50"
                    >
                      {busy === `${record.did}:publish`
                        ? 'Publishing…'
                        : 'Publish'}
                    </button>
                  )}
                  {record.status === 'published' && (
                    <>
                      <Link to={`${didPath}/update`} className={ROW_LINK_CLASS}>
                        Update
                      </Link>
                      <button
                        type="button"
                        onClick={() => deactivate(record.did)}
                        disabled={isBusy}
                        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {busy === `${record.did}:deactivate`
                          ? 'Deactivating…'
                          : 'Deactivate'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(dids.length > 0 || offset > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Previous page"
            onClick={() =>
              setOffset((o) => Math.max(0, o - DID_LIST_PAGE_SIZE))
            }
            disabled={offset === 0 || loading}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          {dids.length > 0 && (
            <p className="text-sm text-slate-700">
              Showing {offset + 1}–{offset + dids.length}
            </p>
          )}
          <button
            type="button"
            aria-label="Next page"
            onClick={() => setOffset((o) => o + DID_LIST_PAGE_SIZE)}
            disabled={loading || dids.length < DID_LIST_PAGE_SIZE}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

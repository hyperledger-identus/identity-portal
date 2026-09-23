import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AppRouter } from '../../../api/registry';
import { api } from '../../utils/api';
import type { EndpointAt, OutputOf } from '../../utils/api/types';
import { credentialKey } from './credentialKey';

type HolderCredentialRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/credentials'>
>['credentials'][number];

/** What the invitations page hands over after an approved invitation. */
type RequestedNotice = { recordId: string; protocolState: string };

const CREDENTIAL_LIST_PAGE_SIZE = 10;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function formatIssuedAt(value: string | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

/**
 * `/holder/credentials`: the verifiable credentials already in the holder
 * wallet (`GET /api/credentials`). Distinct from issuer OOB offers. Every row
 * links to the credential's own page. A credential asked for on the
 * invitations page shows up here once the issuer has answered; nothing polls.
 */
export function CredentialListPage() {
  const location = useLocation();
  const requested =
    (location.state as { requested?: RequestedNotice } | null)?.requested ??
    null;
  const [credentials, setCredentials] = useState<HolderCredentialRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

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

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your credentials</h2>
          <p className="mt-1 text-sm text-slate-700">
            Verifiable credentials in the holder wallet. These are issued VCs,
            not issuer offers. Open one for its claims.
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
      {requested && (
        <div className="flex flex-col gap-1 rounded-md border border-line p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
            Credential request sent
          </p>
          <p className="text-sm text-slate-700">
            The credential shows up here once the issuer has answered. Use
            Refresh.
          </p>
          <p className="overflow-auto font-mono text-xs text-ink">
            {requested.recordId} · {requested.protocolState}
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !loading && credentials.length === 0 && (
        <p className="text-sm text-slate-700">No credentials yet.</p>
      )}
      {credentials.length > 0 && (
        <ul className="flex flex-col gap-3">
          {credentials.map((record) => (
            <li key={record.id}>
              <Link
                to={encodeURIComponent(credentialKey(record.id))}
                className="flex flex-col gap-1 rounded-md bg-slate-50 p-3 transition hover:bg-slate-100"
              >
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {record.format}
                  </span>
                  <span className="text-xs text-slate-600">
                    {formatIssuedAt(record.issuedAt)}
                  </span>
                </span>
                <span className="overflow-auto font-mono text-xs text-ink">
                  Issuer {record.issuer ?? '—'}
                </span>
                <span className="overflow-auto font-mono text-xs text-ink">
                  Subject {record.subject ?? '—'}
                </span>
              </Link>
            </li>
          ))}
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

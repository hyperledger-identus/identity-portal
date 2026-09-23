import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AppRouter } from '../../../api/registry';
import { api } from '../../utils/api';
import type { EndpointAt, OutputOf } from '../../utils/api/types';
import { credentialKey } from './credentialKey';

type HolderCredentialRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/credentials'>
>['credentials'][number];

/** Page size and page cap of the walk through `GET /api/credentials`. */
const SCAN_PAGE_SIZE = 100;
const SCAN_MAX_PAGES = 50;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function formatIssuedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

/**
 * The API lists held credentials but has no endpoint for one of them, so the
 * page walks the list until a credential answers to the key in the address. An
 * empty page ends the walk.
 */
async function findCredential(
  key: string,
): Promise<{ record?: HolderCredentialRecord; error?: string }> {
  for (let page = 0; page < SCAN_MAX_PAGES; page += 1) {
    const { data, error } = await api.GET('/credentials', {
      offset: page * SCAN_PAGE_SIZE,
      limit: SCAN_PAGE_SIZE,
    });
    if (error) {
      return { error: apiErrorMessage(error, 'Could not load the credential.') };
    }
    const credentials = data?.credentials ?? [];
    const record = credentials.find((item) => credentialKey(item.id) === key);
    if (record) {
      return { record };
    }
    if (credentials.length === 0) {
      return {};
    }
  }
  return {};
}

/** One metadata row of the credential header. */
function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
        {label}
      </span>
      <span className="overflow-auto font-mono text-xs text-ink">{children}</span>
    </div>
  );
}

/**
 * `/holder/credentials/:key`: one verifiable credential of the holder wallet:
 * issuer, subject and issue date on top, the claims and the credential id
 * under them. On the local agent the id is the credential itself, the JWT.
 */
export function CredentialDetailPage() {
  const { key = '' } = useParams();
  const [record, setRecord] = useState<HolderCredentialRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  // Only the newest walk may write its outcome.
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError(null);
    setMissing(false);
    setRecord(null);
    try {
      const found = await findCredential(key);
      if (request !== latest.current) return;
      if (found.error) {
        setError(found.error);
      } else if (found.record) {
        setRecord(found.record);
      } else {
        setMissing(true);
      }
    } catch {
      if (request === latest.current) setError('Request failed.');
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  const copyId = async () => {
    if (!record) {
      return;
    }
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(record.id);
      setCopied(true);
    } catch {
      setCopyError('Could not copy the credential id.');
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div>
        <p className="text-sm">
          <Link
            to="/holder/credentials"
            className="text-slate-600 transition hover:text-ink"
          >
            ← Credentials
          </Link>
        </p>
        <h2 className="mt-2 text-lg font-semibold text-ink">Credential</h2>
      </div>
      {loading && !record && <p className="text-sm text-slate-700">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {missing && (
        <p className="text-sm text-red-600">
          No credential answers to this address. It may not exist in this
          wallet.
        </p>
      )}
      {record && (
        <>
          <div className="grid gap-4 rounded-md bg-slate-50 p-4 md:grid-cols-2">
            <MetaRow label="Format">{record.format}</MetaRow>
            <MetaRow label="Issued">
              {record.issuedAt ? formatIssuedAt(record.issuedAt) : '—'}
            </MetaRow>
            <div className="md:col-span-2">
              <MetaRow label="Issuer">{record.issuer ?? '—'}</MetaRow>
            </div>
            <div className="md:col-span-2">
              <MetaRow label="Subject">{record.subject ?? '—'}</MetaRow>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">Claims</p>
            <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
              {JSON.stringify(record.claims ?? {}, null, 2)}
            </pre>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium text-ink">Id</p>
              <button
                type="button"
                onClick={copyId}
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="overflow-auto break-all rounded-md bg-slate-50 p-4 font-mono text-xs text-ink">
              {record.id}
            </p>
            {copyError && <p className="text-sm text-red-600">{copyError}</p>}
          </div>
        </>
      )}
    </section>
  );
}

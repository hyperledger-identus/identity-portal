import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AppRouter } from '../../../api/registry';
import { toProtocolStateLabel } from '../../../utils/agent/types';
import { api } from '../../utils/api';
import type { EndpointAt, OutputOf } from '../../utils/api/types';

type OfferRecord = OutputOf<EndpointAt<AppRouter, 'get', '/offers/:recordId'>>;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

/** One metadata row of the offer header. */
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
 * `/issuer/offers/:recordId`: one issuer credential offer
 * (`GET /api/offers/:recordId`): its protocol state and metadata on top, the
 * claims and the invitation URL under them. The state moves when the holder
 * acts on the invitation; Refresh reads it again, nothing polls.
 */
export function OfferDetailPage() {
  const { recordId = '' } = useParams();
  const [record, setRecord] = useState<OfferRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/offers/:recordId', { recordId });
      if (error) {
        setError(apiErrorMessage(error, 'Could not load the offer.'));
      } else {
        setRecord(data ?? null);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    load();
  }, [load]);

  const copyInvitation = async () => {
    const url = record?.invitationUrl;
    if (!url) {
      return;
    }
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyError('Could not copy the invitation URL.');
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm">
            <Link
              to="/issuer/offers"
              className="text-slate-600 transition hover:text-ink"
            >
              ← Offers
            </Link>
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">
            Credential offer
          </h2>
          {record && (
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-600">
              {toProtocolStateLabel(record.protocolState)}{' '}
              <span className="font-mono font-normal normal-case tracking-normal text-slate-500">
                {record.protocolState}
              </span>
            </p>
          )}
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
      {loading && !record && <p className="text-sm text-slate-700">Loading…</p>}
      {error && (
        <p className="text-sm text-red-600">
          {error} The offer may not exist on this agent.
        </p>
      )}
      {record && (
        <>
          <div className="grid gap-4 rounded-md bg-slate-50 p-4 md:grid-cols-2">
            <MetaRow label="Record id">{record.recordId}</MetaRow>
            <MetaRow label="Thread id">{record.thid}</MetaRow>
            <MetaRow label="Created">{formatDate(record.createdAt)}</MetaRow>
            {record.updatedAt ? (
              <MetaRow label="Updated">{formatDate(record.updatedAt)}</MetaRow>
            ) : null}
            <MetaRow label="Format">{record.credentialFormat}</MetaRow>
            {record.automaticIssuance !== undefined ? (
              <MetaRow label="Automatic issuance">
                {record.automaticIssuance ? 'yes' : 'no'}
              </MetaRow>
            ) : null}
            {record.schemaId ? (
              <MetaRow label="Schema">
                <Link
                  to={`/issuer/schemas/${encodeURIComponent(record.schemaId)}`}
                  className="underline transition hover:text-slate-600"
                >
                  {record.schemaId}
                </Link>
              </MetaRow>
            ) : null}
            {record.subjectId ? (
              <MetaRow label="Subject">{record.subjectId}</MetaRow>
            ) : null}
            {record.issuingDID ? (
              <div className="md:col-span-2">
                <MetaRow label="Issuing DID">{record.issuingDID}</MetaRow>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">Claims</p>
            <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
              {JSON.stringify(record.claims, null, 2)}
            </pre>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium text-ink">Invitation URL</p>
              <button
                type="button"
                onClick={copyInvitation}
                disabled={!record.invitationUrl}
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {record.invitationUrl ? (
              <p className="overflow-auto break-all rounded-md bg-slate-50 p-4 font-mono text-xs text-ink">
                {record.invitationUrl}
              </p>
            ) : (
              <p className="text-sm text-slate-700">
                No invitation URL on this offer.
              </p>
            )}
            {copyError && <p className="text-sm text-red-600">{copyError}</p>}
          </div>
        </>
      )}
    </section>
  );
}

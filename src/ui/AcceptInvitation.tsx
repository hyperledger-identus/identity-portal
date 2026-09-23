import { useEffect, useState } from 'react';
import type { AppRouter } from '../api/registry';
import { api } from './utils/api';
import type { EndpointAt, OutputOf } from './utils/api/types';

type InvitationPreview = OutputOf<
  EndpointAt<AppRouter, 'post', '/invitations/preview'>
>;
type AcceptResult = OutputOf<
  EndpointAt<AppRouter, 'post', '/invitations/accept'>
>;
type PrismDIDRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/dids'>
>['dids'][number];

const DID_LIST_QUERY = { offset: 0, limit: 100 } as const;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function displayText(value: string | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}

function isPlainClaimValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function ClaimsPreview({ claims }: { claims: Record<string, unknown> }) {
  const entries = Object.entries(claims);
  if (entries.length === 0) {
    return <p className="text-sm text-slate-700">No claims in this offer.</p>;
  }
  if (entries.every(([, value]) => isPlainClaimValue(value))) {
    return (
      <dl className="grid gap-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-sm font-medium text-ink">{key}</dt>
            <dd className="text-sm text-ink">
              {value === null ? '—' : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
      {JSON.stringify(claims, null, 2)}
    </pre>
  );
}

/**
 * Holder widget: paste an OOB invitation URL or raw `_oob` payload, preview
 * the offer, then approve (credential request) or reject (no protocol traffic).
 * Preview is a distinct step and never accepts the offer.
 */
export function AcceptInvitation({
  onAccepted,
  onRejected,
}: {
  onAccepted?: (record: AcceptResult) => void;
  onRejected?: () => void;
}) {
  const [oob, setOob] = useState('');
  const [previewedOob, setPreviewedOob] = useState('');
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [rejected, setRejected] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [dids, setDids] = useState<PrismDIDRecord[]>([]);
  const [didsError, setDidsError] = useState<string | null>(null);
  const [didsLoading, setDidsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'accept' | 'reject' | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDidsLoading(true);
      setDidsError(null);
      try {
        const { data, error } = await api.GET('/dids', DID_LIST_QUERY);
        if (cancelled) return;
        if (error) {
          setDidsError(
            apiErrorMessage(
              error,
              'Could not load DIDs for the subject field.',
            ),
          );
        } else {
          setDids(data?.dids ?? []);
        }
      } catch {
        if (!cancelled) setDidsError('Request failed.');
      } finally {
        if (!cancelled) setDidsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const resetPreviewState = () => {
    setPreview(null);
    setPreviewedOob('');
    setResult(null);
    setRejected(false);
  };

  const onOobChange = (value: string) => {
    setOob(value);
    setError(null);
    if (previewedOob && value.trim() !== previewedOob) {
      resetPreviewState();
    }
  };

  const previewInvitation = async () => {
    const value = oob.trim();
    if (!value) {
      setError('Invitation is required.');
      return;
    }

    setBusy('preview');
    setError(null);
    resetPreviewState();
    try {
      const { data, error } = await api.POST('/invitations/preview', {
        oob: value,
      });
      if (error) {
        setError(apiErrorMessage(error, 'Could not preview the invitation.'));
      } else if (data) {
        setPreview(data);
        setPreviewedOob(value);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setBusy(null);
    }
  };

  const acceptInvitation = async () => {
    if (!previewedOob) return;

    setBusy('accept');
    setError(null);
    setRejected(false);
    try {
      const { data, error } = await api.POST(
        '/invitations/accept',
        subjectId ? { oob: previewedOob, subjectId } : { oob: previewedOob },
      );
      if (error) {
        setError(apiErrorMessage(error, 'Could not accept the invitation.'));
      } else if (data) {
        setResult(data);
        onAccepted?.(data);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setBusy(null);
    }
  };

  const rejectInvitation = async () => {
    if (!previewedOob) return;

    setBusy('reject');
    setError(null);
    try {
      const { error } = await api.POST('/invitations/reject', {
        oob: previewedOob,
      });
      if (error) {
        setError(apiErrorMessage(error, 'Could not reject the invitation.'));
      } else {
        resetPreviewState();
        setSubjectId('');
        setRejected(true);
        onRejected?.();
      }
    } catch {
      setError('Request failed.');
    } finally {
      setBusy(null);
    }
  };

  const canDecide = preview !== null && result === null && busy === null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Accept invitation</h2>
        <p className="mt-1 text-sm text-slate-700">
          Paste an out-of-band credential invitation URL or a raw _oob payload.
          Preview the offer before you approve or reject it.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink">
        <span className="font-medium">Invitation</span>
        <textarea
          value={oob}
          onChange={(event) => onOobChange(event.target.value)}
          rows={5}
          placeholder="https://example/_oob=… or raw _oob payload"
          className="rounded-md border border-line px-3 py-2 font-mono text-sm text-ink"
        />
      </label>

      <div>
        <button
          type="button"
          onClick={previewInvitation}
          disabled={busy !== null || oob.trim().length === 0}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'preview' ? 'Previewing…' : 'Preview'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!preview && !result && !error && !rejected && busy !== 'preview' && (
        <p className="text-sm text-slate-700">
          No invitation previewed yet. Paste an invitation and choose Preview.
        </p>
      )}

      {rejected && !preview && (
        <p className="text-sm text-slate-700">Invitation rejected.</p>
      )}

      {preview && (
        <div className="flex flex-col gap-4 rounded-md bg-slate-50 p-4">
          <p className="text-sm font-medium text-ink">Offer preview</p>
          <dl className="grid gap-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
            <div className="contents">
              <dt className="text-sm font-medium text-ink">From</dt>
              <dd className="overflow-auto font-mono text-xs text-ink">
                {displayText(preview.from)}
              </dd>
            </div>
            <div className="contents">
              <dt className="text-sm font-medium text-ink">Goal</dt>
              <dd className="text-sm text-ink">{displayText(preview.goal)}</dd>
            </div>
            <div className="contents">
              <dt className="text-sm font-medium text-ink">Issuing DID</dt>
              <dd className="overflow-auto font-mono text-xs text-ink">
                {displayText(preview.issuingDID)}
              </dd>
            </div>
            <div className="contents">
              <dt className="text-sm font-medium text-ink">Format</dt>
              <dd className="text-sm text-ink">{preview.credentialFormat}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">Claims</p>
            <ClaimsPreview claims={preview.claims} />
          </div>

          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="font-medium">Subject DID (optional)</span>
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              disabled={busy !== null || result !== null}
              className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="">No subject DID</option>
              {dids.map((record) => (
                <option key={record.did} value={record.did}>
                  {record.did} ({record.status})
                </option>
              ))}
            </select>
          </label>
          {didsError && <p className="text-sm text-red-600">{didsError}</p>}
          {!didsLoading && dids.length === 0 && !didsError && (
            <p className="text-sm text-slate-700">
              No prism DIDs available. You can still approve without a subject
              DID.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={acceptInvitation}
              disabled={!canDecide}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            >
              {busy === 'accept' ? 'Requesting…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={rejectInvitation}
              disabled={!canDecide}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-white disabled:opacity-50"
            >
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </div>
      )}

      {result != null && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">
            Credential request sent
          </p>
          <dl className="grid gap-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
            <div className="contents">
              <dt className="text-sm font-medium text-ink">Record ID</dt>
              <dd className="overflow-auto font-mono text-xs text-ink">
                {result.recordId}
              </dd>
            </div>
            <div className="contents">
              <dt className="text-sm font-medium text-ink">Protocol state</dt>
              <dd className="text-sm text-ink">{result.protocolState}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

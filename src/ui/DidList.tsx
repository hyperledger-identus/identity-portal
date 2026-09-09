import { useCallback, useEffect, useState } from 'react';
import { Domain } from '@hyperledger/identus-sdk';
import type { AppRouter } from '../api/registry';
import { api } from './utils/api';
import type { EndpointAt, InputOf, OutputOf } from './utils/api/types';

type PrismDIDRecord = OutputOf<EndpointAt<AppRouter, 'get', '/dids'>>['dids'][number];
type PrismDIDUpdateAction = InputOf<
  EndpointAt<AppRouter, 'post', '/dids/:did/update'>
>['actions'][number];
type DidDocument = OutputOf<EndpointAt<AppRouter, 'get', '/dids/resolve/:did'>>;

const KEY_USAGES = [
  'ISSUING_KEY',
  'KEY_AGREEMENT_KEY',
  'AUTHENTICATION_KEY',
  'REVOCATION_KEY',
  'CAPABILITY_INVOCATION_KEY',
  'CAPABILITY_DELEGATION_KEY',
] as const;

const CURVES = [
  Domain.Curve.SECP256K1,
  Domain.Curve.ED25519,
  Domain.Curve.X25519,
] as const;

const ACTION_TYPES = [
  'addKey',
  'removeKey',
  'addService',
  'removeService',
  'updateService',
] as const;

type ActionType = (typeof ACTION_TYPES)[number];
type KeyUsage = (typeof KEY_USAGES)[number];
type Curve = (typeof CURVES)[number];

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

/**
 * Operations panel: lists prism DIDs with status and publish / update /
 * deactivate actions (`GET` / `POST /api/dids...`).
 */
export function DidList({ refreshToken = 0 }: { refreshToken?: number }) {
  const [dids, setDids] = useState<PrismDIDRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [updatingDid, setUpdatingDid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/dids');
      if (error) {
        setError(apiErrorMessage(error, 'Could not load the DIDs.'));
      } else {
        setDids(data?.dids ?? []);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

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
        setUpdatingDid(null);
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

  const submitUpdate = async (did: string, actions: PrismDIDUpdateAction[]) => {
    setBusy(`${did}:update`);
    setError(null);
    try {
      const { error } = await api.POST('/dids/:did/update', { did, actions });
      if (error) {
        setError(apiErrorMessage(error, 'Could not update the DID.'));
      } else {
        setUpdatingDid(null);
        await load();
      }
    } catch {
      setError('Request failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your DIDs</h2>
          <p className="mt-1 text-sm text-slate-700">
            Prism DIDs stored by the active agent. Publish, update, or deactivate
            from here.
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
      {!error && !loading && dids.length === 0 && (
        <p className="text-sm text-slate-700">
          No DIDs yet. Create one with the Create widget.
        </p>
      )}
      {dids.length > 0 && (
        <ul className="flex flex-col gap-3">
          {dids.map((record) => {
            const isBusy = busy?.startsWith(`${record.did}:`) ?? false;
            return (
              <li
                key={record.did}
                className="flex flex-col gap-3 rounded-md bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
                        <button
                          type="button"
                          onClick={() =>
                            setUpdatingDid((current) =>
                              current === record.did ? null : record.did,
                            )
                          }
                          disabled={isBusy}
                          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-white disabled:opacity-50"
                        >
                          {updatingDid === record.did ? 'Close' : 'Update'}
                        </button>
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
                </div>
                {updatingDid === record.did && (
                  <DidUpdateForm
                    did={record.did}
                    busy={busy === `${record.did}:update`}
                    onSubmit={(actions) => submitUpdate(record.did, actions)}
                    onCancel={() => setUpdatingDid(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DidUpdateForm({
  did,
  busy,
  onSubmit,
  onCancel,
}: {
  did: string;
  busy: boolean;
  onSubmit: (actions: PrismDIDUpdateAction[]) => void;
  onCancel: () => void;
}) {
  const [document, setDocument] = useState<DidDocument | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [actions, setActions] = useState<PrismDIDUpdateAction[]>([]);
  const [actionType, setActionType] = useState<ActionType>('addKey');
  const [keyId, setKeyId] = useState('');
  const [purpose, setPurpose] = useState<KeyUsage>('ISSUING_KEY');
  const [curve, setCurve] = useState<Curve>(Domain.Curve.SECP256K1);
  const [serviceId, setServiceId] = useState('');
  const [serviceType, setServiceType] = useState('LinkedDomains');
  const [serviceEndpoint, setServiceEndpoint] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await api.GET('/dids/resolve/:did', { did });
      if (cancelled) return;
      if (error) {
        setResolveError(
          apiErrorMessage(error, 'Could not resolve the DID document.'),
        );
      } else {
        setDocument(data ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [did]);

  const keyIds = document?.verificationMethod.map((method) => method.id) ?? [];
  const serviceIds = document?.service?.map((service) => service.id) ?? [];

  const addAction = () => {
    setDraftError(null);
    if (actionType === 'addKey') {
      if (!keyId.trim()) {
        setDraftError('Key id is required.');
        return;
      }
      setActions((prev) => [
        ...prev,
        {
          actionType: 'addKey',
          addKey: { id: keyId.trim(), purpose, curve },
        },
      ]);
      setKeyId('');
      return;
    }
    if (actionType === 'removeKey') {
      if (!keyId.trim()) {
        setDraftError('Key id is required.');
        return;
      }
      setActions((prev) => [
        ...prev,
        { actionType: 'removeKey', removeKey: { id: keyId.trim() } },
      ]);
      setKeyId('');
      return;
    }
    if (actionType === 'removeService') {
      if (!serviceId.trim()) {
        setDraftError('Service id is required.');
        return;
      }
      setActions((prev) => [
        ...prev,
        {
          actionType: 'removeService',
          removeService: { id: serviceId.trim() },
        },
      ]);
      setServiceId('');
      return;
    }
    const endpoints = serviceEndpoint
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!serviceId.trim() || !serviceType.trim() || endpoints.length === 0) {
      setDraftError('Service id, type, and at least one endpoint are required.');
      return;
    }
    if (actionType === 'addService') {
      setActions((prev) => [
        ...prev,
        {
          actionType: 'addService',
          addService: {
            id: serviceId.trim(),
            type: serviceType.trim(),
            serviceEndpoint: endpoints,
          },
        },
      ]);
    } else {
      setActions((prev) => [
        ...prev,
        {
          actionType: 'updateService',
          updateService: {
            id: serviceId.trim(),
            type: serviceType.trim(),
            serviceEndpoint: endpoints,
          },
        },
      ]);
    }
    setServiceId('');
    setServiceEndpoint('');
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-white p-4">
      <p className="text-sm font-medium text-ink">Update actions</p>
      {resolveError && (
        <p className="text-xs text-slate-600">
          Document could not be loaded ({resolveError}). You can still type ids
          by hand.
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm text-ink">
        <span className="font-medium">Action</span>
        <select
          value={actionType}
          onChange={(event) => setActionType(event.target.value as ActionType)}
          className="rounded-md border border-line px-3 py-2 text-sm text-ink"
        >
          {ACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      {(actionType === 'addKey' || actionType === 'removeKey') && (
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Key id</span>
          <input
            value={keyId}
            onChange={(event) => setKeyId(event.target.value)}
            list="did-key-ids"
            placeholder={actionType === 'addKey' ? 'issuing-1' : 'Select or type a key id'}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          />
          {actionType === 'removeKey' && (
            <datalist id="did-key-ids">
              {keyIds.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          )}
        </label>
      )}
      {actionType === 'addKey' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="font-medium">Purpose</span>
            <select
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as KeyUsage)}
              className="rounded-md border border-line px-3 py-2 text-sm text-ink"
            >
              {KEY_USAGES.map((usage) => (
                <option key={usage} value={usage}>
                  {usage}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="font-medium">Curve</span>
            <select
              value={curve}
              onChange={(event) => setCurve(event.target.value as Curve)}
              className="rounded-md border border-line px-3 py-2 text-sm text-ink"
            >
              {CURVES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(actionType === 'addService' ||
        actionType === 'removeService' ||
        actionType === 'updateService') && (
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Service id</span>
          <input
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            list="did-service-ids"
            placeholder="service-1"
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          />
          {actionType !== 'addService' && (
            <datalist id="did-service-ids">
              {serviceIds.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          )}
        </label>
      )}
      {(actionType === 'addService' || actionType === 'updateService') && (
        <>
          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="font-medium">Service type</span>
            <input
              value={serviceType}
              onChange={(event) => setServiceType(event.target.value)}
              className="rounded-md border border-line px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            <span className="font-medium">Endpoints (comma-separated)</span>
            <input
              value={serviceEndpoint}
              onChange={(event) => setServiceEndpoint(event.target.value)}
              placeholder="https://example.com"
              className="rounded-md border border-line px-3 py-2 text-sm text-ink"
            />
          </label>
        </>
      )}
      {draftError && <p className="text-sm text-red-600">{draftError}</p>}
      <div>
        <button
          type="button"
          onClick={addAction}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-slate-50"
        >
          Add action
        </button>
      </div>
      {actions.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-ink">
          {actions.map((action, index) => (
            <li
              key={`${action.actionType}-${index}`}
              className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1"
            >
              <span className="font-mono">{JSON.stringify(action)}</span>
              <button
                type="button"
                onClick={() =>
                  setActions((prev) => prev.filter((_, i) => i !== index))
                }
                className="text-slate-600 hover:text-ink"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSubmit(actions)}
          disabled={busy || actions.length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Submit update'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

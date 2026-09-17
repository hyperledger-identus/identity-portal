import { useEffect, useState } from 'react';
import type { AppRouter } from '../api/registry';
import { api } from './utils/api';
import type { EndpointAt, OutputOf } from './utils/api/types';

type PrismDIDRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/dids'>
>['dids'][number];

type SchemaRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/schemas'>
>['schemas'][number];

type CreatedOffer = Pick<
  OutputOf<EndpointAt<AppRouter, 'post', '/offers'>>,
  'recordId' | 'protocolState' | 'invitationUrl'
>;

const DID_PAGE = { offset: 0, limit: 100 } as const;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function propertyType(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return 'string';
  }
  const field = value as { type?: unknown };
  if (typeof field.type === 'string') {
    return field.type;
  }
  if (
    Array.isArray(field.type) &&
    field.type.every((item) => typeof item === 'string') &&
    field.type[0]
  ) {
    return field.type[0];
  }
  return 'string';
}

function propertyTypeHint(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return 'string';
  }
  const field = value as { type?: unknown; format?: unknown };
  let type = 'string';
  if (typeof field.type === 'string') {
    type = field.type;
  } else if (
    Array.isArray(field.type) &&
    field.type.every((item) => typeof item === 'string')
  ) {
    type = field.type.join(', ');
  }
  if (typeof field.format === 'string' && field.format) {
    return `${type} (${field.format})`;
  }
  return type;
}

function parseClaimsJson(text: string): Record<string, unknown> | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'Claims must be valid JSON.';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Claims must be a JSON object.';
  }
  return parsed as Record<string, unknown>;
}

function claimsFromSchemaFields(
  properties: Record<string, unknown>,
  required: string[],
  values: Record<string, string>,
): Record<string, unknown> | string {
  const claims: Record<string, unknown> = {};
  const requiredSet = new Set(required);

  for (const [name, spec] of Object.entries(properties)) {
    const type = propertyType(spec);
    const raw = values[name] ?? '';

    if (type === 'boolean') {
      claims[name] = raw === 'true';
      continue;
    }

    if (raw.trim() === '') {
      if (requiredSet.has(name)) {
        return `${name} is required.`;
      }
      continue;
    }

    if (type === 'integer') {
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        return `${name} must be an integer.`;
      }
      claims[name] = n;
      continue;
    }

    if (type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return `${name} must be a number.`;
      }
      claims[name] = n;
      continue;
    }

    claims[name] = raw;
  }

  return claims;
}

/**
 * Create widget: pick an issuing Prism DID, optionally a schema, fill claims,
 * and POST a connectionless JWT OOB offer (`POST /api/offers`).
 */
export function CreateOffer({ onCreated }: { onCreated?: () => void }) {
  const [issuingDID, setIssuingDID] = useState('');
  const [schemaId, setSchemaId] = useState('');
  const [claimValues, setClaimValues] = useState<Record<string, string>>({});
  const [claimsJson, setClaimsJson] = useState('{}');
  const [dids, setDids] = useState<PrismDIDRecord[]>([]);
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [didsError, setDidsError] = useState<string | null>(null);
  const [schemasError, setSchemasError] = useState<string | null>(null);
  const [didsLoading, setDidsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CreatedOffer | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadDids = async () => {
      setDidsLoading(true);
      setDidsError(null);
      try {
        const { data, error } = await api.GET('/dids', DID_PAGE);
        if (error) {
          setDidsError(
            apiErrorMessage(error, 'Could not load DIDs for the issuing DID.'),
          );
        } else {
          const refactorDids = data?.dids ?? [];
          setDids(refactorDids.map((did) => {

            if (did.status === 'published') {
              const shortForm = did.did.split(':').slice(0, 3).join(':');
              return {
                status: 'published',
                did: shortForm,
                transactionId: did.transactionId,
              }
            }

            return did;
          }));
        }
      } catch {
        setDidsError('Request failed.');
      } finally {
        setDidsLoading(false);
      }
    };

    const loadSchemas = async () => {
      setSchemasError(null);
      try {
        const { data, error } = await api.GET('/schemas');
        if (error) {
          setSchemasError(apiErrorMessage(error, 'Could not load schemas.'));
        } else {
          setSchemas(data?.schemas ?? []);
        }
      } catch {
        setSchemasError('Request failed.');
      }
    };

    void loadDids();
    void loadSchemas();
  }, []);

  const selectedSchema = schemas.find((record) => record.uuid === schemaId);
  const properties = selectedSchema?.schema.properties;
  const propertyEntries = properties ? Object.entries(properties) : [];
  const required = selectedSchema?.schema.required ?? [];
  const requiredSet = new Set(required);

  const create = async () => {
    const trimmedDid = issuingDID.trim();
    if (!trimmedDid) {
      setError('Issuing DID is required.');
      return;
    }

    let claims: Record<string, unknown>;
    if (schemaId && selectedSchema) {
      const built = claimsFromSchemaFields(
        properties ?? {},
        required,
        claimValues,
      );
      if (typeof built === 'string') {
        setError(built);
        return;
      }
      claims = built;
    } else {
      const parsed = parseClaimsJson(claimsJson);
      if (typeof parsed === 'string') {
        setError(parsed);
        return;
      }
      claims = parsed;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const { data, error } = await api.POST('/offers', {
        issuingDID: trimmedDid,
        schemaId: schemaId || undefined,
        claims,
        automaticIssuance: true,
      });
      if (error) {
        setError(apiErrorMessage(error, 'Could not create the offer.'));
      } else if (data) {
        setResult({
          recordId: data.recordId,
          protocolState: data.protocolState,
          invitationUrl: data.invitationUrl,
        });
        setClaimValues({});
        setClaimsJson('{}');
        onCreated?.();
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyInvitation = async () => {
    const url = result?.invitationUrl;
    if (!url) {
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('Could not copy the invitation URL.');
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Create offer</h2>
        <p className="mt-1 text-sm text-slate-700">
          Create a connectionless JWT credential offer. Copy the invitation URL
          and send it to a holder.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Issuing DID</span>
          <select
            value={issuingDID}
            onChange={(event) => setIssuingDID(event.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          >
            <option value="">Select a DID</option>
            {dids.map((record) => (
              <option key={record.did} value={record.did}>
                {record.did} ({record.status})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Schema</span>
          <select
            value={schemaId}
            onChange={(event) => {
              setSchemaId(event.target.value);
              setClaimValues({});
            }}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          >
            <option value="">None (JSON claims)</option>
            {schemas.map((record) => (
              <option key={record.uuid} value={record.uuid}>
                {record.name} {record.version}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Credential format</span>
          <select
            value="JWT"
            disabled
            className="rounded-md border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            <option value="JWT">JWT</option>
          </select>
        </label>
      </div>

      {didsError && <p className="text-sm text-red-600">{didsError}</p>}
      {schemasError && <p className="text-sm text-red-600">{schemasError}</p>}
      {!didsLoading && dids.length === 0 && (
        <p className="text-sm text-slate-700">
          Create a prism DID first, then refresh this page or the DID list.
        </p>
      )}

      {schemaId && selectedSchema ? (
        propertyEntries.length === 0 ? (
          <p className="text-sm text-slate-700">
            No fields on this schema. The offer will be created with empty
            claims.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {propertyEntries.map(([name, spec]) => {
              const type = propertyType(spec);
              const hint = propertyTypeHint(spec);
              const isRequired = requiredSet.has(name);
              if (type === 'boolean') {
                return (
                  <label
                    key={name}
                    className="flex items-center gap-2 text-sm text-ink"
                  >
                    <input
                      type="checkbox"
                      checked={claimValues[name] === 'true'}
                      onChange={(event) =>
                        setClaimValues((prev) => ({
                          ...prev,
                          [name]: event.target.checked ? 'true' : 'false',
                        }))
                      }
                    />
                    <span className="font-medium">{name}</span>
                    <span className="text-xs text-slate-600">{hint}</span>
                  </label>
                );
              }
              return (
                <label
                  key={name}
                  className="flex flex-col gap-1 text-sm text-ink"
                >
                  <span className="font-medium">
                    {name}
                    {isRequired ? ' *' : ''}{' '}
                    <span className="font-normal text-slate-600">{hint}</span>
                  </span>
                  <input
                    type={
                      type === 'integer' || type === 'number'
                        ? 'number'
                        : 'text'
                    }
                    step={
                      type === 'integer'
                        ? '1'
                        : type === 'number'
                          ? 'any'
                          : undefined
                    }
                    required={isRequired}
                    value={claimValues[name] ?? ''}
                    onChange={(event) =>
                      setClaimValues((prev) => ({
                        ...prev,
                        [name]: event.target.value,
                      }))
                    }
                    className="rounded-md border border-line px-3 py-2 text-sm text-ink"
                  />
                </label>
              );
            })}
          </div>
        )
      ) : (
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Claims (JSON object)</span>
          <textarea
            value={claimsJson}
            onChange={(event) => setClaimsJson(event.target.value)}
            rows={6}
            className="rounded-md border border-line px-3 py-2 font-mono text-sm text-ink"
          />
        </label>
      )}

      <div>
        <button
          type="button"
          onClick={create}
          disabled={loading || dids.length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create offer'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result != null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-medium text-ink">Created offer</p>
            <button
              type="button"
              onClick={copyInvitation}
              disabled={!result.invitationUrl}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
            {JSON.stringify(
              {
                recordId: result.recordId,
                protocolState: result.protocolState,
                invitationUrl: result.invitationUrl,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </section>
  );
}

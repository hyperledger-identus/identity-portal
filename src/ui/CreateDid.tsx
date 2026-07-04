import { useState } from 'react';
import { api } from './utils/api';

/** Key usages required by `POST /api/dids`; each needs at least one curve. */
const KEY_USAGES = [
  'ISSUING_KEY',
  'KEY_AGREEMENT_KEY',
  'AUTHENTICATION_KEY',
  'REVOCATION_KEY',
  'CAPABILITY_INVOCATION_KEY',
  'CAPABILITY_DELEGATION_KEY',
] as const;

type KeyUsage = (typeof KEY_USAGES)[number];

/** Elliptic curves the SDK offers for prism DID keys. */
const CURVES = ['secp256k1', 'Ed25519', 'X25519'] as const;

type Curve = (typeof CURVES)[number];

/** Conventional default per usage: X25519 for key agreement, secp256k1 for signing. */
const DEFAULT_CURVES: Record<KeyUsage, Curve> = {
  ISSUING_KEY: 'secp256k1',
  KEY_AGREEMENT_KEY: 'X25519',
  AUTHENTICATION_KEY: 'secp256k1',
  REVOCATION_KEY: 'secp256k1',
  CAPABILITY_INVOCATION_KEY: 'secp256k1',
  CAPABILITY_DELEGATION_KEY: 'secp256k1',
};

/**
 * Create widget: builds a new prism DID through the portal API
 * (`POST /api/dids`), which dispatches to the active agent (local edge or
 * cloud). Each key usage takes one curve; the created DID is shown on success.
 */
export function CreateDid() {
  const [curves, setCurves] = useState<Record<KeyUsage, Curve>>(DEFAULT_CURVES);
  const [result, setResult] = useState<{ did: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const create = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await api.POST('/dids', {
        ISSUING_KEY: [curves.ISSUING_KEY],
        KEY_AGREEMENT_KEY: [curves.KEY_AGREEMENT_KEY],
        AUTHENTICATION_KEY: [curves.AUTHENTICATION_KEY],
        REVOCATION_KEY: [curves.REVOCATION_KEY],
        CAPABILITY_INVOCATION_KEY: [curves.CAPABILITY_INVOCATION_KEY],
        CAPABILITY_DELEGATION_KEY: [curves.CAPABILITY_DELEGATION_KEY],
      });
      if (error) {
        const message =
          error && typeof error === 'object' && 'error' in error
            ? String((error as { error: unknown }).error)
            : 'Could not create the DID.';
        setError(message);
      } else {
        setResult(data ?? null);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Create DID</h2>
        <p className="mt-1 text-sm text-slate-700">
          Create a new prism DID. Pick a curve for each key usage.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {KEY_USAGES.map((usage) => (
          <label key={usage} className="flex flex-col gap-1 text-sm text-ink">
            <span className="font-medium">{usage}</span>
            <select
              value={curves[usage]}
              onChange={(event) =>
                setCurves((prev) => ({
                  ...prev,
                  [usage]: event.target.value as Curve,
                }))
              }
              className="rounded-md border border-line px-3 py-2 text-sm text-ink"
            >
              {CURVES.map((curve) => (
                <option key={curve} value={curve}>
                  {curve}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div>
        <button
          type="button"
          onClick={create}
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create DID'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result != null && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink">Created DID</p>
          <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
            {result.did}
          </pre>
        </div>
      )}
    </section>
  );
}

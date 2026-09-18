import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AppRouter } from '../../../api/registry';
import { api } from '../../utils/api';
import type { EndpointAt, OutputOf } from '../../utils/api/types';

type SchemaRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/schemas'>
>['schemas'][number];

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function createdOn(record: SchemaRecord): string | null {
  if (!record.createdAt) {
    return null;
  }
  return new Date(record.createdAt * 1000).toLocaleDateString();
}

/**
 * `/issuer/schemas`: the credential schemas held by the active agent
 * (`GET /api/schemas`). Every row links to the schema's own page; creation
 * lives on `/issuer/schemas/new`.
 */
export function SchemaListPage() {
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/schemas');
      if (error) {
        setError(apiErrorMessage(error, 'Could not load the schemas.'));
      } else {
        setSchemas(data?.schemas ?? []);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Schemas</h2>
          <p className="mt-1 text-sm text-slate-700">
            Credential schemas held by the active agent. Open one for its
            fields and definition.
          </p>
        </div>
        <div className="flex gap-2">
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
            New schema
          </Link>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !loading && schemas.length === 0 && (
        <p className="text-sm text-slate-700">
          No schemas yet. Create the first one with “New schema”.
        </p>
      )}
      {schemas.length > 0 && (
        <ul className="flex flex-col gap-3">
          {schemas.map((record) => {
            const created = createdOn(record);
            return (
              <li key={record.uuid}>
                <Link
                  to={record.uuid}
                  className="flex flex-col gap-1 rounded-md bg-slate-50 p-3 transition hover:bg-slate-100"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {record.name}{' '}
                      <span className="font-normal text-slate-600">
                        {record.version}
                      </span>
                    </span>
                    {created && (
                      <span className="text-xs text-slate-600">{created}</span>
                    )}
                  </span>
                  <span className="overflow-auto font-mono text-xs text-ink">
                    {record.uuid}
                  </span>
                  {record.description ? (
                    <span className="text-sm text-slate-700">
                      {record.description}
                    </span>
                  ) : null}
                  {record.tags && record.tags.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {record.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-line bg-white px-2 py-0.5 text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

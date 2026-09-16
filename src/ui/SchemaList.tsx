import { useCallback, useEffect, useState } from 'react';
import type { AppRouter } from '../api/registry';
import { api } from './utils/api';
import type { EndpointAt, OutputOf } from './utils/api/types';

type SchemaRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/schemas'>
>['schemas'][number];

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

function propertyMeta(value: unknown): { type?: string; format?: string } {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const field = value as { type?: unknown; format?: unknown };
  let type: string | undefined;
  if (typeof field.type === 'string') {
    type = field.type;
  } else if (
    Array.isArray(field.type) &&
    field.type.every((item) => typeof item === 'string')
  ) {
    type = field.type.join(', ');
  }
  return {
    type,
    format: typeof field.format === 'string' ? field.format : undefined,
  };
}

/**
 * Dashboard card: lists credential schemas held by the active agent
 * (`GET /api/schemas`). Expand a row for the field table and JSON Schema preview.
 */
export function SchemaList({ refreshToken = 0 }: { refreshToken?: number }) {
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);

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
  }, [load, refreshToken]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Your schemas</h2>
          <p className="mt-1 text-sm text-slate-700">
            Credential schemas held by the active agent.
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
      {!error && !loading && schemas.length === 0 && (
        <p className="text-sm text-slate-700">
          No schemas yet. Create one with the form above.
        </p>
      )}
      {schemas.length > 0 && (
        <ul className="flex flex-col gap-3">
          {schemas.map((record) => {
            const expanded = expandedUuid === record.uuid;
            const properties = record.schema.properties;
            const propertyEntries = properties
              ? Object.entries(properties)
              : [];
            const required = new Set(record.schema.required ?? []);
            return (
              <li
                key={record.uuid}
                className="flex flex-col gap-3 rounded-md bg-slate-50 p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {record.name}{' '}
                      <span className="font-normal text-slate-600">
                        {record.version}
                      </span>
                    </p>
                    <p className="mt-1 overflow-auto font-mono text-xs text-ink">
                      {record.uuid}
                    </p>
                    <p className="overflow-auto font-mono text-xs text-ink">
                      {record.author}
                    </p>
                    {record.description ? (
                      <p className="mt-1 text-sm text-slate-700">
                        {record.description}
                      </p>
                    ) : null}
                    {record.tags && record.tags.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1">
                        {record.tags.map((tag) => (
                          <li
                            key={tag}
                            className="rounded-md border border-line bg-white px-2 py-0.5 text-xs"
                          >
                            {tag}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedUuid((current) =>
                          current === record.uuid ? null : record.uuid,
                        )
                      }
                      className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-white"
                    >
                      {expanded ? 'Close' : 'Details'}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="flex flex-col gap-3">
                    {propertyEntries.length === 0 ? (
                      <p className="text-sm text-slate-700">
                        No fields on this schema.
                      </p>
                    ) : (
                      <div className="overflow-auto rounded-md border border-line bg-white">
                        <table className="w-full text-left text-sm text-ink">
                          <thead>
                            <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-slate-600">
                              <th className="px-3 py-2 font-medium">Name</th>
                              <th className="px-3 py-2 font-medium">Type</th>
                              <th className="px-3 py-2 font-medium">Format</th>
                              <th className="px-3 py-2 font-medium">
                                Required
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {propertyEntries.map(([name, value]) => {
                              const { type, format } = propertyMeta(value);
                              return (
                                <tr
                                  key={name}
                                  className="border-b border-line last:border-0"
                                >
                                  <td className="px-3 py-2 font-medium">
                                    {name}
                                  </td>
                                  <td className="px-3 py-2">{type ?? '—'}</td>
                                  <td className="px-3 py-2">{format ?? '—'}</td>
                                  <td className="px-3 py-2">
                                    {required.has(name) ? 'yes' : 'no'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <pre className="overflow-auto rounded-md bg-white p-4 text-xs text-ink">
                      {JSON.stringify(record.schema, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

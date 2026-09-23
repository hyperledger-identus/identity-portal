import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AppRouter } from '../../../api/registry';
import { api } from '../../utils/api';
import type { EndpointAt, OutputOf } from '../../utils/api/types';

import { SchemaDefinition } from './SchemaDefinition';

type SchemaRecord = OutputOf<EndpointAt<AppRouter, 'get', '/schemas/:uuid'>>;

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

/** One metadata row of the schema header. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
        {label}
      </span>
      <span className="overflow-auto font-mono text-xs text-ink">{value}</span>
    </div>
  );
}

/**
 * `/issuer/schemas/:uuid`: one credential schema (`GET /api/schemas/:uuid`),
 * its metadata on top and the field table with the raw definition under it.
 */
export function SchemaDetailPage() {
  const { uuid = '' } = useParams();
  const [record, setRecord] = useState<SchemaRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await api.GET('/schemas/:uuid', { uuid });
      if (error) {
        setError(apiErrorMessage(error, 'Could not load the schema.'));
      } else {
        setRecord(data ?? null);
      }
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm">
            <Link to="/issuer/schemas" className="text-slate-600 transition hover:text-ink">
              ← Schemas
            </Link>
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">
            {record ? (
              <>
                {record.name}{' '}
                <span className="font-normal text-slate-600">
                  {record.version}
                </span>
              </>
            ) : (
              'Schema'
            )}
          </h2>
          {record?.description ? (
            <p className="mt-1 text-sm text-slate-700">{record.description}</p>
          ) : null}
        </div>
      </div>
      {loading && <p className="text-sm text-slate-700">Loading…</p>}
      {error && (
        <p className="text-sm text-red-600">
          {error} The schema may not exist on this agent.
        </p>
      )}
      {record && (
        <>
          <div className="grid gap-4 rounded-md bg-slate-50 p-4 md:grid-cols-2">
            <MetaRow label="Id" value={record.uuid} />
            <MetaRow label="Author" value={record.author} />
            {record.createdAt ? (
              <MetaRow
                label="Created"
                value={new Date(record.createdAt * 1000).toLocaleString()}
              />
            ) : null}
            {record.tags && record.tags.length > 0 ? (
              <MetaRow label="Tags" value={record.tags.join(', ')} />
            ) : null}
          </div>
          <SchemaDefinition schema={record.schema} />
        </>
      )}
    </section>
  );
}

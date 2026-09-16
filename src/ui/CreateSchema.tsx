import { useEffect, useState } from 'react';
import type { AppRouter } from '../api/registry';
import {
  FIELD_NAME_PATTERN,
  SchemaFieldBuilder,
  buildJsonSchema,
  type SchemaFieldDraft,
} from './SchemaFieldBuilder';
import { api } from './utils/api';
import type { EndpointAt, OutputOf } from './utils/api/types';

type PrismDIDRecord = OutputOf<
  EndpointAt<AppRouter, 'get', '/dids'>
>['dids'][number];

const DEFAULT_VERSION = '1.0.0';
const DEFAULT_TYPE =
  'https://w3c-ccg.github.io/vc-json-schemas/schema/2.0/schema.json';

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error) {
    return String((error as { error: unknown }).error);
  }
  return fallback;
}

/**
 * Create widget: metadata, author DID, and a field composer that POSTs a
 * credential schema through the portal API (`POST /api/schemas`).
 */
export function CreateSchema({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState(DEFAULT_VERSION);
  const [type, setType] = useState(DEFAULT_TYPE);
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [fields, setFields] = useState<SchemaFieldDraft[]>([]);
  const [dids, setDids] = useState<PrismDIDRecord[]>([]);
  const [didsError, setDidsError] = useState<string | null>(null);
  const [didsLoading, setDidsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ uuid: string } | null>(null);

  useEffect(() => {
    const loadDids = async () => {
      setDidsLoading(true);
      setDidsError(null);
      try {
        const { data, error } = await api.GET('/dids');
        if (error) {
          setDidsError(
            apiErrorMessage(error, 'Could not load DIDs for the author field.'),
          );
        } else {
          setDids(data?.dids ?? []);
        }
      } catch {
        setDidsError('Request failed.');
      } finally {
        setDidsLoading(false);
      }
    };

    void loadDids();
  }, []);

  const create = async () => {
    const trimmedName = name.trim();
    const trimmedVersion = version.trim();
    const trimmedType = type.trim();
    const trimmedAuthor = author.trim();
    const trimmedDescription = description.trim();
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');

    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (!trimmedVersion) {
      setError('Version is required.');
      return;
    }
    if (!trimmedType) {
      setError('Type is required.');
      return;
    }
    if (!trimmedAuthor) {
      setError('Author is required.');
      return;
    }

    const completeFields = fields.filter((field) => field.name !== '');
    if (completeFields.length === 0) {
      setError('Add at least one named field.');
      return;
    }

    const invalidField = completeFields.find(
      (field) => !FIELD_NAME_PATTERN.test(field.name),
    );
    if (invalidField) {
      setError(
        `Field name "${invalidField.name}" is invalid. Use a letter or underscore first, then letters, digits, or underscores.`,
      );
      return;
    }

    const seen = new Set<string>();
    for (const field of completeFields) {
      if (seen.has(field.name)) {
        setError(`Field name "${field.name}" is duplicated.`);
        return;
      }
      seen.add(field.name);
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await api.POST('/schemas', {
        name: trimmedName,
        version: trimmedVersion,
        type: trimmedType,
        author: trimmedAuthor,
        description: trimmedDescription || undefined,
        tags: tags.length ? tags : undefined,
        schema: buildJsonSchema(fields, {
          name: trimmedName,
          version: trimmedVersion,
          description: trimmedDescription || undefined,
        }),
      });
      if (error) {
        setError(apiErrorMessage(error, 'Could not create the schema.'));
      } else {
        setResult(data ?? null);
        setName('');
        setFields([]);
        setDescription('');
        setTagsInput('');
        setAuthor((current) =>
          dids.some((record) => record.did === current) ? current : '',
        );
        onCreated?.();
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
        <h2 className="text-lg font-semibold text-ink">Create schema</h2>
        <p className="mt-1 text-sm text-slate-700">
          Create a credential schema. Choose an author DID and add the claims it
          will carry.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Version</span>
          <input
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="font-medium">Author</span>
          <select
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
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
          <span className="font-medium">Type</span>
          <input
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>

      {didsError && <p className="text-sm text-red-600">{didsError}</p>}
      {!didsLoading && dids.length === 0 && (
        <p className="text-sm text-slate-700">
          Create a prism DID first, then refresh this page or the DID list.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-ink">
        <span className="font-medium">Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="rounded-md border border-line px-3 py-2 text-sm text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        <span className="font-medium">Tags</span>
        <input
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
          className="rounded-md border border-line px-3 py-2 text-sm text-ink"
        />
        <span className="text-xs text-slate-600">comma-separated</span>
      </label>

      <SchemaFieldBuilder
        fields={fields}
        onChange={setFields}
        preview={buildJsonSchema(fields, {
          name: name.trim() || 'schema',
          version: version.trim() || '0.0.0',
          description: description.trim() || undefined,
        })}
      />

      <div>
        <button
          type="button"
          onClick={create}
          disabled={loading || dids.length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create schema'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result != null && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink">Created schema</p>
          <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
            {result.uuid}
          </pre>
        </div>
      )}
    </section>
  );
}

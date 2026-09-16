import type { ChangeEvent } from 'react';

export const SCHEMA_FIELD_TYPES = [
  'string',
  'integer',
  'number',
  'boolean',
] as const;
export type SchemaFieldType = (typeof SCHEMA_FIELD_TYPES)[number];

export const SCHEMA_STRING_FORMATS = [
  'email',
  'date',
  'date-time',
  'uri',
  'uuid',
] as const;
export type SchemaStringFormat = (typeof SCHEMA_STRING_FORMATS)[number];

export const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type SchemaFieldDraft = {
  /** Client-only React key. Never sent to the API. */
  id: string;
  name: string;
  type: SchemaFieldType;
  format: SchemaStringFormat | '';
  required: boolean;
  description: string;
};

export type JsonSchemaMeta = {
  name: string;
  version: string;
  description?: string;
};

const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/** JSON Schema object suitable as the POST body `schema` field. */
export type BuiltJsonSchema = {
  $id: string;
  $schema: typeof JSON_SCHEMA_DRAFT;
  description?: string;
  type: 'object';
  properties: Record<
    string,
    {
      type: SchemaFieldType;
      format?: SchemaStringFormat;
      description?: string;
    }
  >;
  required: string[];
  additionalProperties: false;
};

function newFieldId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `field-${Date.now()}-${Math.random()}`;
}

/**
 * Empty draft row for the field composer. Defaults to an optional string with
 * no format, name, or description.
 */
export function createEmptyField(): SchemaFieldDraft {
  return {
    id: newFieldId(),
    name: '',
    type: 'string',
    format: '',
    required: false,
    description: '',
  };
}

/**
 * Trim, lowercase, replace runs of non-alphanumerics with `-`, then strip
 * leading and trailing hyphens. Empty results become `schema`.
 */
function slug(name: string): string {
  const value = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value || 'schema';
}

/**
 * Compose a draft-2020-12 object schema from scalar field drafts. Empty names
 * are skipped; empty format and description values are omitted.
 */
export function buildJsonSchema(
  fields: SchemaFieldDraft[],
  meta: JsonSchemaMeta,
): BuiltJsonSchema {
  const properties: BuiltJsonSchema['properties'] = {};
  const required: string[] = [];

  for (const field of fields) {
    if (!field.name) continue;

    const property: BuiltJsonSchema['properties'][string] = {
      type: field.type,
    };
    if (field.type === 'string' && field.format) {
      property.format = field.format;
    }
    if (field.description) {
      property.description = field.description;
    }
    properties[field.name] = property;

    if (field.required) {
      required.push(field.name);
    }
  }

  const schema: BuiltJsonSchema = {
    $id: `urn:schema:${slug(meta.name)}:${meta.version}`,
    $schema: JSON_SCHEMA_DRAFT,
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };

  if (meta.description) {
    schema.description = meta.description;
  }

  return schema;
}

function patchField(
  fields: SchemaFieldDraft[],
  id: string,
  patch: Partial<SchemaFieldDraft>,
): SchemaFieldDraft[] {
  return fields.map((field) =>
    field.id === id ? { ...field, ...patch } : field,
  );
}

/**
 * Presentational field composer for credential schema claims. The parent owns
 * the draft list and the live preview object; this component only calls
 * `onChange` with a new array.
 */
export function SchemaFieldBuilder({
  fields,
  onChange,
  preview,
}: {
  fields: SchemaFieldDraft[];
  onChange: (fields: SchemaFieldDraft[]) => void;
  /** JSON Schema object to show in the live preview (parent computes it). */
  preview: unknown;
}) {
  const setType = (id: string, type: SchemaFieldType) => {
    onChange(
      fields.map((field) =>
        field.id === id
          ? { ...field, type, format: type === 'string' ? field.format : '' }
          : field,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Fields</h2>
        <p className="mt-1 text-sm text-slate-700">
          Add the claims this credential schema will carry.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => onChange([...fields, createEmptyField()])}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-slate-50"
        >
          Add field
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-slate-700">
          No fields yet. Add at least one field.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {fields.map((field) => (
            <li
              key={field.id}
              className="flex flex-col gap-3 rounded-md border border-line bg-slate-50 p-3"
            >
              <label className="flex flex-col gap-1 text-sm text-ink">
                <span className="font-medium">Name</span>
                <input
                  value={field.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(
                      patchField(fields, field.id, {
                        name: event.target.value,
                      }),
                    )
                  }
                  className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
                />
                {field.name !== '' && !FIELD_NAME_PATTERN.test(field.name) ? (
                  <span className="text-xs text-slate-600">
                    Use a letter or underscore first, then letters, digits, or
                    underscores.
                  </span>
                ) : null}
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm text-ink">
                  <span className="font-medium">Type</span>
                  <select
                    value={field.type}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setType(field.id, event.target.value as SchemaFieldType)
                    }
                    className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
                  >
                    {SCHEMA_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                {field.type === 'string' ? (
                  <label className="flex flex-col gap-1 text-sm text-ink">
                    <span className="font-medium">Format</span>
                    <select
                      value={field.format}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        onChange(
                          patchField(fields, field.id, {
                            format: event.target.value as
                              SchemaStringFormat | '',
                          }),
                        )
                      }
                      className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
                    >
                      <option value="">(none)</option>
                      {SCHEMA_STRING_FORMATS.map((format) => (
                        <option key={format} value={format}>
                          {format}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(
                      patchField(fields, field.id, {
                        required: event.target.checked,
                      }),
                    )
                  }
                />
                <span className="font-medium">Required</span>
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                <span className="font-medium">Description</span>
                <input
                  value={field.description}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    onChange(
                      patchField(fields, field.id, {
                        description: event.target.value,
                      }),
                    )
                  }
                  className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink"
                />
              </label>

              <div>
                <button
                  type="button"
                  onClick={() =>
                    onChange(fields.filter((item) => item.id !== field.id))
                  }
                  className="text-sm text-slate-600 hover:text-ink"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
        {JSON.stringify(preview, null, 2)}
      </pre>
    </div>
  );
}

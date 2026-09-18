/**
 * Read-only view of a credential schema's definition: the field table and the
 * raw JSON Schema under it. Shared by the schema detail page; the shapes are
 * the ones `GET /api/schemas/:uuid` returns.
 */

type JsonSchemaLike = {
  properties?: Record<string, unknown>;
  required?: string[];
};

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

export function SchemaDefinition({ schema }: { schema: JsonSchemaLike }) {
  const propertyEntries = schema.properties
    ? Object.entries(schema.properties)
    : [];
  const required = new Set(schema.required ?? []);

  return (
    <div className="flex flex-col gap-3">
      {propertyEntries.length === 0 ? (
        <p className="text-sm text-slate-700">No fields on this schema.</p>
      ) : (
        <div className="overflow-auto rounded-md border border-line bg-white">
          <table className="w-full text-left text-sm text-ink">
            <thead>
              <tr className="border-b border-line text-xs font-medium uppercase tracking-wide text-slate-600">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Format</th>
                <th className="px-3 py-2 font-medium">Required</th>
              </tr>
            </thead>
            <tbody>
              {propertyEntries.map(([name, value]) => {
                const { type, format } = propertyMeta(value);
                return (
                  <tr key={name} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium">{name}</td>
                    <td className="px-3 py-2">{type ?? '—'}</td>
                    <td className="px-3 py-2">{format ?? '—'}</td>
                    <td className="px-3 py-2">{required.has(name) ? 'yes' : 'no'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <pre className="overflow-auto rounded-md bg-slate-50 p-4 text-xs text-ink">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </div>
  );
}

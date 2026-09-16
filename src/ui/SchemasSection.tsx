import { useState } from 'react';
import { CreateSchema } from './CreateSchema';
import { SchemaList } from './SchemaList';

/**
 * Landing-page (and future route) bundle for credential schemas.
 * Owns the list refresh token so App.tsx does not.
 */
export function SchemasSection() {
  const [listVersion, setListVersion] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <CreateSchema onCreated={() => setListVersion((version) => version + 1)} />
      <SchemaList refreshToken={listVersion} />
    </div>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { CreateSchema } from '../../CreateSchema';

/**
 * `/issuer/schemas/new`: the schema composer on its own page. A successful
 * create lands on the page of the schema that was just written.
 */
export function SchemaCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <Link
          to="/issuer/schemas"
          className="text-slate-600 transition hover:text-ink"
        >
          ← Schemas
        </Link>
      </p>
      <CreateSchema
        onCreated={(uuid) => navigate(`/issuer/schemas/${uuid}`)}
      />
    </div>
  );
}

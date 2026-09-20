import { Link, useSearchParams } from 'react-router-dom';
import { DidResolver } from '../../DidResolver';

/**
 * `/dids/resolve`: the resolver on its own page. The DID rides in the address
 * (`?did=`), so a resolved document can be linked, refreshed and reached
 * straight from a row of the list.
 */
export function DidResolvePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const did = searchParams.get('did') ?? '';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <Link to="/dids" className="text-slate-600 transition hover:text-ink">
          ← DIDs
        </Link>
      </p>
      <DidResolver did={did} onRequest={(value) => setSearchParams({ did: value })} />
    </div>
  );
}

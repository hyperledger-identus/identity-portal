import { Link, useNavigate } from 'react-router-dom';
import { CreateDid } from '../../CreateDid';

/**
 * `/dids/new`: the DID composer on its own page. A successful create goes back
 * to the list, which names the DID that was just made.
 */
export function DidCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <Link to="/dids" className="text-slate-600 transition hover:text-ink">
          ← DIDs
        </Link>
      </p>
      <CreateDid
        onCreated={(did) => navigate('/dids', { state: { created: did } })}
      />
    </div>
  );
}

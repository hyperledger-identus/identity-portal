import { Link, useNavigate } from 'react-router-dom';
import { CreateOffer } from '../../CreateOffer';

/**
 * `/issuer/offers/new`: the offer composer on its own page. A successful
 * create lands on the page of the offer that was just made, where the
 * invitation URL is ready to copy.
 */
export function OfferCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <Link
          to="/issuer/offers"
          className="text-slate-600 transition hover:text-ink"
        >
          ← Offers
        </Link>
      </p>
      <CreateOffer
        onCreated={(recordId) =>
          navigate(`/issuer/offers/${encodeURIComponent(recordId)}`)
        }
      />
    </div>
  );
}

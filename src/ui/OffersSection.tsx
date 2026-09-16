import { useState } from 'react';
import { CreateOffer } from './CreateOffer';
import { OfferList } from './OfferList';

/**
 * Landing-page (and future route) bundle for issuer credential offers.
 * Owns the list refresh token so App.tsx does not.
 */
export function OffersSection() {
  const [listVersion, setListVersion] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <CreateOffer onCreated={() => setListVersion((version) => version + 1)} />
      <OfferList refreshToken={listVersion} />
    </div>
  );
}

import { useState } from 'react';
import { CreateDid } from '../CreateDid';
import { DidResolver } from '../DidResolver';
import { DidList } from '../DidList';

/**
 * The DID area as one page: create and resolve side by side, the list below.
 * Creating a DID bumps `listVersion` so the list refreshes, exactly as the
 * one-page dashboard wired it before the routes existed.
 */
export function DidsPage() {
  const [listVersion, setListVersion] = useState(0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <CreateDid onCreated={() => setListVersion((version) => version + 1)} />
        <DidResolver />
      </div>
      <DidList refreshToken={listVersion} />
    </div>
  );
}

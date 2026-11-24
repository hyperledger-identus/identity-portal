import { describe, expect, it } from 'vitest';

import { decodeJwtPayload, jwtFromAttachmentData, requesterDid } from './jwt';

const HOLDER_DID = 'did:prism:a4ffac6ebc7c1af12975c4be9aa80692c8bd8863f1aafc094a24352132958987:CskBCsYB';

function fakeJwt(payload: unknown): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'ES256K' })}.${part(payload)}.signature`;
}

describe('decodeJwtPayload', () => {
  it('reads the payload of a compact JWT', () => {
    expect(decodeJwtPayload(fakeJwt({ iss: HOLDER_DID, nonce: 'n' }))).toEqual({ iss: HOLDER_DID, nonce: 'n' });
  });

  it('gives undefined for something that is not a JWT', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeUndefined();
    expect(decodeJwtPayload('a.%%%.c')).toBeUndefined();
    expect(decodeJwtPayload(42)).toBeUndefined();
  });
});

describe('jwtFromAttachmentData', () => {
  const jwt = fakeJwt({ iss: HOLDER_DID });

  it('reads base64 of the JWT text, as the SDK stores a JWT credential request', () => {
    expect(jwtFromAttachmentData({ base64: Buffer.from(jwt).toString('base64') })).toBe(jwt);
  });

  it('reads base64 of a JSON string', () => {
    expect(jwtFromAttachmentData({ base64: Buffer.from(JSON.stringify(jwt)).toString('base64') })).toBe(jwt);
  });

  it('reads a JWT kept as a JSON string', () => {
    expect(jwtFromAttachmentData({ json: jwt })).toBe(jwt);
  });
});

describe('requesterDid', () => {
  it('is the iss of the request JWT', () => {
    const data = { base64: Buffer.from(fakeJwt({ iss: HOLDER_DID, aud: 'x', nonce: 'y' })).toString('base64') };
    expect(requesterDid(data)).toBe(HOLDER_DID);
  });

  it('is undefined when there is no JWT or no DID in iss', () => {
    expect(requesterDid(undefined)).toBeUndefined();
    expect(requesterDid({ json: { not: 'a jwt' } })).toBeUndefined();
    expect(requesterDid({ base64: Buffer.from(fakeJwt({ iss: 'someone' })).toString('base64') })).toBeUndefined();
  });
});

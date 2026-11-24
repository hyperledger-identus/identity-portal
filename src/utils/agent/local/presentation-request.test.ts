import { describe, expect, it } from 'vitest';

import {
  buildPresentationRequest,
  presentedClaimsFromSubmission,
  readPresentationRequest,
  trustedIssuerPattern,
} from './presentation-request';

const SHORT_DID = 'did:prism:1111111111111111111111111111111111111111111111111111111111111111';
const LONG_DID = `${SHORT_DID}:CmEKXxJdCghtYXN0ZXItMBABQk8KCXNlY3AyNTZrMRIg`;
const OTHER_DID = 'did:prism:2222222222222222222222222222222222222222222222222222222222222222';

function ids(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

describe('buildPresentationRequest', () => {
  it('asks for every claim with any value, on the three paths the SDK reads', () => {
    const request = buildPresentationRequest(
      { claims: ['name', 'age'], trustIssuers: [], domain: 'did:peer:verifier' },
      ids(),
    );
    const [descriptor] = request.presentation_definition.input_descriptors;

    expect(descriptor.constraints.limit_disclosure).toBe('required');
    expect(descriptor.constraints.fields).toEqual([
      {
        id: 'id-1',
        name: 'name',
        path: ['$.vc.credentialSubject.name', '$.credentialSubject.name', '$.name'],
        optional: false,
        filter: { type: 'string', pattern: '.*' },
      },
      {
        id: 'id-2',
        name: 'age',
        path: ['$.vc.credentialSubject.age', '$.credentialSubject.age', '$.age'],
        optional: false,
        filter: { type: 'string', pattern: '.*' },
      },
    ]);
  });

  it('adds an issuer field only when there are trusted issuers', () => {
    const withoutIssuers = buildPresentationRequest(
      { claims: ['name'], trustIssuers: [], domain: 'd' },
      ids(),
    );
    expect(withoutIssuers.presentation_definition.input_descriptors[0].constraints.fields).toHaveLength(1);

    const withIssuers = buildPresentationRequest(
      { claims: ['name'], trustIssuers: [SHORT_DID], domain: 'd' },
      ids(),
    );
    const issuerField = withIssuers.presentation_definition.input_descriptors[0].constraints.fields[1];
    expect(issuerField.name).toBe('issuer');
    expect(issuerField.path).toEqual(['$.vc.issuer', '$.issuer', '$.iss', '$.vc.iss']);
    expect(issuerField.filter).toEqual({ type: 'string', pattern: trustedIssuerPattern([SHORT_DID]) });
  });

  it('uses JWT with ES256K, a new challenge and the given domain', () => {
    const request = buildPresentationRequest(
      { claims: ['name'], trustIssuers: [], domain: 'did:peer:verifier' },
      ids(),
    );
    expect(request.presentation_definition.format).toEqual({ jwt: { alg: ['ES256K'] } });
    expect(request.presentation_definition.input_descriptors[0].format).toEqual({ jwt: { alg: ['ES256K'] } });
    // ids: field id-1, definition id-2, descriptor id-3, challenge id-4
    expect(request.options).toEqual({ challenge: 'id-4', domain: 'did:peer:verifier' });
  });
});

describe('trustedIssuerPattern', () => {
  it('matches the DID, and the long form of a short Prism DID', () => {
    const pattern = new RegExp(trustedIssuerPattern([SHORT_DID]));
    expect(pattern.test(SHORT_DID)).toBe(true);
    expect(pattern.test(LONG_DID)).toBe(true);
  });

  it('does not match another DID, or a longer DID that starts the same way', () => {
    const pattern = new RegExp(trustedIssuerPattern([SHORT_DID]));
    expect(pattern.test(OTHER_DID)).toBe(false);
    expect(pattern.test(`${SHORT_DID}0`)).toBe(false);
    expect(pattern.test(`x${SHORT_DID}`)).toBe(false);
  });

  it('matches any of several issuers', () => {
    const pattern = new RegExp(trustedIssuerPattern([SHORT_DID, OTHER_DID]));
    expect(pattern.test(SHORT_DID)).toBe(true);
    expect(pattern.test(OTHER_DID)).toBe(true);
    expect(pattern.test('did:prism:3333')).toBe(false);
  });

  it('treats regular expression characters in a DID as plain text', () => {
    const pattern = new RegExp(trustedIssuerPattern(['did:example:a.b+c']));
    expect(pattern.test('did:example:a.b+c')).toBe(true);
    expect(pattern.test('did:example:aXbbc')).toBe(false);
  });
});

describe('readPresentationRequest', () => {
  it('reads back the claims and the trusted issuers of a built request', () => {
    const request = buildPresentationRequest(
      { claims: ['name', 'age'], trustIssuers: [SHORT_DID, 'did:example:a.b+c|d'], domain: 'd' },
      ids(),
    );
    expect(readPresentationRequest(request)).toEqual({
      claims: ['name', 'age'],
      trustIssuers: [SHORT_DID, 'did:example:a.b+c|d'],
    });
  });

  it('gives no issuers when the request has none', () => {
    const request = buildPresentationRequest({ claims: ['name'], trustIssuers: [], domain: 'd' }, ids());
    expect(readPresentationRequest(request)).toEqual({ claims: ['name'], trustIssuers: [] });
  });

  it('reads the issuer of a request built by the SDK, where the pattern is the DID itself', () => {
    const request = buildPresentationRequest({ claims: ['name'], trustIssuers: [SHORT_DID], domain: 'd' }, ids());
    request.presentation_definition.input_descriptors[0].constraints.fields[1].filter.pattern = LONG_DID;
    expect(readPresentationRequest(request).trustIssuers).toEqual([LONG_DID]);
  });

  it('rejects a request without a presentation definition', () => {
    expect(() => readPresentationRequest({ options: {} })).toThrow('Malformed OOB invitation');
  });
});

function fakeJwt(payload: unknown): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'ES256K' })}.${part(payload)}.signature`;
}

describe('presentedClaimsFromSubmission', () => {
  const credential = fakeJwt({
    vc: { credentialSubject: { id: 'did:prism:holder', name: 'Alice', age: 20, adult: false } },
  });
  const submission = {
    presentation_submission: { id: 'p', definition_id: 'd', descriptor_map: [] },
    verifiablePresentation: [fakeJwt({ vp: { verifiableCredential: [credential] } })],
  };

  it('returns the requested claims with their values and types', () => {
    expect(presentedClaimsFromSubmission(submission, ['name', 'age', 'adult'])).toEqual({
      name: 'Alice',
      age: 20,
      adult: false,
    });
  });

  it('leaves out claims that are not in the credential, and claims nobody asked for', () => {
    expect(presentedClaimsFromSubmission(submission, ['name', 'email'])).toEqual({ name: 'Alice' });
  });

  it('returns nothing for a malformed presentation', () => {
    expect(presentedClaimsFromSubmission({ verifiablePresentation: ['not-a-jwt'] }, ['name'])).toEqual({});
    expect(presentedClaimsFromSubmission(undefined, ['name'])).toEqual({});
  });
});

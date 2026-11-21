/**
 * The DIF Presentation Exchange request that the local verifier puts in an
 * OOB presentation request. The shape follows the one the SDK builds for
 * `initiatePresentationRequest` (the same paths, `limit_disclosure` and ES256K
 * format), so the SDK checks a proof against it the same way. It has no SDK
 * import, so it can be tested on its own.
 */

/** Attachment format of a DIF presentation definition in Present Proof 3.0. */
export const PRESENTATION_DEFINITION_FORMAT = 'dif/presentation-exchange/definitions@v1.0';

type FieldFilter = { type: string; pattern: string };

export type PresentationField = {
  id: string;
  name: string;
  path: string[];
  optional: false;
  filter: FieldFilter;
};

type JwtFormat = { jwt: { alg: string[] } };

export type PresentationRequestJson = {
  presentation_definition: {
    id: string;
    input_descriptors: Array<{
      id: string;
      name: string;
      purpose: string;
      constraints: { fields: PresentationField[]; limit_disclosure: 'required' };
      format: JwtFormat;
    }>;
    format: JwtFormat;
  };
  options: { challenge: string; domain: string };
};

export type PresentationRequestInput = {
  /** Names of the claims the credential must have. */
  claims: string[];
  /** Issuer DIDs the verifier trusts. Empty: any issuer. */
  trustIssuers: string[];
  /** `options.domain`: who asks for the proof. */
  domain: string;
};

/**
 * "The claim must be there, with any value." The SDK (8.1.4) accepts a field
 * only when its filter has `pattern` or `enum`: with only `type`, or with no
 * filter, the check answers "Expected one of the paths ... to exist" even when
 * the claim is there.
 */
const ANY_VALUE: FieldFilter = { type: 'string', pattern: '.*' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches one of the trusted issuer DIDs. A Prism long-form DID is the short
 * form plus `:` and the encoded state, so a short form also matches the long
 * form of the same DID, and no other DID.
 */
export function trustedIssuerPattern(issuers: string[]): string {
  return `^(?:${issuers.map(escapeRegExp).join('|')})(?::|$)`;
}

/** Builds the request. `newId` makes every id and the challenge. */
export function buildPresentationRequest(
  input: PresentationRequestInput,
  newId: () => string,
): PresentationRequestJson {
  const fields: PresentationField[] = input.claims.map((name) => ({
    id: newId(),
    name,
    path: [`$.vc.credentialSubject.${name}`, `$.credentialSubject.${name}`, `$.${name}`],
    optional: false,
    filter: ANY_VALUE,
  }));
  if (input.trustIssuers.length > 0) {
    fields.push({
      id: newId(),
      name: 'issuer',
      path: ['$.vc.issuer', '$.issuer', '$.iss', '$.vc.iss'],
      optional: false,
      filter: { type: 'string', pattern: trustedIssuerPattern(input.trustIssuers) },
    });
  }

  const format: JwtFormat = { jwt: { alg: ['ES256K'] } };
  return {
    presentation_definition: {
      id: newId(),
      input_descriptors: [
        {
          id: newId(),
          name: 'Presentation',
          purpose: 'Verifying Credentials',
          constraints: { fields, limit_disclosure: 'required' },
          format,
        },
      ],
      format,
    },
    options: { challenge: newId(), domain: input.domain },
  };
}

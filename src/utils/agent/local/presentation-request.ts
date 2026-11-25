/**
 * The DIF Presentation Exchange request that the local verifier puts in an
 * OOB presentation request. The shape follows the one the SDK builds for
 * `initiatePresentationRequest` (the same paths, `limit_disclosure` and ES256K
 * format), so the SDK checks a proof against it the same way. It has no SDK
 * import, so it can be tested on its own.
 */

import { decodeJwtPayload } from './jwt';

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

const SHORT_PRISM_DID = /^did:prism:[0-9a-f]{64}$/;

/** A Prism long-form DID is the short form plus `:` and the encoded state. */
const LONG_FORM_STATE = '(?::[A-Za-z0-9_-]+)?';

function issuerAlternative(did: string): string {
  const exact = escapeRegExp(did);
  return SHORT_PRISM_DID.test(did) ? exact + LONG_FORM_STATE : exact;
}

/**
 * Matches one of the trusted issuer DIDs exactly. A short Prism DID also
 * matches its long form; a DID of any other kind matches only itself.
 */
export function trustedIssuerPattern(issuers: string[]): string {
  return `^(?:${issuers.map(issuerAlternative).join('|')})$`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Turns a pattern made by `trustedIssuerPattern` back into the DIDs. */
function issuersFromPattern(pattern: string): string[] {
  const match = /^\^\(\?:(.*)\)\$$/.exec(pattern);
  if (!match) {
    // The SDK's own requests use the issuer DID itself as the pattern.
    return pattern.startsWith('did:') ? [pattern] : [];
  }
  return match[1]
    .split(/(?<!\\)\|/)
    .map((part) => (part.endsWith(LONG_FORM_STATE) ? part.slice(0, -LONG_FORM_STATE.length) : part))
    .map((part) => part.replace(/\\(.)/g, '$1'))
    .filter((did) => did !== '');
}

/**
 * Reads the claim names and the trusted issuers back from a request, for the
 * holder's preview. A request from another tool may use other filters: then
 * the issuers it cannot read are left out.
 */
export function readPresentationRequest(request: unknown): {
  claims: string[];
  trustIssuers: string[];
} {
  const definition = isRecord(request) ? request.presentation_definition : undefined;
  const descriptors = isRecord(definition) ? definition.input_descriptors : undefined;
  const first = Array.isArray(descriptors) ? descriptors[0] : undefined;
  const constraints = isRecord(first) ? first.constraints : undefined;
  const fields = isRecord(constraints) ? constraints.fields : undefined;
  if (!Array.isArray(fields)) {
    throw new Error('Malformed OOB invitation: the request has no presentation definition');
  }

  const claims: string[] = [];
  const trustIssuers: string[] = [];
  for (const field of fields) {
    if (!isRecord(field)) {
      continue;
    }
    const filter = isRecord(field.filter) ? field.filter : undefined;
    if (field.name === 'issuer') {
      if (typeof filter?.pattern === 'string') {
        trustIssuers.push(...issuersFromPattern(filter.pattern));
      }
    } else if (typeof field.name === 'string') {
      claims.push(field.name);
    }
  }
  return { claims, trustIssuers };
}

/**
 * The values of the requested claims in a JWT presentation: the presentation
 * JWT holds the credential JWT, and its `vc.credentialSubject` has the claims.
 * It only decodes; the SDK checks the signatures before this is called.
 */
export function presentedClaimsFromSubmission(
  submission: unknown,
  names: string[],
): Record<string, unknown> {
  const presentations = isRecord(submission) ? submission.verifiablePresentation : undefined;
  const vp = decodeJwtPayload(Array.isArray(presentations) ? presentations[0] : undefined)?.vp;
  const credentials = isRecord(vp) ? vp.verifiableCredential : undefined;
  const vc = decodeJwtPayload(Array.isArray(credentials) ? credentials[0] : undefined)?.vc;
  const subject = isRecord(vc) ? vc.credentialSubject : undefined;
  if (!isRecord(subject)) {
    return {};
  }
  const claims: Record<string, unknown> = {};
  for (const name of names) {
    if (name in subject) {
      claims[name] = subject[name];
    }
  }
  return claims;
}

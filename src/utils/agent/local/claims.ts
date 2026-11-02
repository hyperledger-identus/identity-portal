import type { CollectionMap } from '@hyperledger/identus-sdk';

/**
 * How the local agent keeps the claims of an issuance row. The SDK
 * `IssuanceSchema` stores claims as `{ name, value, type }[]` with string
 * values; the portal API speaks a JSON object. These helpers are the two
 * directions of that mapping, kept free of runtime SDK imports so they can be
 * tested on their own.
 */

/**
 * Every `type` a stored claim row can have. The portal writes `string`,
 * `number` and `boolean`, and `json` for an object, an array or `null`, whose
 * value is JSON text. `date` is never written by the portal but is read.
 */
export const CLAIM_TYPES = ['string', 'number', 'boolean', 'json', 'date'] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number];

/**
 * The stored `type` of a row as a `ClaimType`, or `undefined` for a type the
 * portal does not know. The SDK types the field as a plain `string`.
 */
export function storedClaimType(
  claim: CollectionMap['issuance']['claims'][number],
): ClaimType | undefined {
  return (CLAIM_TYPES as readonly string[]).includes(claim.type)
    ? (claim.type as ClaimType)
    : undefined;
}

export function stringifyClaimValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Strings, numbers and booleans keep their JSON type. Everything else is
 * stored as JSON text with its own type, so a string that only looks like
 * JSON is never parsed by mistake.
 */
function claimValueType(value: unknown): ClaimType {
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  return 'json';
}

/** The persist-side map: a JSON object of claims to stored claim rows. */
export function toStoredClaims(
  claims: Record<string, unknown>,
): CollectionMap['issuance']['claims'] {
  return Object.entries(claims).map(([name, value]) => ({
    name,
    value: stringifyClaimValue(value),
    type: claimValueType(value),
  }));
}

/**
 * One stored claim row back to its JSON value, by its stored `type`. A row of
 * any other type, `string` included, is returned as the stored text. A row
 * whose text does not parse back keeps the stored text.
 */
function restoreClaimValue(
  claim: CollectionMap['issuance']['claims'][number],
): unknown {
  switch (storedClaimType(claim)) {
    case 'number': {
      const value = Number(claim.value);
      return Number.isFinite(value) ? value : claim.value;
    }
    case 'boolean':
      return claim.value === 'true';
    case 'json':
      try {
        return JSON.parse(claim.value);
      } catch {
        return claim.value;
      }
    default:
      return claim.value;
  }
}

/** Reverse of `toStoredClaims`: the claims object the portal API answers. */
export function claimsToRecord(
  claims: CollectionMap['issuance']['claims'],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const claim of claims) {
    record[claim.name] = restoreClaimValue(claim);
  }
  return record;
}

/**
 * The claims the issuer signs into the credential subject. Same values as
 * `claimsToRecord`, so the credential carries what the offer shows; `date`
 * rows become `Date` values.
 */
export function claimsToSubject(
  claims: CollectionMap['issuance']['claims'],
): Record<string, unknown> {
  const subject: Record<string, unknown> = {};
  for (const claim of claims) {
    subject[claim.name] =
      storedClaimType(claim) === 'date'
        ? new Date(claim.value)
        : restoreClaimValue(claim);
  }
  return subject;
}

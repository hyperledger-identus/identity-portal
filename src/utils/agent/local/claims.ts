import type { CollectionMap } from '@hyperledger/identus-sdk';

/**
 * How the local agent keeps the claims of an issuance row. The SDK
 * `IssuanceSchema` stores claims as `{ name, value, type }[]` with string
 * values; the portal API speaks a JSON object. These helpers are the two
 * directions of that mapping, kept free of runtime SDK imports so they can be
 * tested on their own.
 */

/** Stored `type` of an object, an array or `null`: its value is JSON text. */
const JSON_CLAIM_TYPE = 'json';

export function stringifyClaimValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Strings, numbers and booleans keep their JSON type. Everything else is
 * stored as JSON text with its own type, so a string that only looks like
 * JSON is never parsed by mistake.
 */
function claimValueType(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value;
  }
  return JSON_CLAIM_TYPE;
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
  if (claim.type === 'number') {
    const value = Number(claim.value);
    return Number.isFinite(value) ? value : claim.value;
  }
  if (claim.type === 'boolean') {
    return claim.value === 'true';
  }
  if (claim.type === JSON_CLAIM_TYPE) {
    try {
      return JSON.parse(claim.value);
    } catch {
      return claim.value;
    }
  }
  return claim.value;
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
      claim.type === 'date' ? new Date(claim.value) : restoreClaimValue(claim);
  }
  return subject;
}

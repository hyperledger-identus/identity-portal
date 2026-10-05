import type { CollectionMap } from '@hyperledger/identus-sdk';

/**
 * How the local agent keeps the claims of an issuance row. The SDK
 * `IssuanceSchema` stores claims as `{ name, value, type }[]` with string
 * values; the portal API speaks a JSON object. These helpers are the two
 * directions of that mapping, kept free of runtime SDK imports so they can be
 * tested on their own.
 */

export function stringifyClaimValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function claimValueType(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value;
  }
  return 'string';
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
 * Object/array values were JSON.stringified by `toStoredClaims`; parse those
 * back. Plain strings stay strings.
 */
function parseStoredClaimValue(value: string): unknown {
  const trimmed = value.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * One stored claim row back to its JSON value. Numbers and booleans are
 * restored from the stored `type`; everything else goes through
 * `parseStoredClaimValue`.
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
  return parseStoredClaimValue(claim.value);
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

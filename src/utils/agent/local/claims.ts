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
 * Reverse of `toStoredClaims`. Numbers and booleans are restored from the
 * stored `type`, the way `claimsObject` in the inbox restores them for the
 * issued credential; everything else goes through `parseStoredClaimValue`.
 */
export function claimsToRecord(
  claims: CollectionMap['issuance']['claims'],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const claim of claims) {
    if (claim.type === 'number') {
      const value = Number(claim.value);
      record[claim.name] = Number.isFinite(value) ? value : claim.value;
    } else if (claim.type === 'boolean') {
      record[claim.name] = claim.value === 'true';
    } else {
      record[claim.name] = parseStoredClaimValue(claim.value);
    }
  }
  return record;
}

/**
 * The part of a held credential's id that goes into the address of its page.
 *
 * The local agent has no short id for a held credential: its `id` is the whole
 * JWT, a few kilobytes that do not belong in a URL or in the browser history.
 * The key is the tail of that id instead, which for a JWT is the end of its
 * signature: unique per credential and free of claims. A short id, such as the
 * record id the cloud agent reports, is used whole.
 */
const SHORT_ID_LENGTH = 64;
const KEY_LENGTH = 32;

export function credentialKey(id: string): string {
  return id.length <= SHORT_ID_LENGTH ? id : id.slice(-KEY_LENGTH);
}

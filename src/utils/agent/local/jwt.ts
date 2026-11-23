/**
 * Reads JWTs without checking them. The SDK checks signatures where it matters;
 * these helpers only read fields. No SDK import, so they can be tested.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The payload of a compact JWT, or `undefined` when it is not one. */
export function decodeJwtPayload(jwt: unknown): Record<string, unknown> | undefined {
  if (typeof jwt !== 'string') {
    return undefined;
  }
  const [, payload] = jwt.split('.');
  if (!payload) {
    return undefined;
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return isRecord(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The JWT inside a DIDComm attachment's `data`: either `base64` of the JWT
 * text, or the JWT as a JSON string.
 */
export function jwtFromAttachmentData(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  if (typeof data.base64 === 'string') {
    const text = Buffer.from(data.base64, 'base64').toString('utf8').trim();
    if (text.startsWith('"')) {
      try {
        const value: unknown = JSON.parse(text);
        return typeof value === 'string' ? value : undefined;
      } catch {
        return undefined;
      }
    }
    return text;
  }
  return typeof data.json === 'string' ? data.json : undefined;
}

/**
 * The DID that signed a JWT credential request: its `iss`. The holder's SDK
 * signs the request with a new Prism DID, so this is the subject the
 * credential has to be issued to.
 */
export function requesterDid(attachmentData: unknown): string | undefined {
  const iss = decodeJwtPayload(jwtFromAttachmentData(attachmentData))?.iss;
  return typeof iss === 'string' && iss.startsWith('did:') ? iss : undefined;
}

import { HttpError } from '../../utils/rest';

/**
 * The local agent refuses to update or deactivate a DID that was never
 * published, with a plain `Error` whose message says so. The request is well
 * formed and the DID exists; its state does not allow the operation, so it is a
 * 409, not a 500. Any other error is rethrown as it is.
 */
export function mapDIDStateError(error: unknown): never {
  if (
    error instanceof Error &&
    / must be published before it can be /.test(error.message)
  ) {
    throw HttpError.Conflict(error.message);
  }
  throw error;
}

import { describe, expect, it } from 'vitest';

import { HttpError } from '../../utils/rest';
import { mapDIDStateError } from './errors';

function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

describe('mapDIDStateError', () => {
  it.each(['updated', 'deactivated'])(
    'turns the "must be published before it can be %s" refusal into a 409',
    (verb) => {
      const message = `DID did:prism:abc must be published before it can be ${verb}`;
      const error = thrownBy(() => mapDIDStateError(new Error(message)));

      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(409);
      expect((error as HttpError).message).toBe(message);
    },
  );

  it('rethrows any other error unchanged', () => {
    const original = new Error('Cloud Agent could not update did:prism:abc (HTTP 422)');

    expect(thrownBy(() => mapDIDStateError(original))).toBe(original);
  });

  it('rethrows a value that is not an Error unchanged', () => {
    expect(thrownBy(() => mapDIDStateError('boom'))).toBe('boom');
  });
});

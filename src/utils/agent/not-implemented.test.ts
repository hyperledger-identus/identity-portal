import { describe, expect, it } from 'vitest';

import { notImplementedHolderPresentations, notImplementedVerifier } from './not-implemented';

describe('phase 6 placeholders', () => {
  it('reject every verifier method with the method name', async () => {
    const { presentations } = notImplementedVerifier();
    await expect(presentations.createOobRequest({ claims: ['age'] })).rejects.toThrow(
      'verifier.presentations.createOobRequest is not implemented yet (phase 6, #108).',
    );
    await expect(presentations.listRequests(0, 10)).rejects.toThrow('verifier.presentations.listRequests');
    await expect(presentations.getRequest('id')).rejects.toThrow('verifier.presentations.getRequest');
  });

  it('reject every holder presentation method with the method name', async () => {
    const presentations = notImplementedHolderPresentations();
    await expect(presentations.preview('oob')).rejects.toThrow('holder.presentations.preview');
    await expect(presentations.accept('oob', 'credential-id')).rejects.toThrow('holder.presentations.accept');
    await expect(presentations.reject('oob')).rejects.toThrow('holder.presentations.reject');
  });
});

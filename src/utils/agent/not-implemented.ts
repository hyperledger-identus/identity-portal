import type { Agent } from './types';

/**
 * Placeholders for phase 6 (#108, OOB verification) until the local and cloud
 * agents implement it. Every method rejects with a clear error instead of
 * returning `undefined`. Delete this file when both agents have the real code.
 */
function notImplemented(method: string): () => Promise<never> {
  return async () => {
    throw new Error(`${method} is not implemented yet (phase 6, #108).`);
  };
}

export function notImplementedVerifier(): Agent['verifier'] {
  return {
    presentations: {
      createOobRequest: notImplemented('verifier.presentations.createOobRequest'),
      listRequests: notImplemented('verifier.presentations.listRequests'),
      getRequest: notImplemented('verifier.presentations.getRequest'),
    },
  };
}

export function notImplementedHolderPresentations(): Agent['holder']['presentations'] {
  return {
    preview: notImplemented('holder.presentations.preview'),
    accept: notImplemented('holder.presentations.accept'),
    reject: notImplemented('holder.presentations.reject'),
  };
}

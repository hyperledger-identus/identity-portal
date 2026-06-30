import { Domain } from '@hyperledger/identus-sdk';
import { RESOLVER_URL } from '../../../config';

/**
 * Resolves `did:prism` DIDs by delegating to the NeoPRISM resolver endpoint
 * (`RESOLVER_URL`). NeoPRISM answers `GET <RESOLVER_URL><did>` with a W3C DID
 * Resolution Result, from which we read the embedded `didDocument`.
 */
export class CustomPrismDIDResolver extends Domain.DIDResolver {
  method = 'prism';

  async resolve(didString: string) {
    const response = await fetch(`${RESOLVER_URL}${didString}`, {
      headers: { accept: 'application/did+ld+json' },
    });

    const body = await response.json();
    // NeoPRISM wraps the document in a DID Resolution Result; fall back to the
    // raw body for resolvers that return a bare document.
    const didDocument = body?.didDocument ?? body;

    if (!response.ok || didDocument == null) {
      const detail =
        body?.didResolutionMetadata?.error?.detail ?? response.statusText;
      throw new Error(
        `Could not resolve ${didString} via ${RESOLVER_URL} (${response.status}): ${detail}`,
      );
    }

    return Domain.DIDDocument.fromJSON(didDocument);
  }
}

/**
 * Custom `did:prism` method wired to resolve through NeoPRISM. Resolution is the
 * only operation needed here; creation and signing belong to later issues and
 * throw if invoked.
 */
export class CustomPrismDIDMethod {
  readonly method = 'prism' as const;
  readonly resolver: Domain.DIDResolver = new CustomPrismDIDResolver();

  async create(): Promise<Domain.DID> {
    throw new Error('CustomPrismDIDMethod.create is not implemented (resolution only)');
  }

  async verifySignature(): Promise<boolean> {
    throw new Error(
      'CustomPrismDIDMethod.verifySignature is not implemented (resolution only)',
    );
  }
}

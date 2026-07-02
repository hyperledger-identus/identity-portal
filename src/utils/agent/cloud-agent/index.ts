import { Domain } from '@hyperledger/identus-sdk';
import { CLOUD_AGENT_BASE_URL } from '../../../config';
import { Agent, PrismDIDKeyCurves } from '../types';
import { createClient } from './client';

export type CloudAgentOptions = {
  /**
   * The end-user's Keycloak access token. When present it is attached as a
   * `Bearer` credential to every request the client makes, so the agent
   * resolves calls to that user's wallet. A token-less client is only useful
   * for unauthenticated/public endpoints.
   */
  accessToken?: string;
};

/**
 * Builds a Cloud Agent client. The returned client is *already authenticated*:
 * the access token (when provided) is baked into the underlying HTTP client, so
 * callers just use `agent.dids.listDIDs()` without threading a token around.
 *
 * Instances are cheap (a `fetch` wrapper), so one is created per request with
 * the current session's token (see `getRequestAgent`).
 */
export async function createCloudAgentClient(
  options: CloudAgentOptions = {},
): Promise<Agent> {
  const client = createClient({
    baseUrl: CLOUD_AGENT_BASE_URL,
    headers: options.accessToken
      ? { Authorization: `Bearer ${options.accessToken}` }
      : undefined,
  });

  return {
    start: async () => {
      console.log('Starting Cloud Agent');
    },
    stop: async () => {
      console.log('Stopping Cloud Agent');
    },
    dids: {
      resolveDID: async (did: string) => {
        // Mirrors the SDK's built-in Prism resolver: fetch the W3C DID document
        // (did+ld+json) and parse it into a Domain.DIDDocument. The typed client
        // returns non-JSON content as a text, so JSON.parse it before fromJSON.
        const { data, error, response } = await client.GET('/dids/{didRef}', {
          params: { didRef: did },
          headers: { Accept: 'application/did+ld+json' },
        });

        if (!response.ok || error) {
          throw new Error(
            `Cloud Agent could not resolve ${did} (HTTP ${response.status})`,
          );
        }
        const document = typeof data === 'string' ? JSON.parse(data) : data;
        return Domain.DIDDocument.fromJSON(document);
      },
      prism: {
        list: () => {
          throw new Error('Not implemented');
        },
        create: (keys: PrismDIDKeyCurves) => {
          /**
           * Use
           * client.POST("/did-registrar/dids", { })
           *
           * The Cloud-agent internally checks which masterKey to use and creates + published the operation for you
           */
          throw new Error('Not implemented');
        },
        publish: (did: Domain.DID) => {
          /**
           * Use
           * client.POST("/did-registrar/dids/{didRef}/publications", { params: { didRef: 'did.toString()'}})
           *
           * The Cloud-agent internally checks which masterKey to use and creates + published the operation for you
           */
          throw new Error('Not implemented');
        },
        deactivate: (did: Domain.DID) => {
          /**
           * Use
           * client.POST("/did-registrar/dids/{didRef}/deactivations", { params: { didRef: 'did.toString()'}})
           *
           * The Cloud-agent internally checks which masterKey to use and creates + published the operation for you
           */
          throw new Error('Not implemented');
        },
      },
    },
  };
}

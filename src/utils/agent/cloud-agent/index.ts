import { DIDKeys, Domain } from '@hyperledger/identus-sdk';
import { CLOUD_AGENT_BASE_URL } from '../../../config';
import { Agent, CredentialSchemaInput, PrismDIDKeyCurves } from '../types';
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
        list: async () => {
          // The registrar paginates with `offset`/`limit` and returns 100 DIDs per
          // page by default. The generic client cannot pass those parameters yet:
          // the spec emits `query?` when every query parameter is optional, and
          // `QueryParamsOf` in src/utils/openapi.ts only matches a required `query`.
          // Until that is addressed this reads the first page, so a wallet holding
          // more than 100 DIDs is truncated here.
          const { data, error, response } = await client.GET(
            '/did-registrar/dids',
          );

          if (!response.ok || error) {
            throw new Error(
              `Cloud Agent could not list DIDs (HTTP ${response.status})`,
            );
          }

          return (data?.contents ?? []).map((managed) => {
            // A published DID is identified by its canonical form. An unpublished
            // one only resolves through its long form, which is also what create
            // returns.
            const value =
              managed.status === 'PUBLISHED'
                ? managed.did
                : (managed.longFormDid ?? managed.did);
            return Domain.DID.fromString(value);
          });
        },
        create: async (keys: PrismDIDKeyCurves) => {
          /**
           * Use
           * client.POST("/did-registrar/dids", { })
           *
           * The Cloud-agent internally checks which masterKey to use and creates + published the operation for you
          */

          const publicKeys = Object.keys(keys).reduce((allPublicKeys, keyType) => {
            const curves = keys[keyType as keyof DIDKeys]!
            return [
              ...allPublicKeys,
              ...curves.map((curve, i) => {
                if (keyType === 'ISSUING_KEY') {
                  return {
                    "id": `${keyType}-${i}`,
                    "purpose": "assertionMethod" as const,
                    "curve": curve.toString().toLowerCase()
                  }
                }
                if (keyType === 'AUTHENTICATION_KEY') {
                  return {
                    "id": `${keyType}-${i}`,
                    "purpose": "authentication" as const,
                    "curve": curve.toString().toLowerCase()
                  }
                }
                if (keyType === 'CAPABILITY_DELEGATION_KEY') {
                  return {
                    "id": `${keyType}-${i}`,
                    "purpose": "capabilityDelegation" as const,
                    "curve": curve.toString().toLowerCase()
                  }
                }
                if (keyType === 'CAPABILITY_INVOCATION_KEY') {
                  return {
                    "id": `${keyType}-${i}`,
                    "purpose": "capabilityInvocation" as const,
                    "curve": curve.toString().toLowerCase()
                  }
                }
                if (keyType === 'KEY_AGREEMENT_KEY') {
                  return {
                    "id": `${keyType}-${i}`,
                    "purpose": "keyAgreement" as const,
                    "curve": curve.toString().toLowerCase()
                  }
                }
                throw new Error("Key type not supported");
              })
            ]
          }, [] as { id: string, purpose: any, curve: any }[])




          const { data, error, response } = await client.POST("/did-registrar/dids", {
            body: {
              "documentTemplate": {
                "publicKeys": publicKeys,
                "services": []
              }
            }
          });

          if (!response.ok || error) {
            throw new Error(
              `Cloud Agent could not create DID (HTTP ${response.status})`,
            );
          }
          const payload = typeof data === 'string' ? JSON.parse(data) : data;
          return Domain.DID.fromString(payload.longFormDid)
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
    schemas: {
      list: () => {
        /**
         * Use
         * client.GET('/schema-registry/schemas', {})
         *
         * Paginated response, map its contents to CollectionMap['schemas'] records
         */
        throw new Error('Not implemented');
      },
      get: (uuid: string) => {
        /**
         * Use
         * client.GET('/schema-registry/schemas/{guid}', { params: { guid: uuid } })
         */
        throw new Error('Not implemented');
      },
      create: (schema: CredentialSchemaInput) => {
        /**
         * Use
         * client.POST('/schema-registry/schemas', { body: ... })
         *
         * The Cloud-agent signs the schema and issues it from its own DID
         */
        throw new Error('Not implemented');
      },
      update: (uuid: string, schema: Partial<CredentialSchemaInput>) => {
        /**
         * Use
         * client.PUT('/schema-registry/schemas/{id}', { params: { id: uuid }, body: ... })
         *
         * The registry publishes a new schema version, it does not edit in place
         */
        throw new Error('Not implemented');
      },
      delete: (uuid: string) => {
        /**
         * The schema registry is append-only, there is no DELETE endpoint.
         * We need to decide if we block this in cloud mode or hide the action.
         */
        throw new Error('Not implemented');
      },
    },
  };
}

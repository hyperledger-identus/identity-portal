/**
 * @module API
 *
 * Type-safe Cloud Agent client. This is just the shared, generic
 * {@link createOpenApiClient} bound to the Cloud Agent spec's `paths` type —
 * the implementation lives in `../openapi-client`.
 *
 * Regenerate the underlying types from the running Cloud Agent with:
 *   curl -s http://localhost:8085/docs/docs.yaml -o prism-openapi.yaml
 *   npx openapi-typescript ./prism-openapi.yaml -o ./src/utils/agent/cloud-agent/spec.ts
 *
 * @category API
 */
import {
  createOpenApiClient,
  type ClientOptions,
  type OpenApiClient,
} from '../../openapi';
import type { paths } from './spec';

export type {
  ClientOptions,
  FetchResult,
  ResponseBodyOf,
  PathsWithMethod,
  HttpMethod,
} from '../../openapi';

export type CloudAgentClient = OpenApiClient<paths>;

/**
 * Creates a type-safe client for the Cloud Agent.
 *
 * ```ts
 * const agent = createClient({ baseUrl: 'http://localhost:8085' });
 * const { data, error } = await agent.GET('/did-registrar/dids/{longFormDid}', {
 *   params: { longFormDid: 'did:prism:...' },
 * });
 * ```
 */
export function createClient(clientOptions: ClientOptions): CloudAgentClient {
  return createOpenApiClient<paths>(clientOptions);
}

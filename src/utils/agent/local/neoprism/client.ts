/**
 * @module NeoPrism API
 *
 * Type-safe NeoPrism node client. This is just the shared, generic
 * {@link createOpenApiClient} bound to the NeoPrism spec's `paths` type — the
 * implementation lives in `../../openapi-client`.
 *
 * Regenerate the underlying types from the running NeoPrism node with:
 *   curl -s http://localhost:8080/docs/openapi.yml -o openapi.yml
 *   npx openapi-typescript ./openapi.yml -o ./src/utils/agent/local/neoprism/spec.ts
 *
 * @category API
 */
import {
  createOpenApiClient,
  type ClientOptions,
  type OpenApiClient,
} from '../../../openapi';
import type { paths } from './spec';

export type {
  ClientOptions,
  FetchResult,
  ResponseBodyOf,
  PathsWithMethod,
  HttpMethod,
} from '../../../openapi';

export type NeoPrismClient = OpenApiClient<paths>;

/**
 * Creates a type-safe client for the NeoPrism node.
 *
 * ```ts
 * const neoprism = createClient({ baseUrl: 'http://localhost:8080' });
 * const { data, error } = await neoprism.GET('/api/dids/{did}', {
 *   params: { did: 'did:prism:...' },
 * });
 * ```
 */
export function createClient(clientOptions: ClientOptions): NeoPrismClient {
  return createOpenApiClient<paths>(clientOptions);
}

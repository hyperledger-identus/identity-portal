import { NEOPRISM_BASE_URL } from '../../../../config';
import { createClient, type ClientOptions, type NeoPrismClient } from './client';

export type { paths, components, operations } from './spec';
export {
  createClient,
  type ClientOptions,
  type NeoPrismClient,
  type FetchResult,
  type ResponseBodyOf,
  type PathsWithMethod,
  type HttpMethod,
} from './client';

export type NeoPrismOptions = {
  /**
   * Override the NeoPrism node base URL. Defaults to {@link NEOPRISM_BASE_URL}
   * (the `NEOPRISM_BASE_URL` env var, or `http://localhost:8081`).
   */
  baseUrl?: string;
  /** Extra headers attached to every request. */
  headers?: Record<string, string>;
};

/**
 * Builds a type-safe NeoPrism node client pointing at the configured node.
 *
 * ```ts
 * const neoprism = createNeoPrismClient();
 * const { data } = await neoprism.GET('/api/dids/{did}', {
 *   params: { did: 'did:prism:...' },
 * });
 * ```
 */
export function createNeoPrismClient(
  options: NeoPrismOptions = {},
): NeoPrismClient {
  const clientOptions: ClientOptions = {
    baseUrl: options.baseUrl ?? NEOPRISM_BASE_URL,
    headers: options.headers,
  };
  return createClient(clientOptions);
}

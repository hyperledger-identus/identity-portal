/**
 * @module API
 *
 * ## Type-safe Portal API client
 *
 * A fully-typed client for the Portal's own REST API. Every type — request
 * inputs (path params, query, body) and response bodies — is inferred at
 * compile time from the Zod route definitions via {@link AppRouter}.
 *
 * There is **no code generation step**: `AppRouter` is imported with
 * `import type`, so this file compiles to plain `fetch` calls and the server
 * code (Express, the route handlers, etc.) is never pulled into the browser
 * bundle.
 *
 * ```ts
 * import { api } from './utils/api';
 *
 * const { data, error } = await api.POST('/dids', { did: 'did:peer:...' });
 * if (error) {
 *   // `error` is the parsed error payload
 * } else {
 *   data.success; // typed: { success: false; error: string }
 * }
 * ```
 *
 * @category API
 */
import type { AppRouter } from '../../../api/registry';
import { ApiClient, ClientMethod, ClientOptions, HttpMethod, RequestOptions } from './types';


/** Default base path the Portal API is mounted under (see `createAPIRouter`). */
export const DEFAULT_API_BASE_URL = '/api';

const BODY_METHODS = new Set<HttpMethod>(['post', 'put', 'patch']);

function buildRequest(
  baseUrl: string,
  method: HttpMethod,
  path: string,
  input: unknown,
): { url: string; body?: string; hasBody: boolean } {
  const rest: Record<string, unknown> =
    input && typeof input === 'object' ? { ...(input as object) } : {};

  // Substitute Express-style path params (`:id`) from the input object.
  let resolved = path;
  for (const match of path.matchAll(/:(\w+)/g)) {
    const key = match[1];
    resolved = resolved.replace(
      `:${key}`,
      encodeURIComponent(String(rest[key])),
    );
    delete rest[key];
  }

  let url = `${baseUrl.replace(/\/$/, '')}${resolved}`;

  if (BODY_METHODS.has(method)) {
    const hasBody = Object.keys(rest).length > 0;
    return { url, body: hasBody ? JSON.stringify(rest) : undefined, hasBody };
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) search.append(key, String(value));
  }
  const qs = search.toString();
  if (qs) url += `?${qs}`;
  return { url, hasBody: false };
}

/**
 * Creates a type-safe client for the Portal API.
 *
 * `baseUrl` defaults to `/api`, which works when the frontend is served from
 * the same origin as the API (the default deployment).
 */
export function createApiClient<Routes = AppRouter>(
  options: ClientOptions = {},
): ApiClient<Routes> {
  const baseUrl = options.baseUrl ?? DEFAULT_API_BASE_URL;
  const doFetch = options.fetch ?? fetch;

  const method =
    <M extends HttpMethod>(verb: M): ClientMethod<Routes, M> =>
    (async (
      path: string,
      input?: unknown,
      requestOptions?: RequestOptions,
    ) => {
      const { url, body, hasBody } = buildRequest(baseUrl, verb, path, input);
      const response = await doFetch(url, {
        method: verb.toUpperCase(),
        headers: {
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
          ...requestOptions?.headers,
        },
        body,
        signal: requestOptions?.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => undefined)
        : await response.text().catch(() => undefined);

      return response.ok
        ? { data: payload, response }
        : { error: payload, response };
    }) as ClientMethod<Routes, M>;

  return {
    GET: method('get'),
    POST: method('post'),
    PUT: method('put'),
    PATCH: method('patch'),
    DELETE: method('delete'),
  };
}
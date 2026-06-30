/**
 * @module API
 *
 * ## Route group registry
 *
 * The single source of truth for which route groups exist and where they are
 * mounted. The runtime router ([createAPIRouter](./index.ts)) iterates this map
 * to mount routes, and the type-safe client ([client.ts](./client.ts)) derives
 * its entire type surface from {@link AppRouter} — which is computed from these
 * same factories. No code generation step is involved: the client types are
 * extracted directly from the Zod route definitions at compile time.
 *
 * ### Adding a new route group
 *
 * 1. Create `src/api/<name>/index.ts` exporting a `createRestRouter` factory as
 *    its default export.
 * 2. Add an entry below with the base path it should be mounted under.
 *
 * @category API
 */
import type {
  ContextFactory,
  EndpointType,
  InferRoutes,
  RestRouter,
} from '../utils/rest';

import createDidsRouter from './dids';

/** A factory that builds a validated router bound to a per-request context. */
export type RouteGroupFactory = (createContext: ContextFactory) => RestRouter;

/**
 * All API route groups, keyed by the base path they are mounted under
 * (relative to `/api`). Keep base paths unique and prefixed with one slash.
 */
export const routeGroups = {
  '/dids': createDidsRouter,
} satisfies Record<string, RouteGroupFactory>;

export type RouteGroups = typeof routeGroups;

/** Joins a base path with a route path, collapsing the index route (`/`). */
type JoinPath<B extends string, P extends string> = P extends '/'
  ? B
  : `${B}${P}`;

/** Re-keys a group's routes from `"<method> <path>"` to full mount paths. */
type PrefixRoutes<B extends string, R> = {
  [K in keyof R as K extends `${infer M} ${infer P}`
    ? `${M} ${JoinPath<B, P>}`
    : never]: R[K];
};

type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * The complete API surface: a map from `"<method> <full path>"` to the
 * endpoint's inferred `{ input; output }` types, merged across all groups.
 *
 * ```ts
 * AppRouter = {
 *   "get /dids":  { input: void;          output: { success: false; error: string } };
 *   "post /dids": { input: { did: string }; output: { success: false; error: string } };
 * }
 * ```
 */
export type AppRouter = UnionToIntersection<
  {
    [B in keyof RouteGroups]: PrefixRoutes<
      B & string,
      InferRoutes<ReturnType<RouteGroups[B]>>
    >;
  }[keyof RouteGroups]
>;

/** Re-exported for convenience when working with the client. */
export type { EndpointType };

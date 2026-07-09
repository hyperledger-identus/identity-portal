import { createRequire } from "node:module";

/**
 * The `@hyperledger/identus-sdk` ESM build (esbuild output) ships a `require`
 * shim that throws `Dynamic require of "crypto" is not supported` whenever it
 * can't find a CommonJS `require` in scope. That's the case under Node's native
 * ESM loader — used by `tsx` (dev), `vitest`, and now the production bundle
 * (`dist/main.js` is emitted as ESM) — so the SDK blows up on first use of Node
 * built-ins like `crypto`.
 *
 * Publishing a real `require` on the global scope makes that shim resolve Node
 * built-ins normally. It must run before any module that pulls in the SDK:
 * - dev (`tsx`) / tests (`vitest`): imported as the first statement of
 *   `main.ts`, so it evaluates ahead of the SDK's module graph.
 * - production: the bundled `dist/main.js` is ESM, where the SDK's dependency
 *   graph evaluates before `main.js`'s body — too late for an inline import.
 *   So it's loaded as a Node preload instead:
 *   `node --import ./dist/require-shim.js dist/main.js` (see package.json).
 */
const globalScope = globalThis as typeof globalThis & { require?: NodeRequire };

if (typeof globalScope.require === "undefined") {
  globalScope.require = createRequire(import.meta.url);
}

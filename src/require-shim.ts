import { createRequire } from "node:module";

/**
 * The `@hyperledger/identus-sdk` ESM build (esbuild output) ships a `require`
 * shim that throws `Dynamic require of "crypto" is not supported` whenever it
 * can't find a CommonJS `require` in scope. That's exactly the case under
 * Node's native ESM loader used by `tsx` (dev) and `vitest`, so the SDK blows
 * up on first use of Node built-ins like `crypto`.
 *
 * Publishing a real `require` on the global scope makes that shim resolve Node
 * built-ins normally. This must be imported before any module that pulls in the
 * SDK. It's a no-op under the CommonJS production bundle (`dist/main.cjs`),
 * where a module-scoped `require` already exists.
 */
const globalScope = globalThis as typeof globalThis & { require?: NodeRequire };

if (typeof globalScope.require === "undefined") {
  globalScope.require = createRequire(import.meta.url);
}

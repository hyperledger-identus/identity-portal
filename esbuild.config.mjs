// Bundles the Express + Identus server into a single CommonJS file at
// `dist/main.cjs`. Third-party packages are kept external (many, like the
// Identus SDK and RIDB, ship wasm/native assets that must not be inlined), so
// `node_modules` must be present at runtime alongside `dist/`.
import * as esbuild from "esbuild";

const isProduction = process.env.NODE_ENV === "production";

await esbuild.build({
  // `require-shim` is emitted as a standalone module so it can be loaded via
  // `node --import ./dist/require-shim.js` ahead of `main.js`. Under ESM the
  // SDK's dependency graph evaluates before `main.js`'s body, so an inline
  // import of the shim runs too late — the preload guarantees `globalThis.require`
  // exists before any SDK code that relies on it.
  entryPoints: ["src/main.ts", "src/require-shim.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: !isProduction,
  logLevel: "info",
});

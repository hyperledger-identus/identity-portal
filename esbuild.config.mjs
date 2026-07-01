// Bundles the Express + Identus server into a single CommonJS file at
// `dist/main.cjs`. Third-party packages are kept external (many, like the
// Identus SDK and RIDB, ship wasm/native assets that must not be inlined), so
// `node_modules` must be present at runtime alongside `dist/`.
import * as esbuild from "esbuild";

const isProduction = process.env.NODE_ENV === "production";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
  sourcemap: !isProduction,
  logLevel: "info",
});

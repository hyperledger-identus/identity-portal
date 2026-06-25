import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Resolve paths relative to this config file so they don't depend on the
// process working directory (the server bundle runs from the repo root).
const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(projectRoot, "src/ui"),
  plugins: [react()],
  build: {
    outDir: resolve(projectRoot, "../../dist/apps/portal/src/ui"),
    emptyOutDir: true,
  },
});

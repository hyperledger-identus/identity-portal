import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Decoupled from vite.config.ts (whose `root` is scoped to src/ui for the UI
// build) so tests are discovered across the whole `src` tree. UI component
// tests can opt into jsdom per file with `// @vitest-environment jsdom`.
const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  test: {
    include: [resolve(projectRoot, "src/**/*.{test,spec}.{ts,tsx}")],
    environment: "node",
    passWithNoTests: true,
  },
});

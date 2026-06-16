import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 12_000,
    setupFiles: ["./tests/setup.ts"],
    reporters: ["verbose"],
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});

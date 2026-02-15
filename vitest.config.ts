import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/server/clients/renderer/**",
        "src/server/clients/cloudflare-r2/**",
        "src/server/services/image-cache/image-cache-r2-sync.ts"
      ],
      thresholds: {
        statements: 95,
        lines: 95,
        functions: 95
      }
    }
  }
});

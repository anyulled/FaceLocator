import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "playwright-report/**", "test-results/**"],
    coverage: {
      provider: "v8",
      include: [
        "lib/**/*.ts",
        "middleware.ts",
        "components/**/*.tsx",
        "app/api/**/*.ts",
        "lambdas/**/lib.js",
      ],
      exclude: [
        "lib/admin/auth.ts",
        "lib/admin/page-auth.ts",
        "lib/admin/client.ts",
        "lib/admin/events/http.ts",
        "lib/page-metadata.ts",
        "app/api/admin/callback/**",
        "app/api/admin/login/**",
        "app/api/admin/logout/**",
        "components/admin/events/selfies-manager.tsx",
        "tests/e2e/**",
        "**/*.d.ts",
        "app/**/page.tsx",
        "app/**/layout.tsx",
        "app/**/error.tsx",
        "app/**/not-found.tsx",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 80,
        functions: 80,
      },
      reporter: ["text", "lcov", "json-summary"],
    },
  },
});

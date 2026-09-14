import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // tests/e2e uses Playwright's own test runner (`npm run test:e2e`),
    // not Vitest - excluded here so `npm test` does not try to execute
    // Playwright-syntax specs and fail confusingly.
    exclude: ["**/node_modules/**", "**/tests/e2e/**"],
  },
  resolve: {
    alias: {
      // Loop 24: needed to import API route modules directly in tests
      // (they use the same "@/..." alias tsconfig.json defines for
      // Next.js's own bundler, which Vitest does not resolve on its
      // own).
      "@": path.resolve(__dirname, "src"),
    },
  },
});

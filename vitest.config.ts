import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/e2e uses Playwright's own test runner (`npm run test:e2e`),
    // not Vitest - excluded here so `npm test` does not try to execute
    // Playwright-syntax specs and fail confusingly.
    exclude: ["**/node_modules/**", "**/tests/e2e/**"],
  },
});

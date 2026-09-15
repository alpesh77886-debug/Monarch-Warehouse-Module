import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // tests/e2e uses Playwright's own test runner (`npm run test:e2e`),
    // not Vitest - excluded here so `npm test` does not try to execute
    // Playwright-syntax specs and fail confusingly.
    exclude: ["**/node_modules/**", "**/tests/e2e/**"],
    // Loop 39: root-causes a flake documented (but only worked around,
    // never fixed) across several prior loops - live-mutation test files
    // each open their own better-sqlite3 connection to the SAME local D1
    // file (src/lib/db.ts's whole design), and Vitest's default file
    // parallelism runs multiple files concurrently in separate worker
    // threads. Two connections writing to one SQLite file at the same
    // moment intermittently throws SQLITE_BUSY_SNAPSHOT - a real
    // concurrency artifact of this test setup, not a code defect (every
    // affected file passes cleanly and deterministically in isolation,
    // repeatedly confirmed in prior loops' own investigations). Disabling
    // cross-file parallelism removes the race at its source instead of
    // continuing to re-run until green; the small time cost (all files
    // still run, just one at a time) is worth the reliability.
    fileParallelism: false,
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

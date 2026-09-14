import type { Config } from "drizzle-kit";

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  driver: "d1-http", // migration files are generated only; applied via wrangler d1 (local)
} satisfies Config;

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    // Tests share a single remote Postgres — run files sequentially to
    // avoid cross-file race conditions (e.g. profiles.gym_id UNIQUE).
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // tsconfig sets jsx: "preserve" for Next.js — override for tests so the
  // oxc transformer emits real JS for .tsx test files (React Email templates).
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000, // bru import can be slow on first run (npx)
    hookTimeout: 30_000,
    reporters: ["verbose"],
  },
});

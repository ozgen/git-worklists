import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/test/core/**/*.test.ts",
      "src/test/adapters/**/*.test.ts",
      "src/test/usecases/**/*.test.ts",
      "src/test/utils/**/*.test.ts",
    ],
  },
});

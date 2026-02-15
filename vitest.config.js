Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  esbuild: {
    tsconfigRaw: {
      extends: "./tsconfig.test.json",
    },
  },
});
//# sourceMappingURL=vitest.config.js.map

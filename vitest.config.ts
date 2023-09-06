import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    deps: {
      interopDefault: false,
    },
    includeSource: ["src/**/*.ts"],
  },
});

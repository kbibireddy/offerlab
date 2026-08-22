import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/offerlab/",
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/calculator.js"],
      thresholds: {
        lines: 98,
        functions: 100,
        statements: 98,
        branches: 95
      }
    }
  }
});

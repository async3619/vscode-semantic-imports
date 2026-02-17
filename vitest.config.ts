import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    passWithNoTests: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**", "src/extension.ts"],
      reporter: ["text", "json", "clover"],
    },
  },
});

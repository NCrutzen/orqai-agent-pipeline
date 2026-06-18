import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx", "**/*.test.ts", "**/*.test.tsx"],
    // TDD Guard reporter — writes results to <projectRoot>/.claude/tdd-guard/data/
    // so the PreToolUse guard hook can see real RED/GREEN evidence. projectRoot is
    // the workspace root (one level up from web/, where .claude/tdd-guard lives).
    reporters: [
      "default",
      ["tdd-guard-vitest", { projectRoot: resolve(__dirname, "..") }],
    ],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});

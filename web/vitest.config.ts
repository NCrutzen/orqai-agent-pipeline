import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { VitestReporter } from "tdd-guard-vitest";

// tdd-guard reads test results from <repoRoot>/.claude/tdd-guard/data/test.json.
// The repo root is one level up from web/. Without this reporter wired, the
// tdd-guard PreToolUse hook has zero test-result evidence and blocks every
// implementation edit as "no failing test output provided".
const repoRoot = resolve(__dirname, "..");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx", "**/*.test.ts", "**/*.test.tsx"],
    reporters: ["default", new VitestReporter({ projectRoot: repoRoot })],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});

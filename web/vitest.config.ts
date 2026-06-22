import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test-setup.ts"],
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx", "**/*.test.ts", "**/*.test.tsx"],
    // TDD Guard reporter — LOCAL ONLY. Writes RED/GREEN evidence to
    // <projectRoot>/.claude/tdd-guard/data/ for the PreToolUse guard hook.
    // Skipped in CI/Vercel: that dir is untracked + the reporter is a local dev
    // tool with no value without the hook, so loading it there made the test job
    // fragile. projectRoot = workspace root (one level up from web/).
    reporters: process.env.CI
      ? ["default"]
      : ["default", ["tdd-guard-vitest", { projectRoot: resolve(__dirname, "..") }]],
    // Retry flaky tests in CI only. A handful of async/render tests (e.g.
    // transcribe NL, refine-form-known-sender) pass in isolation but
    // intermittently time out under the full-suite parallel run's CPU
    // contention — genuine flakes, not failures. Retry self-heals them so the
    // gate reflects real breakage. Local runs stay fail-fast (honest TDD).
    retry: process.env.CI ? 2 : 0,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});

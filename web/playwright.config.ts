import { defineConfig, devices } from "@playwright/test";

/**
 * Phase 82.5 minimal Playwright config.
 *
 * Scope: a single 1280x800 snapshot spec in `playwright-snapshots/82.5/`
 * (per SPEC R8 acceptance). No webServer block — the spec is run against a
 * manually-started dev or preview deployment whose URL is passed via
 * `PHASE_82_5_SMOKE_URL`. Future phases can extend `testDir` and add a
 * webServer if/when broader e2e coverage lands.
 */
export default defineConfig({
  testDir: "./playwright-snapshots",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

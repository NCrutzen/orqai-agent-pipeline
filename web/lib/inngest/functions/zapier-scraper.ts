import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCredentials } from "@/lib/credentials/proxy";
import {
  extractWithFallback,
  ZAPIER_SELECTORS,
  captureAnalyticsPageState,
} from "@/lib/zapier/selectors";
import { validateZapierData } from "@/lib/zapier/validators";
import type { SelectorResult } from "@/lib/zapier/types";

/**
 * Inngest cron function that scrapes Zapier analytics twice daily.
 *
 * Flow:
 * 1. scrape-zapier-dashboard: Connect to Browserless.io, load/restore session,
 *    navigate to analytics page, extract metrics with multi-fallback selectors
 * 2. validate-scraped-data: Validate extracted data against Zod schema and
 *    previous snapshots (staleness/drop detection)
 * 3. store-snapshot: Store validated snapshot with raw HTML for debugging
 *
 * Critical patterns (from CLAUDE.md):
 * - playwright-core (NOT playwright)
 * - production-ams.browserless.io (Amsterdam region)
 * - waitUntil: 'domcontentloaded' (NEVER 'networkidle')
 * - Screenshot on error BEFORE browser.close()
 * - JSONB double-encoding fix with while loop
 * - Credentials resolved inside step.run() (NEVER in events)
 */
export const scrapeZapierAnalytics = inngest.createFunction(
  {
    id: "analytics/zapier-scrape",
    retries: 2,
  },
  { cron: "0 8,18 * * *" }, // Twice daily: 8 AM and 6 PM UTC
  async ({ step }) => {
    // Step 1: Scrape Zapier analytics dashboard
    const scraped = await step.run(
      "scrape-zapier-dashboard",
      async () => {
        const { chromium } = await import("playwright-core");
        const admin = createAdminClient();

        // 1. Resolve credential ID from settings table
        const { data: credSetting } = await admin
          .from("settings")
          .select("value")
          .eq("key", "zapier_credential_id")
          .single();

        if (!credSetting?.value) {
          throw new Error(
            "Zapier credential ID not configured in settings table (key: zapier_credential_id)"
          );
        }

        let credentialId = credSetting.value;
        // Handle JSONB double-encoding
        while (
          typeof credentialId === "string" &&
          credentialId.startsWith('"')
        ) {
          credentialId = JSON.parse(credentialId);
        }

        // 2. Decrypt credentials from vault
        const creds = await resolveCredentials(credentialId as string);

        // 3. Load existing session state (if any)
        const { data: sessionData } = await admin
          .from("settings")
          .select("value")
          .eq("key", "zapier_session_state")
          .single();

        let storageState = sessionData?.value ?? null;
        // Handle JSONB double-encoding
        while (typeof storageState === "string") {
          try {
            storageState = JSON.parse(storageState);
          } catch {
            break;
          }
        }

        // 4. Connect to Browserless.io
        const token = process.env.BROWSERLESS_API_TOKEN;
        if (!token) throw new Error("BROWSERLESS_API_TOKEN not configured");

        const wsEndpoint = `wss://production-ams.browserless.io?token=${token}&timeout=60000`;
        const browser = await chromium.connectOverCDP(wsEndpoint, {
          timeout: 30_000,
        });

        try {
          const context = storageState
            ? await browser.newContext({
                storageState: storageState as any,
              })
            : await browser.newContext();
          const page = await context.newPage();

          // 5. Navigate to analytics page
          await page.goto("https://zapier.com/app/settings/analytics", {
            waitUntil: "domcontentloaded", // NEVER networkidle for SPAs
            timeout: 30_000,
          });

          // 6. Check if redirected to login
          const currentUrl = page.url();
          if (
            currentUrl.includes("/login") ||
            currentUrl.includes("/sign-in")
          ) {
            // Perform login
            await page.fill(
              'input[type="email"], input[name="email"]',
              creds.username || creds.email || ""
            );
            await page.fill(
              'input[type="password"], input[name="password"]',
              creds.password || ""
            );
            await page.click('button[type="submit"]');
            await page.waitForURL("**/settings/analytics**", {
              timeout: 30_000,
              waitUntil: "domcontentloaded",
            });
          }

          // 7. Wait for analytics content to render (SPA)
          await page.waitForTimeout(5000); // Allow React to render

          // 8. Capture page state for DOM reconnaissance
          const pageState = await captureAnalyticsPageState(page);

          // 9. Extract metrics using multi-fallback selectors
          const selectorResults: Record<string, SelectorResult> = {};
          for (const [metric, strategies] of Object.entries(
            ZAPIER_SELECTORS
          )) {
            selectorResults[metric] = await extractWithFallback(
              page,
              strategies
            );
          }

          // 10. Parse extracted values into numbers
          const activeZaps = selectorResults.activeZaps?.value
            ? parseInt(selectorResults.activeZaps.value, 10)
            : null;
          const tasksUsed = selectorResults.tasksUsed?.value
            ? parseInt(selectorResults.tasksUsed.value, 10)
            : null;
          const errorCount = selectorResults.errorCount?.value
            ? parseInt(selectorResults.errorCount.value, 10)
            : null;

          // 11. Save updated session state
          const newState = await context.storageState();
          await admin
            .from("settings")
            .upsert(
              { key: "zapier_session_state", value: newState },
              { onConflict: "key" }
            );

          return {
            metrics: {
              activeZaps: activeZaps !== null && isNaN(activeZaps) ? null : activeZaps,
              tasksUsed: tasksUsed !== null && isNaN(tasksUsed) ? null : tasksUsed,
              tasksLimit: null, // Extract if selector found
              errorCount: errorCount !== null && isNaN(errorCount) ? null : errorCount,
              successRatePct: null, // Compute from tasks/errors if available
              topZaps: null, // Extract from table if available
            },
            rawHtml: pageState.html,
            selectorResults,
            pageUrl: pageState.url,
          };
        } catch (err) {
          // Take screenshot before closing on error
          try {
            const pages = browser.contexts()?.[0]?.pages() ?? [];
            if (pages.length > 0) {
              const errorScreenshot = await pages[0].screenshot();
              // Store error screenshot in Supabase Storage for debugging
              await admin.storage
                .from("automations")
                .upload(
                  `zapier-scraper/error-${Date.now()}.png`,
                  errorScreenshot,
                  { contentType: "image/png" }
                );
            }
          } catch {
            /* ignore screenshot errors */
          }
          throw err;
        } finally {
          await browser.close().catch(() => {});
        }
      }
    );

    // Step 2: Validate scraped data
    const validated = await step.run(
      "validate-scraped-data",
      async () => {
        return validateZapierData(scraped.metrics);
      }
    );

    // Step 3: Store snapshot
    const snapshotId = await step.run("store-snapshot", async () => {
      const admin = createAdminClient();

      const { data, error } = await admin
        .from("zapier_snapshots")
        .insert({
          active_zaps: validated.metrics.activeZaps,
          tasks_used: validated.metrics.tasksUsed,
          tasks_limit: validated.metrics.tasksLimit,
          error_count: validated.metrics.errorCount,
          success_rate_pct: validated.metrics.successRatePct,
          top_zaps: validated.metrics.topZaps,
          raw_html: scraped.rawHtml,
          raw_data: {
            selectorResults: scraped.selectorResults,
            pageUrl: scraped.pageUrl,
          },
          validation_status: validated.status,
          validation_warnings: validated.warnings,
          scraped_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to store snapshot: ${error.message}`);
      return data.id;
    });

    // Return result summary
    return {
      snapshotId,
      validationStatus: validated.status,
      warnings: validated.warnings,
      failedSelectors: Object.entries(scraped.selectorResults)
        .filter(([, r]) => r.allFailed)
        .map(([name]) => name),
    };
  }
);

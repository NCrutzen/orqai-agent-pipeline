import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Connect to Browserless.io with optional session reuse via Supabase settings table.
 * Pass a sessionKey to enable session persistence across runs.
 */
export async function connectWithSession(sessionKey?: string): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  // Read lazily. A top-level capture breaks scripts that call
  // dotenv.config() after the import (ES module imports hoist; dotenv
  // runs late; the captured value is undefined).
  const token = process.env.BROWSERLESS_API_TOKEN;
  if (!token) throw new Error("BROWSERLESS_API_TOKEN not configured");
  const wsEndpoint = `wss://production-ams.browserless.io?token=${token}&timeout=600000`;
  const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 120_000 });

  let storageState: string | undefined;

  if (sessionKey) {
    const admin = createAdminClient();
    const { data: setting } = await admin
      .from("settings")
      .select("value")
      .eq("key", sessionKey)
      .single();

    if (setting?.value) {
      let parsed = setting.value;
      while (typeof parsed === "string") parsed = JSON.parse(parsed);
      storageState = parsed;
    }
  }

  const context = storageState
    ? await browser.newContext({ storageState: storageState as never })
    : await browser.newContext();

  const page = await context.newPage();

  // tsx/esbuild compiles arrow functions inside page.evaluate() callbacks
  // with a module-scope `__name` helper that doesn't exist in the browser.
  // The serialized callback throws `ReferenceError: __name is not defined`
  // before any user code runs. addInitScript fires on every navigation, so
  // the polyfill survives both initial load and internal SPA route changes.
  // Passed as a STRING so esbuild doesn't rewrite this expression.
  await context.addInitScript(
    "window.__name = window.__name || function(x){return x}",
  );

  return { browser, context, page };
}

/**
 * Save browser session state to Supabase for reuse in next run.
 */
export async function saveSession(context: BrowserContext, sessionKey: string): Promise<void> {
  const state = await context.storageState();
  const admin = createAdminClient();
  await admin.from("settings").upsert({
    key: sessionKey,
    value: JSON.stringify(state),
  });
}

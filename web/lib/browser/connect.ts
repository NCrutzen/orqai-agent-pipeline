import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createAdminClient } from "@/lib/supabase/admin";

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_API_TOKEN!;

/**
 * Connect to Browserless.io with optional session reuse via Supabase settings table.
 * Pass a sessionKey to enable session persistence across runs.
 */
export async function connectWithSession(sessionKey?: string): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const wsEndpoint = `wss://production-ams.browserless.io?token=${BROWSERLESS_TOKEN}&timeout=60000`;
  const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30_000 });

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

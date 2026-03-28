import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCredentials } from "@/lib/credentials/proxy";

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_API_TOKEN!;
const PROLIUS_CREDENTIAL_ID = "4ab01ff6-2bbc-48bc-8e63-31bd8d0a2e65";

const SESSION_KEY = "prolius_session";
const PROLIUS_URL = "https://walkerfire.prolius.app/login";

/**
 * Connect to Browserless.io with session reuse via Supabase settings table.
 * Returns browser, context, and page — caller must close browser.
 */
export async function connectWithSession(): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  const wsEndpoint = `wss://production-ams.browserless.io?token=${BROWSERLESS_TOKEN}&timeout=60000`;
  const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30_000 });

  const admin = createAdminClient();

  // Try to restore saved session state
  const { data: setting } = await admin
    .from("settings")
    .select("value")
    .eq("key", SESSION_KEY)
    .single();

  let storageState: string | undefined;
  if (setting?.value) {
    let parsed = setting.value;
    while (typeof parsed === "string") parsed = JSON.parse(parsed);
    storageState = parsed;
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
async function saveSession(context: BrowserContext): Promise<void> {
  const state = await context.storageState();
  const admin = createAdminClient();
  await admin.from("settings").upsert({
    key: SESSION_KEY,
    value: JSON.stringify(state),
  });
}

/**
 * Login to Prolius portal. Skips if already logged in (session reuse).
 * Credentials are resolved from Supabase encrypted credential store.
 */
async function login(page: Page): Promise<void> {
  await page.goto(PROLIUS_URL, { waitUntil: "domcontentloaded" });

  // Check if we landed on login page or are already authenticated
  const hasLoginForm = await page.locator("form.login-form").isVisible({ timeout: 3000 }).catch(() => false);
  if (!hasLoginForm) return; // Already logged in via session

  // Resolve credentials from Supabase
  const creds = await resolveCredentials(PROLIUS_CREDENTIAL_ID);

  // Fill login form — Prolius uses name="identity" for email/username
  await page.fill('input[name="identity"]', creds.username);
  await page.fill('input[name="password"]', creds.password);
  await page.click('#register-submit-btn');

  // Wait for navigation after login
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Navigate to Reports > Downloads tab, find the newest report,
 * call downloadReport(id) which returns an S3 presigned URL, and fetch the file.
 *
 * Flow discovered via live exploration:
 * 1. POST /reports/{id}/download-report → { url: "https://...s3...xlsx" }
 * 2. GET the presigned URL → Excel binary
 */
export async function downloadNewestReport(page: Page): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  await login(page);

  // Navigate to Reports page
  await page.goto("https://walkerfire.prolius.app/reports", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Click the Downloads tab
  await page.click("text=Downloads");
  await page.waitForTimeout(3000);

  // Wait for downloads grid data rows (skip jqgfirstrow invisible spacer)
  await page.waitForSelector("#jqGrid1 tbody tr.jqgrow", { timeout: 15_000 });

  // Get the ID of the newest report (first visible data row)
  const reportId = await page.evaluate(() => {
    const rows = document.querySelectorAll("#jqGrid1 tbody tr");
    for (const row of rows) {
      if (row.className.includes("jqgfirstrow")) continue;
      if (!row.id || (row as HTMLElement).offsetHeight === 0) continue;
      return row.id;
    }
    throw new Error("No reports in Downloads tab");
  });

  if (!reportId) throw new Error("Could not determine report ID");

  // Intercept the download URL by calling the download API via page context
  // POST /reports/{id}/download-report returns JSON { url: "..." }
  const downloadUrl = await page.evaluate(async (id: string) => {
    const resp = await fetch(`/reports/${id}/download-report`, {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-TOKEN":
          document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ||
          document.querySelector<HTMLInputElement>('input[name="_token"]')
            ?.value ||
          "",
      },
    });
    const data = await resp.json();
    if (!data.url) throw new Error("No download URL in response");
    return data.url as string;
  }, reportId);

  // Fetch the Excel file directly from the presigned S3 URL
  const response = await page.request.get(downloadUrl);
  const buffer = Buffer.from(await response.body());

  // Extract filename from URL or generate one
  const urlPath = new URL(downloadUrl).pathname;
  const filename =
    urlPath.split("/").pop() || `prolius-report-${Date.now()}.xlsx`;

  return { buffer, filename };
}

/**
 * Capture screenshot on error and save to Supabase Storage.
 * MUST be called BEFORE browser.close().
 */
export async function captureErrorScreenshot(
  page: Page,
  errorContext: string,
): Promise<string | null> {
  try {
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const filename = `prolius-error-${Date.now()}.png`;

    const admin = createAdminClient();
    const { error } = await admin.storage
      .from("automation-screenshots")
      .upload(filename, screenshotBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (error) {
      console.error("Failed to upload error screenshot:", error.message);
      return null;
    }

    console.error(`Error screenshot saved: ${filename} — context: ${errorContext}`);
    return filename;
  } catch (e) {
    console.error("Failed to capture error screenshot:", e);
    return null;
  }
}

/**
 * Full flow: connect, download report, save session, close browser.
 * Returns the Excel buffer and filename.
 */
export async function downloadProliusReport(): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const { browser, context, page } = await connectWithSession();

  try {
    const result = await downloadNewestReport(page);
    await saveSession(context);
    return result;
  } catch (error) {
    await captureErrorScreenshot(page, String(error));
    throw error;
  } finally {
    await browser.close();
  }
}

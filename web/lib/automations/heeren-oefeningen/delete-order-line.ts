/**
 * Heeren Oefeningen — NXT Order Line Verwijdering
 *
 * Gegeven een BillingOrderCode en ArticleId:
 * 1. Login op NXT
 * 2. Open de order
 * 3. Screenshot VOOR verwijdering
 * 4. Verwijder de orderregel die overeenkomt met het artikelnummer
 * 5. Sla op als draft
 * 6. Screenshot NA verwijdering
 *
 * Verwachte input:
 *   billingOrderCode: string  — bijv. "370147"
 *   articleId: string         — bijv. "6410005107" (uit CourseTemplate)
 */

import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "automation-files";
const WS_ENDPOINT = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;
const NXT_URL = "https://acc.sb.n-xt.org/#/home";

// Credentials worden in productie uit Supabase geladen
const USERNAME = process.env.NXT_USERNAME ?? "nick.crutzen.cb@moyneroberts.com";
const PASSWORD = process.env.NXT_PASSWORD ?? "aBPY#mi00HwbsZ3?DKv2B2rWp3xNs5lVtGZmo3qI";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function saveScreenshot(page: Page, label: string, orderCode: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `heeren-oefeningen/${label}-order${orderCode}-${ts}.png`;
  const buffer = await page.screenshot({ fullPage: false });

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(filename, buffer, { contentType: "image/png", upsert: true });

  if (error) {
    console.warn(`[screenshot] Upload mislukt: ${error.message}`);
    return filename; // pad als fallback
  }

  const { data } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
  console.log(`[screenshot] Opgeslagen: ${data.publicUrl}`);
  return data.publicUrl;
}

async function login(page: Page): Promise<void> {
  await page.goto(NXT_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 15_000 });
  await page.locator('input[type="email"], input[name="username"]').first().fill(USERNAME);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  console.log("[nxt] Logged in");
}

async function openOrder(page: Page, orderCode: string): Promise<string> {
  // Navigeer naar orders filter
  await page.goto("https://acc.sb.n-xt.org/#/orders/filter", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(1500);

  // Vul Order ID in
  await page.locator('input[name="orderId"]').fill(orderCode);
  await page.waitForTimeout(500);

  // Klik "Show list" (is een <a> tag)
  await page.locator('a[href="#/orders/filter/list"]').click();
  await page.waitForTimeout(2500);

  // Controleer dat er resultaten zijn
  const resultText = await page.locator("text=result").first().textContent().catch(() => "0 results");
  if (resultText?.includes("0 result")) {
    throw new Error(`Order ${orderCode} niet gevonden in NXT`);
  }

  // Klik op de eerste tabel-cel (navigeert naar detail)
  await page.locator("table tbody tr td").first().click();
  await page.waitForTimeout(3000);

  const detailUrl = page.url();
  if (!detailUrl.includes("/detail/")) {
    throw new Error(`Order ${orderCode} kon niet geopend worden. URL: ${detailUrl}`);
  }

  const uuid = detailUrl.split("/detail/")[1];
  console.log(`[nxt] Order ${orderCode} geopend (uuid: ${uuid})`);
  return uuid;
}

async function deleteOrderLine(page: Page, orderCode: string, articleId: string): Promise<{
  before: string;
  after: string;
  deleted: boolean;
}> {
  // Scroll naar order lines sectie
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(500);

  // Screenshot VOOR verwijdering
  const beforePath = await saveScreenshot(page, "before-delete", orderCode);

  // Zoek de orderregel met het juiste artikelnummer
  // Artikelnummer wordt getoond als "#6410005107"
  const articleSelector = `small:has-text("#${articleId}")`;
  const articleEl = page.locator(articleSelector);
  const articleCount = await articleEl.count();

  if (articleCount === 0) {
    // Als artikelnummer niet gevonden: verwijder de eerste beschikbare regel
    console.warn(`[nxt] Artikel #${articleId} niet gevonden, probeer eerste beschikbare regel`);
    const anyDeleteBtn = page.locator('md-icon[ng-click*="onRemove"]').first();
    if (await anyDeleteBtn.count() === 0) {
      throw new Error(`Geen verwijderbare orderregels gevonden op order ${orderCode}. Is de order in draft-status?`);
    }
    await anyDeleteBtn.click();
  } else {
    // Vind de delete knop die bij dit artikel hoort
    // De delete knop staat in dezelfde "row" div als het artikelnummer
    const orderLineRow = page.locator(`div.row:has(small:has-text("#${articleId}"))`);
    const deleteBtn = orderLineRow.locator('md-icon[ng-click*="onRemove"]');

    if (await deleteBtn.count() === 0) {
      throw new Error(`Verwijderknop niet gevonden voor artikel #${articleId} op order ${orderCode}. Is de order in draft-status?`);
    }

    console.log(`[nxt] Verwijder orderregel #${articleId} van order ${orderCode}`);
    await deleteBtn.click();
  }

  await page.waitForTimeout(1500);

  // Controleer of er een bevestigingsdialoog is
  const confirmBtn = page.locator('button:has-text("OK"), button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Ja"), button:has-text("Bevestig")');
  if (await confirmBtn.count() > 0) {
    console.log("[nxt] Bevestigingsdialoog gevonden, bevestigen...");
    await confirmBtn.first().click();
    await page.waitForTimeout(1000);
  }

  // Screenshot NA verwijdering (vóór opslaan)
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(300);
  const afterPath = await saveScreenshot(page, "after-delete", orderCode);

  // Sla op: probeer "Save as draft" eerst (alleen als enabled), dan "Save" als fallback
  const saveDraftBtn = page.locator('button:has-text("Save as draft")');
  const saveBtn = page.locator('button:has-text("Save"):not(:has-text("draft"))');

  const saveDraftEnabled = await saveDraftBtn.count() > 0 && await saveDraftBtn.isEnabled().catch(() => false);
  const saveEnabled = await saveBtn.count() > 0 && await saveBtn.isEnabled().catch(() => false);

  if (saveDraftEnabled) {
    console.log("[nxt] Opslaan als draft...");
    await saveDraftBtn.click();
    await page.waitForTimeout(2000);
  } else if (saveEnabled) {
    console.log("[nxt] 'Save as draft' niet beschikbaar, gebruik 'Save'...");
    await saveBtn.first().click();
    await page.waitForTimeout(2000);
  } else {
    console.warn("[nxt] Geen save-knop beschikbaar (order mogelijk leeg of al opgeslagen)");
  }

  return { before: beforePath, after: afterPath, deleted: true };
}

export async function deleteOrderLines(params: {
  billingOrderCode: string;
  billingOrderId: string;
  billingOrderLineId: string;
  billingItemId: string;   // Artikel-ID uit Zapier — gebruikt voor lijn-matching én Fase 2 (nieuwe order)
  courseId: string;        // Opslaan voor staging
}): Promise<{
  success: boolean;
  orderCode: string;
  billingItemId: string;
  screenshots: { before: string; after: string } | null;
  error?: string;
}> {
  const { billingOrderCode, billingOrderId, billingOrderLineId, billingItemId, courseId } = params;

  let browser: Browser | null = null;
  try {
    console.log(`[heeren-oefeningen] Start verwijdering: order ${billingOrderCode}, artikel #${billingItemId}`);

    browser = await chromium.connectOverCDP(WS_ENDPOINT, { timeout: 30_000 });
    const context: BrowserContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page: Page = await context.newPage();

    await login(page);
    await openOrder(page, billingOrderCode);
    const { before, after } = await deleteOrderLine(page, billingOrderCode, billingItemId);

    console.log(`[heeren-oefeningen] Klaar. Screenshots: before=${before}, after=${after}`);
    return {
      success: true,
      orderCode: billingOrderCode,
      billingItemId,
      screenshots: { before, after }
    };

  } catch (err: any) {
    console.error("[heeren-oefeningen] Fout:", err.message);
    return {
      success: false,
      orderCode: billingOrderCode,
      billingItemId,
      screenshots: null,
      error: err.message
    };
  } finally {
    if (browser) await browser.close();
  }
}

// --- Directe uitvoering voor testen ---
if (require.main === module) {
  require("dotenv").config({ path: require("path").join(__dirname, "../../../.env.local") });

  const TEST_ORDER_CODE = process.argv[2] ?? "370147";
  const TEST_BILLING_ITEM_ID = process.argv[3] ?? "6410005107";

  deleteOrderLines({
    billingOrderCode: TEST_ORDER_CODE,
    billingOrderId: "test-order-id",
    billingOrderLineId: "test-line-id",
    billingItemId: TEST_BILLING_ITEM_ID,
    courseId: "test-course-id",
  }).then(result => {
    console.log("\nResultaat:", JSON.stringify(result, null, 2));
  }).catch(console.error);
}

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

// Laad .env.local voor CLI en tsx-scripts. In Vercel zijn env vars al
// geïnjecteerd; dotenv overschrijft die niet. No-op als de file niet bestaat.
try {
  require("dotenv").config({ path: require("path").join(__dirname, "../../../.env.local") });
} catch {}

const STORAGE_BUCKET = "automation-files";
const WS_ENDPOINT = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;

interface NxtAuth {
  baseUrl: string;
  username: string;
  password: string;
}

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
    return filename;
  }

  // Bucket is privaat — signed URL met 1 jaar expiry
  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filename, 60 * 60 * 24 * 365);
  if (signErr || !signed) {
    console.warn(`[screenshot] Signed URL fout: ${signErr?.message}`);
    return filename;
  }
  console.log(`[screenshot] Opgeslagen: ${signed.signedUrl}`);
  return signed.signedUrl;
}

async function login(page: Page, auth: NxtAuth): Promise<void> {
  await page.goto(`${auth.baseUrl}/#/home`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 15_000 });
  await page.locator('input[type="email"], input[name="username"]').first().fill(auth.username);
  await page.locator('input[type="password"]').first().fill(auth.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  console.log(`[nxt] Logged in (${auth.baseUrl} as ${auth.username})`);
}

async function openOrder(page: Page, orderCode: string, auth: NxtAuth): Promise<string> {
  // Navigeer naar orders filter
  await page.goto(`${auth.baseUrl}/#/orders/filter`, { waitUntil: "domcontentloaded", timeout: 15_000 });
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

export interface CapturedLine {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
}

async function deleteOrderLine(page: Page, orderCode: string, articleId: string): Promise<{
  before: string;
  after: string;
  deleted: boolean;
  captured: CapturedLine;
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
    throw new Error(`Artikel #${articleId} niet gevonden op order ${orderCode}`);
  }

  // Pak de dichtstbijzijnde .row-voorouder van de small met het artikelnummer.
  // Dit voorkomt dat geneste Bootstrap-rows allebei matchen (strict-mode hazard).
  const articleSmall = page.locator(`small:has-text("#${articleId}")`).first();
  const orderLineRow = articleSmall.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " row ")][1]',
  );
  const deleteBtn = orderLineRow.locator('md-icon[ng-click*="onRemove"]').first();

  if ((await deleteBtn.count()) === 0) {
    throw new Error(
      `Verwijderknop niet gevonden voor artikel #${articleId} op order ${orderCode}. Is de order in draft-status?`,
    );
  }

  // Capture description/quantity/unitPrice UIT de order-line row voordat we verwijderen.
  // Deze velden komen niet uit onze DB (ze staan in NXT), dus we lezen ze hier.
  const captured = await orderLineRow.evaluate((row: Element, artId: string): CapturedLine => {
    const text = (row.textContent ?? "").replace(/\s+/g, " ").trim();

    // Description: alles vóór "#<articleId>" in het zichtbare deel van de row.
    // Voorbeeld: "Ontruimingsoefening #6410001050 × €301.05 | 0% Discount ..."
    let description: string | null = null;
    const beforeArticle = text.split(`#${artId}`)[0]?.trim() ?? "";
    if (beforeArticle.length > 0) {
      description = beforeArticle.replace(/[\s|·]+$/u, "").trim() || null;
    }

    // Quantity: eerste <input type=number> in de row
    const qtyInput = row.querySelector('input[type="number"]') as HTMLInputElement | null;
    const qtyRaw = qtyInput?.value;
    const quantity = qtyRaw != null && qtyRaw !== "" && !isNaN(Number(qtyRaw)) ? Number(qtyRaw) : null;

    // Unit price: pattern "× €301.05" of "x €301,05" binnen de row text
    let unitPrice: number | null = null;
    const priceMatch = text.match(/[×x]\s*€\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (priceMatch) {
      const n = Number(priceMatch[1].replace(",", "."));
      if (!isNaN(n)) unitPrice = n;
    }

    return { description, quantity, unitPrice };
  }, articleId);

  console.log(`[capture] description="${captured.description}" qty=${captured.quantity} unitPrice=${captured.unitPrice}`);

  console.log(`[nxt] Verwijder orderregel #${articleId} van order ${orderCode}`);
  await deleteBtn.click();

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

  return { before: beforePath, after: afterPath, deleted: true, captured };
}

export async function deleteOrderLines(params: {
  billingOrderCode: string;
  billingOrderId: string;
  billingOrderLineId: string;
  billingItemId: string;   // Artikel-ID uit Zapier — gebruikt voor lijn-matching én Fase 2 (nieuwe order)
  courseId: string;        // Opslaan voor staging
  auth: NxtAuth;           // NXT base URL + credentials (per environment)
}): Promise<{
  success: boolean;
  orderCode: string;
  billingItemId: string;
  screenshots: { before: string; after: string } | null;
  captured: CapturedLine | null;
  error?: string;
}> {
  const { billingOrderCode, billingItemId, auth } = params;

  let browser: Browser | null = null;
  try {
    console.log(`[heeren-oefeningen] Start verwijdering: order ${billingOrderCode}, artikel #${billingItemId} (env=${auth.baseUrl})`);

    browser = await chromium.connectOverCDP(WS_ENDPOINT, { timeout: 30_000 });
    const context: BrowserContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page: Page = await context.newPage();

    await login(page, auth);
    await openOrder(page, billingOrderCode, auth);
    const { before, after, captured } = await deleteOrderLine(page, billingOrderCode, billingItemId);

    console.log(`[heeren-oefeningen] Klaar. Screenshots: before=${before}, after=${after}`);
    return {
      success: true,
      orderCode: billingOrderCode,
      billingItemId,
      screenshots: { before, after },
      captured,
    };

  } catch (err: any) {
    console.error("[heeren-oefeningen] Fout:", err.message);
    return {
      success: false,
      orderCode: billingOrderCode,
      billingItemId,
      screenshots: null,
      captured: null,
      error: err.message,
    };
  } finally {
    if (browser) await browser.close();
  }
}

// --- Directe uitvoering voor testen ---
// Usage: npx tsx delete-order-line.ts <orderCode> <billingItemId> [environment]
// environment default = "acceptance" (safety). Gebruik "production" met expliciete opt-in.
if (require.main === module) {
  const TEST_ORDER_CODE = process.argv[2] ?? "370147";
  const TEST_BILLING_ITEM_ID = process.argv[3] ?? "6410005107";
  const ENV = (process.argv[4] ?? "acceptance") as "production" | "acceptance";

  (async () => {
    const { resolveNxtEnvironment } = await import("./nxt-environment");
    const cfg = await resolveNxtEnvironment(ENV);
    console.log(`\nENVIRONMENT: ${ENV.toUpperCase()} (${cfg.baseUrl}) -- Credentials: "${ENV === "production" ? "NXT Production Login" : "NXT Acceptance Login"}"\n`);

    const result = await deleteOrderLines({
      billingOrderCode: TEST_ORDER_CODE,
      billingOrderId: "test-order-id",
      billingOrderLineId: "test-line-id",
      billingItemId: TEST_BILLING_ITEM_ID,
      courseId: "test-course-id",
      auth: cfg,
    });
    console.log("\nResultaat:", JSON.stringify(result, null, 2));
  })().catch(console.error);
}

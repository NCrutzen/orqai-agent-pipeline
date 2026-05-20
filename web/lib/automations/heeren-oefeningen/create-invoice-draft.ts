/**
 * Heeren Oefeningen — Fase 2: Maak een nieuwe NXT order (draft) voor
 * verwijderde oefening-regels. Een menselijke reviewer controleert en
 * factureert de draft definitief.
 *
 * Verwachte input: één of meer staging-records met dezelfde customer+site.
 * Flow:
 *   1. Login op NXT
 *   2. Navigeer naar /#/customers/filter/list/detail/{customerId}/order
 *   3. Vul form: Order type, Site, Company (brand), Planned start/end, References
 *   4. Per regel: item autocomplete → quantity → price → klik "+" (add line)
 *   5. Klik "Save as draft"
 *   6. Wacht op redirect naar /orders/.../detail/{UUID}
 *   7. Capture nieuwe order URL, code en UUID; upload screenshot
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
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Een enkele regel in de nieuwe order.
 */
export interface DraftOrderLine {
  /** NXT artikel-ID (billing_item_id in staging) */
  itemId: string;
  quantity: number;
  unitPrice: number;
  /** Optioneel — referentie naar de originele staging row voor traceerbaarheid */
  stagingId?: string;
}

export interface CreateInvoiceDraftParams {
  /** NXT customer ID (bijv. "200007") */
  customerId: string;
  /** NXT site ID (bijv. "318887") */
  siteId: string;
  /** NXT brand/company ID (bijv. "SB") */
  brandId: string;
  /** NXT order type (bijv. "DO" voor Directe Order) */
  orderTypeId: string;
  /** Kostenplaats — Companies.OrderReference uit NXT, gevuld op het kostenplaats-veld in NXT */
  orderReference?: string | null;
  /**
   * Wanneer true: doorloop na "Save as draft" ook de stappen
   * Confirm (vm.saveAsConfirm) → Invoice (vm.createInvoice) → Process (vm.process).
   * Default false (alleen draft aanmaken — Heeren legacy maandelijkse pad).
   */
  autoInvoice?: boolean;
  /** Regels die op de order moeten komen */
  lines: DraftOrderLine[];
  /** Voor traceerbaarheid — originele NXT order codes die de bron van deze facturatie vormen */
  sourceBillingOrderCodes: string[];
  /** NXT base URL + credentials (per environment) */
  auth: NxtAuth;
}

export interface CreateInvoiceDraftResult {
  success: boolean;
  /** NXT UUID van de nieuwe order, uit de detail-URL */
  newOrderUuid: string | null;
  /** Menselijk leesbare order code (bijv. "370842") — indien zichtbaar na opslaan */
  newOrderCode: string | null;
  /** Full URL naar de nieuwe order detail page */
  newOrderUrl: string | null;
  /** Supabase Storage URL van de screenshot na opslaan */
  screenshotUrl: string | null;
  /** Bij autoInvoice=true: timestamps van elke transitie + invoice info */
  confirmedAt?: string | null;
  invoiceUuid?: string | null;
  invoiceUrl?: string | null;
  invoicedAt?: string | null;
  processedAt?: string | null;
  /** Laatst bekende status — voor debugging als ergens onderweg gefaald */
  finalOrderStatus?: string | null;
  finalInvoiceStatus?: string | null;
  error?: string;
}

async function saveScreenshotToStorage(page: Page, label: string): Promise<string | null> {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `heeren-oefeningen/fase2-${label}-${ts}.png`;
    const buffer = await page.screenshot({ fullPage: true });
    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(filename, buffer, { contentType: "image/png", upsert: true });
    if (error) {
      console.warn(`[screenshot] Upload mislukt: ${error.message}`);
      return null;
    }
    // Bucket is privaat — signed URL met lange expiry (1 jaar) zodat reviewers
    // zonder auth naar de screenshot kunnen linken.
    const { data: signed, error: signErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filename, 60 * 60 * 24 * 365);
    if (signErr || !signed) {
      console.warn(`[screenshot] Signed URL fout: ${signErr?.message}`);
      return filename;
    }
    console.log(`[screenshot] ${signed.signedUrl}`);
    return signed.signedUrl;
  } catch (e: any) {
    console.warn(`[screenshot] Fout: ${e.message}`);
    return null;
  }
}

async function login(page: Page, auth: NxtAuth): Promise<void> {
  await page.goto(`${auth.baseUrl}/#/home`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector('input[type="email"], input[name="username"]', { timeout: 15_000 });
  await page.locator('input[type="email"], input[name="username"]').first().fill(auth.username);
  await page.locator('input[type="password"]').first().fill(auth.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  console.log(`[nxt] Logged in (${auth.baseUrl} as ${auth.username})`);
}

/**
 * Selecteer een md-select dropdown op naam en kies een option by value.
 * Als de select niet zichtbaar/klikbaar is maar al dezelfde waarde heeft, skippen we.
 */
async function selectMdOption(page: Page, locator: string, value: string, label: string, opts: { optional?: boolean } = {}): Promise<void> {
  const select = page.locator(locator).first();
  await select.waitFor({ state: "attached", timeout: 10_000 });

  // Check of de huidige waarde al gelijk is (auto-gevuld)
  const currentValue = await select.evaluate((el) => {
    // md-select bindt ng-model waarde; wij lezen de Angular scope
    const angular = (window as any).angular;
    if (angular) {
      const scope = angular.element(el).scope();
      const ngModel = el.getAttribute("ng-model") ?? "";
      const path = ngModel.split(".");
      let v: any = scope;
      for (const p of path) {
        if (v == null) break;
        v = v[p];
      }
      return v != null ? String(v) : null;
    }
    return null;
  }).catch(() => null);

  if (currentValue === value) {
    console.log(`[form] ${label} → ${value} (al ingesteld)`);
    return;
  }

  // Probeer klikken; als niet zichtbaar en optional → skip, anders probeer via JS
  const clickResult = await select.click({ force: true, timeout: 5000 }).then(() => "ok").catch((e) => e.message);
  if (clickResult !== "ok") {
    if (opts.optional) {
      console.warn(`[form] ${label}: select niet klikbaar (${String(clickResult).slice(0, 80)}) — overslaan (optional)`);
      return;
    }
    throw new Error(`${label}: select niet klikbaar — ${clickResult}`);
  }
  await page.waitForTimeout(600);
  const option = page.locator(`md-option[value="${value}"], md-option[ng-value="${value}"]`).first();
  const hasOption = await option.count();
  if (hasOption === 0) {
    await page.keyboard.press("Escape").catch(() => {});
    throw new Error(`${label}: optie met value="${value}" niet gevonden`);
  }
  await option.click();
  await page.waitForTimeout(400);
  console.log(`[form] ${label} → ${value}`);
}

/**
 * Vul een md-datepicker. Probeert eerst de input, valt terug op Angular scope.
 */
async function fillDatepicker(page: Page, ngModel: string, ddmmyyyy: string, label: string): Promise<void> {
  const selectors = [
    `md-datepicker[ng-model="${ngModel}"] input.md-datepicker-input`,
    `md-datepicker[ng-model="${ngModel}"] input`,
    `md-datepicker[ng-model="${ngModel}"] .md-datepicker-input`,
  ];
  for (const sel of selectors) {
    const input = page.locator(sel).first();
    const count = await input.count();
    if (count === 0) continue;
    try {
      await input.click({ force: true });
      await input.fill(ddmmyyyy);
      await input.press("Tab");
      await page.waitForTimeout(300);
      console.log(`[form] ${label} → ${ddmmyyyy} (via ${sel})`);
      return;
    } catch (e: any) {
      console.warn(`[form] ${label} sel "${sel}" faalde: ${e.message?.slice(0, 80)}`);
    }
  }

  // Fallback: set waarde direct op Angular scope via JS
  const [dd, mm, yyyy] = ddmmyyyy.split("-").map(Number);
  const success = await page.evaluate(({ ngModel, dd, mm, yyyy }) => {
    const angular = (window as any).angular;
    if (!angular) return false;
    const el = document.querySelector(`md-datepicker[ng-model="${ngModel}"]`);
    if (!el) return false;
    const scope = angular.element(el).scope();
    if (!scope) return false;
    const path = ngModel.split(".");
    let obj: any = scope;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = new Date(yyyy, mm - 1, dd);
    scope.$applyAsync();
    return true;
  }, { ngModel, dd, mm, yyyy });
  if (success) {
    await page.waitForTimeout(500);
    console.log(`[form] ${label} → ${ddmmyyyy} (via Angular scope)`);
    return;
  }
  throw new Error(`${label}: datepicker voor ng-model="${ngModel}" niet vindbaar`);
}

async function fillOrderHeader(page: Page, params: CreateInvoiceDraftParams, today: string): Promise<void> {
  // Order type (md-select name=orderType)
  await selectMdOption(page, 'md-select[name="orderType"]', params.orderTypeId, "Order type");

  // Site (md-select met ng-model="vm.selectedSiteId") — optional: top-level customers (geen mother) hebben geen site
  if (params.siteId) {
    await selectMdOption(page, 'md-select[ng-model="vm.selectedSiteId"]', params.siteId, "Site");
  } else {
    console.log(`[form] Site → overgeslagen (geen siteId in staging record)`);
  }

  // Company/Brand (md-select name=company) — vaak auto-gevuld vanuit customer; hidden bij DO order type
  await selectMdOption(page, 'md-select[name="company"]', params.brandId, "Company", { optional: true });

  // Planned start/end zijn niet zichtbaar voor alle order types (bijv. "DO" heeft ze niet).
  // We proberen alleen te fillen als de datepicker zichtbaar is.
  const plannedStartVisible = await page.locator('md-datepicker[ng-model="vm.order.plannedStart"]').count() > 0;
  if (plannedStartVisible) {
    await fillDatepicker(page, "vm.order.plannedStart", today, "Planned start");
    await fillDatepicker(page, "vm.order.plannedEnd", today, "Planned end");
  } else {
    console.log(`[form] Planned start/end niet zichtbaar voor order type "${params.orderTypeId}" — skippen`);
  }

  // Subscription is al "None" default — niks doen

  // Reference = Kostenplaats. Primair: Companies.OrderReference uit NXT (orderReference).
  // Fallback: traceerbaarheid-string met bron-orders (oude gedrag, voor records zonder
  // orderReference). Heeren Loo's boekhouding heeft de Kostenplaats nodig om de factuur
  // op het juiste grootboek te kunnen wegboeken.
  const refText = params.orderReference?.trim()
    ? params.orderReference.trim()
    : `heeren-oefeningen facturatie — bron: ${params.sourceBillingOrderCodes.join(", ")}`;
  const refInput = page.locator('textarea[name="reference1"]').first();
  if (await refInput.count() > 0) {
    await refInput.fill(refText);
    console.log(`[form] Reference (Kostenplaats) → ${refText}`);
  } else {
    console.warn(`[form] Reference-veld niet gevonden — Kostenplaats "${refText}" niet ingevuld`);
  }
}

async function addSingleOrderLine(page: Page, line: DraftOrderLine): Promise<void> {
  console.log(`[line] Toevoegen: item=${line.itemId} qty=${line.quantity} price=${line.unitPrice}`);

  // Item autocomplete — type artikelnummer en selecteer eerste suggestie
  const itemInput = page.locator('input[name="itemAutoComplete"]').first();
  await itemInput.waitFor({ state: "attached", timeout: 10_000 });
  await itemInput.click();
  await itemInput.fill("");
  await itemInput.fill(line.itemId);
  await page.waitForTimeout(2500); // autocomplete heeft even nodig

  // Selecteer de eerste suggestie uit de dropdown
  const suggestion = page.locator('md-autocomplete-parent-scope li, .md-autocomplete-suggestions li, md-virtual-repeat-container li').first();
  const hasSuggestion = await suggestion.count();
  if (hasSuggestion === 0) {
    throw new Error(`Artikel #${line.itemId} niet gevonden in autocomplete`);
  }
  await suggestion.click();
  await page.waitForTimeout(500);

  // Quantity
  const qtyInput = page.locator('input[type="number"][ng-model="vm.orderLineQuantity"]').first();
  await qtyInput.fill("");
  await qtyInput.fill(String(line.quantity));

  // Price
  const priceInput = page.locator('input[type="number"][ng-model="vm.orderLinePrice"]').first();
  await priceInput.fill("");
  await priceInput.fill(String(line.unitPrice));

  // Klik de "+" knop om de regel toe te voegen
  // De knop zit in de "Add order line" rij — class hint: md-fab / md-warn
  const addBtn = page.locator('button.md-fab, md-button.md-fab, button[aria-label*="add order line" i], button[ng-click*="addOrderLine" i]').first();
  if (await addBtn.count() === 0) {
    throw new Error('Add-line "+" knop niet gevonden');
  }
  await addBtn.click();
  await page.waitForTimeout(1500);
  console.log(`[line] ✓ regel toegevoegd`);
}

async function saveAsDraft(page: Page): Promise<{ url: string; uuid: string | null; code: string | null }> {
  const saveBtn = page.locator('button:has-text("Save as draft")').first();
  await saveBtn.waitFor({ state: "attached", timeout: 5000 });
  const isEnabled = await saveBtn.isEnabled().catch(() => false);
  if (!isEnabled) {
    throw new Error('"Save as draft" knop is disabled — waarschijnlijk mist er een verplicht veld');
  }

  // Klik en wacht op navigatie naar order detail
  await Promise.all([
    page.waitForURL(/\/orders\/filter\/list\/detail\//, { timeout: 30_000 }).catch(() => {}),
    saveBtn.click(),
  ]);
  await page.waitForTimeout(2500);

  const finalUrl = page.url();
  console.log(`[save] Post-save URL: ${finalUrl}`);

  // URL pattern: /#/orders/filter/list/detail/{UUID}
  const uuidMatch = finalUrl.match(/\/detail\/([a-f0-9-]{36})/i);
  const uuid = uuidMatch ? uuidMatch[1] : null;

  // Angular SPA na Save: de h4 met order-code ("Order #380213") rendert pas na
  // een paar seconden. Force-reload op de detail-URL versnelt het beschikbaar krijgen
  // van de breadcrumb-data; daarna pollen we tot 15s als safety net.
  await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  // NB: page.evaluate() blokken hier vermijden — tsx transpilatie injecteert __name
  // helpers die in browser-context ReferenceError gooien (eerder masked door .catch()).
  // In plaats daarvan: native Playwright locators op de "h4 small" breadcrumb in NXT.
  let code: string | null = null;
  const deadline = Date.now() + 15000;
  const PICK = /#?\b(\d{6,10})\b/;
  const candidates = ["h4 small", "h4", "md-toolbar"];
  while (Date.now() < deadline) {
    for (const sel of candidates) {
      const loc = page.locator(sel);
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(n, 5); i++) {
        const txt = await loc.nth(i).textContent().catch(() => null);
        const m = txt?.match(PICK);
        if (m) { code = m[1]; break; }
      }
      if (code) break;
    }
    if (code) break;
    await page.waitForTimeout(500);
  }

  if (code) {
    console.log(`[save] ✓ Order code gevonden: ${code}`);
  } else {
    console.log(`[save] ⚠ Geen order code uit DOM; UUID fallback (${uuid})`);
  }

  return { url: finalUrl, uuid, code };
}

/**
 * Klik "Save" (vm.saveAsConfirm) op een prospect-order detail page.
 * Verandert status van `prospect` → `open`.
 *
 * Pre: page bevindt zich op /orders/.../detail/{uuid} met status prospect.
 * Post: status = `open`, "Invoice" knop is nu zichtbaar.
 */
async function confirmOrder(page: Page): Promise<void> {
  const saveBtn = page.locator('button[ng-click="vm.saveAsConfirm()"]').first();
  await saveBtn.waitFor({ state: "visible", timeout: 10_000 });
  await saveBtn.click();
  // Wachten tot de Invoice-knop verschijnt — bewijst dat de status nu `open` is.
  await page.locator('button[ng-click="vm.createInvoice()"]').first()
    .waitFor({ state: "visible", timeout: 15_000 });
}

/**
 * Klik "Invoice" (vm.createInvoice) op een open-order detail page.
 * Navigeert naar /invoices/.../detail/{invoiceUuid}, invoice status = OPEN.
 *
 * Pre: page bevindt zich op /orders/.../detail/{uuid} met status `open`.
 * Post: page is op /invoices/.../detail/{invoiceUuid}, "Process" knop zichtbaar.
 */
async function createInvoiceFromOrder(page: Page): Promise<{ invoiceUuid: string; invoiceUrl: string }> {
  const invoiceBtn = page.locator('button[ng-click="vm.createInvoice()"]').first();
  await invoiceBtn.waitFor({ state: "visible", timeout: 10_000 });
  await Promise.all([
    page.waitForURL(/\/invoices\/.+\/detail\//, { timeout: 30_000 }).catch(() => {}),
    invoiceBtn.click(),
  ]);
  await page.waitForTimeout(2500);

  const invoiceUrl = page.url();
  const m = invoiceUrl.match(/\/invoices\/[^/]+\/[^/]+\/detail\/([a-f0-9]+)/i);
  const invoiceUuid = m ? m[1] : "";
  if (!invoiceUuid) {
    throw new Error(`Invoice UUID niet uit URL te halen: ${invoiceUrl}`);
  }

  // Wacht tot de Process-knop verschijnt
  await page.locator('button[ng-click="vm.process()"]').first()
    .waitFor({ state: "visible", timeout: 15_000 });

  return { invoiceUuid, invoiceUrl };
}

/**
 * Klik "Process" (vm.process) op de invoice detail page.
 * Verandert invoice status van OPEN → PROCESSING.
 *
 * Pre: page bevindt zich op /invoices/.../detail/{invoiceUuid} met status OPEN.
 * Post: status = PROCESSING (eindstaat — geen Process knop meer).
 */
async function processInvoice(page: Page): Promise<void> {
  const processBtn = page.locator('button[ng-click="vm.process()"]').first();
  await processBtn.waitFor({ state: "visible", timeout: 10_000 });
  await processBtn.click();
  // Wachten tot de Process-knop weg is (PROCESSING-staat = niet meer klikbaar).
  await page.locator('button[ng-click="vm.process()"]').first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(async () => {
      // Fallback: misschien blijft de knop staan maar wordt 'ie disabled, of
      // verbergt Angular hem. Check status-input.
      const status = await page.locator('input[name="invoiceStatus"]').first()
        .inputValue().catch(() => "");
      if (status.toUpperCase() === "PROCESSING") return;
      throw new Error(`Process klik leek niet door te komen, status=${status}`);
    });
}

export async function createInvoiceDraft(params: CreateInvoiceDraftParams): Promise<CreateInvoiceDraftResult> {
  if (params.lines.length === 0) {
    return { success: false, newOrderUuid: null, newOrderCode: null, newOrderUrl: null, screenshotUrl: null, error: "Geen regels opgegeven" };
  }

  let browser: Browser | null = null;
  try {
    console.log(`[fase2] Start: customer=${params.customerId} site=${params.siteId} ${params.lines.length} regel(s)`);
    browser = await chromium.connectOverCDP(WS_ENDPOINT, { timeout: 30_000 });
    const context: BrowserContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page: Page = await context.newPage();

    await login(page, params.auth);

    // Navigeer naar de "Add order" pagina van de customer
    const createUrl = `${params.auth.baseUrl}/#/customers/filter/list/detail/${params.customerId}/order`;
    console.log(`[fase2] Navigeren naar: ${createUrl}`);
    await page.goto(createUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector('md-select[name="orderType"]', { state: "attached", timeout: 20_000 });
    await page.waitForTimeout(2500);

    // Vul header-velden
    const now = new Date();
    const today = [now.getDate(), now.getMonth() + 1, now.getFullYear()]
      .map((n, i) => (i < 2 ? String(n).padStart(2, "0") : String(n)))
      .join("-");

    try {
      await fillOrderHeader(page, params, today);
    } catch (e: any) {
      // Debug: dump huidige state vóór error throwen
      await saveScreenshotToStorage(page, `debug-header-fail-${params.customerId}`);
      const fieldMap = await page.evaluate(() => {
        return {
          datepickers: Array.from(document.querySelectorAll('md-datepicker')).map(d => ({
            ngModel: d.getAttribute('ng-model') ?? '',
            visible: (d as HTMLElement).offsetParent !== null,
          })),
          mdSelects: Array.from(document.querySelectorAll('md-select')).map(s => ({
            name: s.getAttribute('name') ?? '',
            ngModel: s.getAttribute('ng-model') ?? '',
            visible: (s as HTMLElement).offsetParent !== null,
          })),
        };
      });
      console.error(`[debug] DOM state bij fout:`, JSON.stringify(fieldMap, null, 2));
      throw e;
    }

    // Voeg alle regels toe
    for (const line of params.lines) {
      await addSingleOrderLine(page, line);
    }

    // Screenshot vóór opslaan (voor debug)
    await saveScreenshotToStorage(page, `before-save-${params.customerId}`);

    // Opslaan als draft
    const { url, uuid, code } = await saveAsDraft(page);

    // Screenshot na opslaan
    const screenshotUrl = await saveScreenshotToStorage(page, `after-save-${uuid ?? "unknown"}`);

    // Bij autoInvoice=false: stop hier (legacy maandelijkse pad)
    if (!params.autoInvoice) {
      return {
        success: true,
        newOrderUuid: uuid,
        newOrderCode: code,
        newOrderUrl: url,
        screenshotUrl,
      };
    }

    // === autoInvoice: doorloop confirm → invoice → process ===
    const result: CreateInvoiceDraftResult = {
      success: true,
      newOrderUuid: uuid,
      newOrderCode: code,
      newOrderUrl: url,
      screenshotUrl,
    };

    // Stap 1: Save (vm.saveAsConfirm) → status `open`
    try {
      await confirmOrder(page);
      result.confirmedAt = new Date().toISOString();
      result.finalOrderStatus = "open";
      console.log(`[autoInvoice] ✓ confirmed (status=open)`);
    } catch (e: any) {
      await saveScreenshotToStorage(page, `confirm-fail-${uuid ?? "unknown"}`);
      result.success = false;
      result.error = `Confirm step mislukt: ${e.message}`;
      return result;
    }

    // Stap 2: Invoice (vm.createInvoice) → redirect naar invoice page
    try {
      const inv = await createInvoiceFromOrder(page);
      result.invoiceUuid = inv.invoiceUuid;
      result.invoiceUrl = inv.invoiceUrl;
      result.invoicedAt = new Date().toISOString();
      result.finalInvoiceStatus = "OPEN";
      console.log(`[autoInvoice] ✓ invoice gegenereerd (uuid=${inv.invoiceUuid})`);
    } catch (e: any) {
      await saveScreenshotToStorage(page, `invoice-fail-${uuid ?? "unknown"}`);
      result.success = false;
      result.error = `Invoice step mislukt: ${e.message}`;
      return result;
    }

    // Stap 3: Process (vm.process) → status PROCESSING (eindstaat)
    try {
      await processInvoice(page);
      result.processedAt = new Date().toISOString();
      result.finalInvoiceStatus = "PROCESSING";
      console.log(`[autoInvoice] ✓ processed (status=PROCESSING)`);
    } catch (e: any) {
      await saveScreenshotToStorage(page, `process-fail-${uuid ?? "unknown"}`);
      result.success = false;
      result.error = `Process step mislukt: ${e.message}`;
      return result;
    }

    // Final screenshot
    const finalShot = await saveScreenshotToStorage(page, `final-invoiced-${uuid ?? "unknown"}`);
    if (finalShot) result.screenshotUrl = finalShot;

    return result;
  } catch (err: any) {
    console.error("[fase2] Fout:", err.message);
    return {
      success: false,
      newOrderUuid: null,
      newOrderCode: null,
      newOrderUrl: null,
      screenshotUrl: null,
      error: err.message,
    };
  } finally {
    if (browser) await browser.close();
  }
}

// --- Directe uitvoering voor testen ---
// Usage: npx tsx create-invoice-draft.ts [environment]
// environment default = "acceptance"
if (require.main === module) {
  const ENV = (process.argv[2] ?? "acceptance") as "production" | "acceptance";

  (async () => {
    const { resolveNxtEnvironment } = await import("./nxt-environment");
    const cfg = await resolveNxtEnvironment(ENV);
    console.log(`\nENVIRONMENT: ${ENV.toUpperCase()} (${cfg.baseUrl})\n`);

    const r = await createInvoiceDraft({
      customerId: "200007",
      siteId: "318887",
      brandId: "SB",
      orderTypeId: "DO",
      lines: [{ itemId: "6410005107", quantity: 1, unitPrice: 35.0 }],
      sourceBillingOrderCodes: ["TEST-SOURCE"],
      auth: cfg,
    });
    console.log("\nResultaat:", JSON.stringify(r, null, 2));
  })().catch(console.error);
}

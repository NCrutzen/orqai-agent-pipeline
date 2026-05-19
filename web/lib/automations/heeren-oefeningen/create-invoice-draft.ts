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

  // Angular SPA: detail-data is vaak nog niet in de DOM direct na de URL-redirect.
  // Poll tot ~8s op de order-code (6-10 cijfers) in titel/headers/breadcrumb/inputs.
  let code: string | null = null;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    code = await page.evaluate(() => {
      const pick = (text: string | null | undefined): string | null => {
        if (!text) return null;
        const m = text.match(/\b(\d{6,10})\b/);
        return m ? m[1] : null;
      };
      // 1) document.title
      const t = pick(document.title);
      if (t) return t;
      // 2) breadcrumbs / toolbar headers
      const headerSelectors = [
        "md-toolbar",
        "h1", "h2", "h3",
        "[class*='breadcrumb']",
        "[class*='page-title']",
        "[class*='order-header']",
      ];
      for (const sel of headerSelectors) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const c = pick(el.textContent);
          if (c) return c;
        }
      }
      // 3) input velden die de code als value tonen (read-only ID-veld)
      for (const inp of Array.from(document.querySelectorAll<HTMLInputElement>("input[readonly], input[disabled], input[type='text']"))) {
        const c = pick(inp.value);
        if (c) {
          // Skip als de waarde gelijk is aan een UUID-deel — alleen pure cijferreeksen
          if (/^\d{6,10}$/.test(inp.value.trim())) return c;
        }
      }
      // 4) Last resort: scan visible labels naast "Order" / "Code" tekst
      const labels = Array.from(document.querySelectorAll("label, span, div"))
        .filter((el) => /\border\s*(code|nr|number|id)\b/i.test(el.textContent ?? ""))
        .slice(0, 20);
      for (const lbl of labels) {
        const next = lbl.parentElement?.textContent ?? "";
        const c = pick(next);
        if (c) return c;
      }
      return null;
    }).catch(() => null);
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

    return {
      success: true,
      newOrderUuid: uuid,
      newOrderCode: code,
      newOrderUrl: url,
      screenshotUrl,
    };
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

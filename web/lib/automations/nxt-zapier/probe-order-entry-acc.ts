/* eslint-disable no-console */
/**
 * Spike 017 residual — READ-ONLY NXT-acceptance probe for the Order Entry act layer.
 *
 * Confirms the endpoint/payload shapes that the CTO skill docs alone can't guarantee
 * (spike 017 README, 10-point checklist). REUSES the existing NXT client — it does NOT
 * reinvent auth or HTTP:
 *   - `nxtRequest()`  (nxt-client.ts)  — generic /api passthrough, never throws on non-2xx
 *   - `getValidToken()` (token-store.ts) — per-brand SPA Bearer, auto-harvest via Browserless
 *
 * ACCEPTANCE ONLY. Every call here is a GET / read-only — no writes, no order creation.
 *
 * Run from web/ (needs .env.local: BROWSERLESS_API_TOKEN + SUPABASE service role for the
 * token harvest — see token-store.ts / acquire-token-via-browserless.ts):
 *   node_modules/.bin/tsx lib/automations/nxt-zapier/probe-order-entry-acc.ts
 *
 * Point it at known acc records for the shape probes (else those are skipped):
 *   PROBE_ORDER_ID=<uuid> PROBE_QUOTE_ID=<id> PROBE_SITE_ID=<id> node_modules/.bin/tsx ...
 *
 * ponytail: REST half only — the two probes that need a UI gesture (quote-acceptance
 * "Order Genereren" and magazijn "rode pijltje" dispatch) are inherently interactive;
 * capture them in a Browserless session, see the DOM-PROBE note at the bottom. No browser
 * dep is pulled here on purpose.
 */
import { nxtRequest } from "./nxt-client";
import { getValidToken, type NxtEnvironment } from "./token-store";

const ENV: NxtEnvironment = "acceptance";

function show(label: string, status: number, data: unknown, pick?: string[]): void {
  let preview = "";
  if (Array.isArray(data)) {
    preview = `array(${data.length})` + (data[0] ? ` first=${JSON.stringify(trim(data[0], pick))}` : "");
  } else if (data && typeof data === "object") {
    preview = JSON.stringify(trim(data, pick));
  } else {
    preview = String(data).slice(0, 200);
  }
  console.log(`  [${status}] ${label}\n      ${preview.slice(0, 600)}`);
}

function trim(obj: unknown, pick?: string[]): unknown {
  if (!obj || typeof obj !== "object") return obj;
  const rec = obj as Record<string, unknown>;
  const keys = pick ?? Object.keys(rec).slice(0, 12);
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in rec) out[k] = rec[k];
  return out;
}

async function get(path: string): Promise<{ status: number; data: unknown }> {
  try {
    const r = await nxtRequest(ENV, "GET", path);
    return { status: r.status, data: r.data };
  } catch (e: unknown) {
    return { status: -1, data: e instanceof Error ? e.message : String(e) };
  }
}

async function main(): Promise<void> {
  console.log(`ENVIRONMENT: ACCEPTANCE -- NXT act-layer probe (read-only) -- ${new Date().toISOString()}`);

  // #10 — SPA token harvest + TTL
  try {
    const token = await getValidToken(ENV);
    const exp = decodeExp(token);
    console.log(`\n#10 token: harvested OK; exp=${exp ?? "?"} (${exp ? Math.round((exp * 1000 - Date.now()) / 60000) + "min left" : "no exp claim"})`);
  } catch (e: unknown) {
    console.log(`\n#10 token: FAILED — ${e instanceof Error ? e.message : String(e)} (need BROWSERLESS_API_TOKEN + acc creds)`);
    return; // every other probe needs the token
  }

  // #7 — order types creatable via POST /api/orders? (list is the catalog)
  console.log("\n#7 order types (nxt.dbo.order_type_bx says 34; confirm live + which are direct-order valid):");
  { const { status, data } = await get("/api/orders/types"); show("/api/orders/types", status, data, ["id", "name"]); }

  // #6 — Camunda process inventory: any quote->order or backorder->Valtimo process?
  console.log("\n#6 camunda process-definitions (look for quote/order/backorder keys):");
  { const { status, data } = await get("/api/camunda-rest/process-definition?latestVersion=true"); show("process-definition", status, data, ["key", "name", "version"]); }

  // #2 — quote object: does a REST quote endpoint exist, or is acceptance Camunda/UI-only?
  console.log("\n#2 quote object (probe existence — 404/405 is informative):");
  { const { status, data } = await get("/api/quotes"); show("/api/quotes (collection)", status, data); }
  if (process.env.PROBE_QUOTE_ID) {
    const { status, data } = await get(`/api/quotes/${process.env.PROBE_QUOTE_ID}`);
    show(`/api/quotes/${process.env.PROBE_QUOTE_ID}`, status, data, ["id", "status", "resolution", "customerId", "siteId", "quoteReference"]);
  } else console.log("      (set PROBE_QUOTE_ID to inspect a real quote shape)");

  // #1 + #3 — order shape + quoteReference lineage
  console.log("\n#1/#3 order shape + quoteReference lineage:");
  if (process.env.PROBE_ORDER_ID) {
    const { status, data } = await get(`/api/orders/${process.env.PROBE_ORDER_ID}`);
    show(`/api/orders/${process.env.PROBE_ORDER_ID}`, status, data, ["id", "internalId", "orderStatusId", "prospect", "quoteReference", "customerId", "siteId", "orderTypeId", "orderLines"]);
  } else console.log("      (set PROBE_ORDER_ID to inspect a real order shape + status lifecycle)");

  // #5 — orderScheme (stammaand) write shape
  console.log("\n#5 orderSchemes (stammaand) shape:");
  if (process.env.PROBE_SITE_ID) {
    const { status, data } = await get(`/api/sites/${process.env.PROBE_SITE_ID}/orderSchemes`);
    show(`/api/sites/${process.env.PROBE_SITE_ID}/orderSchemes`, status, data, ["id", "orderTypeId", "frequency", "startDate", "endDate", "active"]);
  } else console.log("      (set PROBE_SITE_ID to inspect orderScheme fields incl. endDate handling)");

  // #4 — cancellations: is the reason catalog GET-able (for opzegging-block)?
  console.log("\n#4 cancellations reason catalog (read-only side of POST /api/cancellations):");
  { const { status, data } = await get("/api/cancellations/reasons"); show("/api/cancellations/reasons", status, data); }

  console.log("\nDONE. Items not covered here (need a UI gesture) — see DOM-PROBE note in this file's source.");
}

/** Minimal JWT exp decode — no dep. */
function decodeExp(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: number };
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

/*
 * ─── DOM-PROBE note (residu #2 trigger-shape, #8 dispatch) ────────────────────────────
 * Two confirmations need a real click in the NXT SPA and capture of the Network call the
 * front-end fires — REST alone can't see them. Don't reinvent: reuse the existing pattern.
 *
 *   1. Connect to NXT via Browserless exactly like acquire-token-via-browserless.ts
 *      (chromium.connectOverCDP(`wss://production-ams.browserless.io?token=...`) + the
 *      `page.on("response", ...)` listener filtering on `${base}/api/`).
 *   2. Drive the SPA with the heeren-oefeningen harness (lib/automations/heeren-oefeningen/
 *      nxt-environment.ts + create-invoice-draft.ts / delete-order-line.ts show the
 *      login + navigate + act-on-an-order pattern, incl. screenshots-on-step).
 *   3. Capture:
 *      - #2 "Order Genereren" on a won quote → the exact method/path/body + resulting order id.
 *      - #8 magazijn "rode pijltje" dispatch → is it an /api/... call or pure UI (Tablet Dispatch)?
 *
 * These are interactive (you pick the quote/order in acc), so run them as a one-off
 * Browserless session, not in this unattended REST probe.
 */

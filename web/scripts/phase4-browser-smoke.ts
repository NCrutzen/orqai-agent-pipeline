#!/usr/bin/env tsx
/**
 * Phase 4 browser smoke. Creates a temp Supabase user via service role, drives
 * Playwright through /login → /automations/debtor-email/patterns → detail page,
 * screenshots, then deletes the temp user. Asserts the smoke checklist from
 * 04-HUMAN-UAT.md programmatically.
 *
 * Requires: dev server on http://localhost:3000, .env.local with
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const URL_BASE = process.env.SMOKE_URL_BASE ?? "http://localhost:3000";
const SCREENSHOT_DIR = resolve(__dirname, "..", "playwright-snapshots", "phase4-smoke");
const SWARM = "debtor-email";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ts = Date.now();
const email = `phase4-smoke-${ts}@phase4.local`;
const password = randomBytes(16).toString("hex");

type Finding = { level: "ok" | "warn" | "fail"; msg: string };
const findings: Finding[] = [];
const note = (level: Finding["level"], msg: string) => {
  findings.push({ level, msg });
  console.log(`${level === "ok" ? "✅" : level === "warn" ? "⚠️ " : "❌"} ${msg}`);
};

async function shoot(page: Page, name: string) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const path = resolve(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`📸 ${path}`);
  return path;
}

async function main() {
  // 1. Create temp user.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  const userId = created.data.user!.id;
  console.log(`👤 smoke user: ${email} (id=${userId})`);

  let exitCode = 0;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    page.on("pageerror", (err) => note("warn", `console pageerror: ${err.message}`));

    // 2. Sign in via /login form.
    await page.goto(`${URL_BASE}/login?next=${encodeURIComponent(`/automations/${SWARM}/patterns`)}`);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    // Wait for URL to leave /login (the next param + redirect lands us on the target).
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    note("ok", `signed in and landed on ${page.url()}`);

    // 3. Wait for the listing page to render data.
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await shoot(page, "listing");

    // 4a. Mode-bar shows three tabs with Patterns active.
    const bodyHtml = await page.content();
    const hasQueue = /Queue/i.test(bodyHtml);
    const hasHistory = /History/i.test(bodyHtml);
    const hasPatterns = /Patterns/i.test(bodyHtml);
    if (hasQueue && hasHistory && hasPatterns) note("ok", "mode-bar shows Queue · History · Patterns");
    else note("fail", `mode-bar incomplete: queue=${hasQueue} history=${hasHistory} patterns=${hasPatterns}`);

    // 4b. Both signatures present verbatim.
    const sig1 = "Betalingsherinnering vervaldatum in subject (from klant-acme.nl)";
    const sig2 = "Always route emails from klant-acme.nl to Customer CUST-77001";
    if (bodyHtml.includes(sig1)) note("ok", `regex_rule signature rendered: "${sig1}"`);
    else note("fail", `regex_rule signature MISSING from page`);
    if (bodyHtml.includes(sig2)) note("ok", `sender_mapping signature rendered: "${sig2}"`);
    else note("fail", `sender_mapping signature MISSING from page`);

    // 4c. Operator-facing labels (no internal jargon).
    const forbidden = ["eval_type", "Wilson", "swarm_intents", "swarm_noise_categories"];
    for (const term of forbidden) {
      if (bodyHtml.includes(term)) note("fail", `forbidden operator term "${term}" leaked into rendered HTML`);
    }

    // 4d. Aggregate header indicates 2 suggestions.
    if (/2\s+suggestion/i.test(bodyHtml)) note("ok", `aggregate header shows "2 suggestions"`);
    else note("warn", `aggregate "2 suggestions" string not found in HTML — may be styled differently`);

    // 4e. Status pill "needs review" (operator label for status='open' per P4-D-11).
    if (/needs review/i.test(bodyHtml)) note("ok", `status pill label "needs review" present`);
    else note("warn", `status pill label "needs review" missing`);

    // 5. Navigate to detail page via Review → CTA.
    const detailId = "c852e01d-8e91-46ef-9fdc-2ed8eb805c29"; // regex_rule
    await page.goto(`${URL_BASE}/automations/${SWARM}/patterns/${detailId}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await shoot(page, "detail-filter-rule");

    const detailHtml = await page.content();
    // 5a. Action triad present
    const hasApply = /\bApply\b/.test(detailHtml);
    const hasRefine = /\bRefine\b/.test(detailHtml);
    const hasDismiss = /\bDismiss\b/.test(detailHtml);
    if (hasApply && hasRefine && hasDismiss) note("ok", "Apply / Refine / Dismiss triad present");
    else note("fail", `triad incomplete: apply=${hasApply} refine=${hasRefine} dismiss=${hasDismiss}`);

    // 5b. Signature rendered in detail header
    if (detailHtml.includes(sig1)) note("ok", "detail page renders the filter-rule signature");
    else note("fail", "detail page MISSING the filter-rule signature");

    // 5c. Reversibility footer copy (UI-SPEC §13 item 10)
    if (/engineer can reverse/i.test(detailHtml)) note("ok", "reversibility footer copy present");
    else note("warn", "reversibility footer copy ('engineer can reverse Apply') not found");

    // 6. Probe: click Dismiss, confirm Submit disabled at < 8 chars
    const dismissBtn = page.getByRole("button", { name: /^Dismiss$/i }).first();
    if (await dismissBtn.count()) {
      await dismissBtn.click().catch(() => {});
      await page.waitForTimeout(300);
      const textarea = page.locator('textarea').first();
      if (await textarea.count()) {
        await textarea.fill("short"); // 5 chars < 8
        const submit = page.getByRole("button", { name: /Dismiss.*⏎|Dismiss suggestion/i }).first();
        const disabledShort = await submit.isDisabled().catch(() => null);
        if (disabledShort === true) note("ok", "Dismiss submit disabled at <8 chars");
        else if (disabledShort === false) note("fail", "Dismiss submit ENABLED at 5 chars (should require ≥8)");
        else note("warn", "Dismiss submit button not found by name regex");
        await textarea.fill("long enough reason here");
        const disabledLong = await submit.isDisabled().catch(() => null);
        if (disabledLong === false) note("ok", "Dismiss submit enabled at ≥8 chars");
        else if (disabledLong === true) note("warn", `Dismiss submit STILL disabled at sufficient length (button isDisabled=${disabledLong})`);
        await shoot(page, "detail-dismiss-revealed");
      } else {
        note("warn", "Dismiss reveal panel didn't expose a textarea");
      }
    } else {
      note("warn", "Dismiss button not found on detail page");
    }

    // 7. Detail for Known sender (different refine form shape)
    const detailId2 = "24904fd7-9a4d-4275-a8c7-80809035962f"; // sender_mapping
    await page.goto(`${URL_BASE}/automations/${SWARM}/patterns/${detailId2}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await shoot(page, "detail-known-sender");

    // 7a. Try the Refine reveal — confirm a number-only customer input pattern is reachable
    const refineBtn = page.getByRole("button", { name: /^Refine$/i }).first();
    if (await refineBtn.count()) {
      await refineBtn.click().catch(() => {});
      await page.waitForTimeout(300);
      await shoot(page, "detail-refine-known-sender");
      const refineHtml = await page.content();
      const hasCustomerInput = /customer.*account|inputmode="numeric"|pattern="\[0-9\]/i.test(refineHtml);
      if (hasCustomerInput) note("ok", "Known sender refine form exposes customer account number input");
      else note("warn", "Known sender refine form: no obvious numeric customer-account input marker");
    } else {
      note("warn", "Refine button not found on Known sender detail page");
    }

    // Save a finding manifest
    const summary = {
      ts: new Date().toISOString(),
      smoke_user_email: email,
      findings,
      counts: {
        ok: findings.filter((f) => f.level === "ok").length,
        warn: findings.filter((f) => f.level === "warn").length,
        fail: findings.filter((f) => f.level === "fail").length,
      },
    };
    writeFileSync(resolve(SCREENSHOT_DIR, "findings.json"), JSON.stringify(summary, null, 2));
    if (summary.counts.fail > 0) exitCode = 1;
    console.log(`\n=== Smoke summary === ok=${summary.counts.ok} warn=${summary.counts.warn} fail=${summary.counts.fail}`);
  } finally {
    if (browser) await browser.close();
    const del = await admin.auth.admin.deleteUser(userId);
    if (del.error) console.error(`⚠ deleteUser ${userId}: ${del.error.message}`);
    else console.log(`🧹 deleted smoke user ${email}`);
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

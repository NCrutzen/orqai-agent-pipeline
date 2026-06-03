#!/usr/bin/env tsx
/**
 * Phase 4 sketch-compare smoke. Drives Playwright through every locked
 * sketch (006 listing + 007 detail) feature and emits screenshots +
 * structured findings JSON. Run AFTER phase4-cron-smoke.ts populates
 * candidates.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const URL_BASE = "http://localhost:3000";
const SCREENSHOT_DIR = resolve(__dirname, "..", "playwright-snapshots", "phase4-sketch-compare");
const SWARM = "debtor-email";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Severity = "ok" | "minor" | "major";
const findings: Array<{ section: string; sev: Severity; msg: string; expected?: string; got?: string }> = [];
const note = (section: string, sev: Severity, msg: string, expected?: string, got?: string) => {
  findings.push({ section, sev, msg, expected, got });
  const icon = sev === "ok" ? "✅" : sev === "minor" ? "⚠️ " : "❌";
  console.log(`${icon} [${section}] ${msg}${expected ? `\n     expected: ${expected}\n     got:      ${got}` : ""}`);
};

mkdirSync(SCREENSHOT_DIR, { recursive: true });
async function shoot(page: Page, name: string) {
  const path = resolve(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`📸 ${name}.png`);
  return path;
}

async function main() {
  const ts = Date.now();
  const email = `phase4-sketch-${ts}@phase4.local`;
  const password = randomBytes(16).toString("hex");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  const userId = created.data.user!.id;
  console.log(`👤 ${email}`);

  // Get the three candidate ids so we can navigate to specific detail pages.
  const { data: cands } = await admin
    .from("promotion_candidates")
    .select("id, kind")
    .order("kind");
  const byKind: Record<string, string> = {};
  for (const c of (cands ?? []) as { id: string; kind: string }[]) byKind[c.kind] = c.id;
  console.log(`candidates:`, byKind);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // Sign in
    await page.goto(`${URL_BASE}/login?next=${encodeURIComponent(`/automations/${SWARM}/patterns`)}`);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
    await page.waitForLoadState("networkidle");

    // -- Listing checks --------------------------------------------------------
    await page.waitForSelector('[data-testid="patterns-aggregate-header"]', { timeout: 10_000 }).catch(() => {});
    await shoot(page, "01-listing-full");

    const html = await page.content();

    // Mode-bar should show 3 tabs each with a glyph + name + count + context
    // sketch 006: <span class="mode-name">Queue · Live</span><span class="mode-count">47<span class="small">blocked</span></span>
    if (/Queue\s*[·•]\s*Live/i.test(html)) note("mode-bar", "ok", `Queue tab has "Queue · Live" name`);
    else note("mode-bar", "major", `Queue tab missing "Queue · Live" descriptor`, "Queue · Live", "(missing)");
    if (/History\s*[·•]\s*Review/i.test(html)) note("mode-bar", "ok", `History tab has "History · Review" name`);
    else note("mode-bar", "major", `History tab missing "History · Review" descriptor`, "History · Review", "(missing)");
    if (/Patterns\s*[·•]\s*Learn/i.test(html)) note("mode-bar", "ok", `Patterns tab has "Patterns · Learn" name`);
    else note("mode-bar", "major", `Patterns tab missing "Patterns · Learn" descriptor`, "Patterns · Learn", "(missing)");
    // Counts per tab (e.g. "47 blocked", "312 handled · 7d", "18 candidates · 30d")
    if (/(\d+\s*(blocked|candidates|handled))/i.test(html)) note("mode-bar", "ok", "at least one tab shows inline count");
    else note("mode-bar", "major", "no per-tab counts found in mode-bar", "47 blocked / 312 handled · 7d / 18 candidates · 30d", "(no counts)");

    // Patterns header — sketch has h1 + descriptive summary
    // h1: "<pill>Patterns</pill> Things the system could learn · debtor-email"
    // summary: "18 suggestions from your team's recent corrections (last 30 days) · could save the company €X / month if all applied"
    if (/Things the system could learn/i.test(html)) note("header", "ok", "descriptive h1 present");
    else note("header", "major", "descriptive h1 missing", '"Things the system could learn · debtor-email"', "(missing)");
    // React renders curly apostrophe (&rsquo;) — accept either.
    if (/from your team\S*s recent corrections/i.test(html))
      note("header", "ok", "evocative summary present");
    else
      note("header", "major", "evocative summary copy missing", '"N suggestions from your team\'s recent corrections (last 30 days)"', "(missing)");
    // Savings impact line is conditional on totalEur > 0 — synthetic fixtures
    // can produce €0/mo (null confirm_rate). Accept either the live copy OR a
    // "not yet computed" surrogate.
    if (/could save the company/i.test(html))
      note("header", "ok", "savings impact line present");
    else if (/est\.\s*saved not yet computed/i.test(html))
      note("header", "ok", "savings line in zero-savings state (\"not yet computed\")");
    else
      note("header", "major", "savings impact line missing", '"could save the company €N / month if all applied"', "(missing)");

    // Aggregate count text
    const aggCountEl = await page.getByTestId("patterns-aggregate-count").textContent().catch(() => null);
    if (aggCountEl && /^\d+\s+suggestion/.test(aggCountEl.trim())) {
      const m = aggCountEl.match(/^(\d+)/);
      const n = m ? parseInt(m[1], 10) : 0;
      if (n === 1 && /suggestions/.test(aggCountEl)) note("header", "minor", `pluralization bug: "${aggCountEl.trim()}" at count=1 should say "suggestion"`);
      else note("header", "ok", `aggregate count "${aggCountEl.trim()}"`);
    }

    // Filter chips — sketch shows count badge per chip
    const chipsHaveCounts = /needs review\s*<\/?\w*[^>]*>\s*<\w[^>]*>\d/i.test(html) ||
                            (await page.locator('text=/needs review\\s*\\d+/').count()) > 0;
    if (chipsHaveCounts) note("filter-chips", "ok", "chips show inline counts");
    else note("filter-chips", "major", "chips lack inline counts", "needs review 11 · being reviewed 4 · applied 3", "(no counts)");

    // Stage group head — sketch says "Stage 1 · Noise filter" (full label)
    if (/Stage 1\s*[·•]\s*Noise filter/i.test(html)) note("stage-group", "ok", `Stage 1 head has "Noise filter" label`);
    else if (/Stage 1\s*[·•]\s*Noise/i.test(html)) note("stage-group", "minor", `Stage 1 head says just "Noise" (sketch: "Noise filter")`, "Stage 1 · Noise filter", "Stage 1 · Noise");
    else note("stage-group", "major", "no Stage 1 group head found");

    if (/Stage 2\s*[·•]\s*Customer/i.test(html)) note("stage-group", "ok", "Stage 2 head present");
    else note("stage-group", "major", "Stage 2 group head missing");
    if (/Stage 3\s*[·•]\s*(Topic|Coordinator)/i.test(html)) note("stage-group", "ok", "Stage 3 head present");
    else note("stage-group", "major", "Stage 3 group head missing — even though a Stage 3 new_intent candidate exists in DB");

    // Cluster card sig-sub (second descriptive line) — sketch lock
    // sketch: <div class="sig-sub">The AI already auto-archives these every time. A filter rule could handle them without AI cost.</div>
    // Check by inspecting first cluster card's children depth
    const firstCard = page.getByTestId("cluster-card").first();
    if (await firstCard.count() > 0) {
      const cardText = await firstCard.textContent();
      // crude: signature line is short, sig-sub is a sentence ending in period
      const hasTwoLines = cardText && /[a-z]\.\s*[A-Z]/.test(cardText);
      if (hasTwoLines) note("cluster-card", "ok", "card contains sig-sub second line");
      else note("cluster-card", "major", "cluster card has no sig-sub second descriptive line", '"<signature> / <sig-sub: why this matters>"', "(signature only)");
    }

    // Cluster card — does it surface "Stage N · X" label inside the card per sketch?
    if (await firstCard.count() > 0) {
      const inCard = await firstCard.innerHTML();
      if (/Stage \d+\s*[·•]/i.test(inCard)) note("cluster-card", "ok", "card includes stage-label internally");
      else note("cluster-card", "minor", "card omits stage-label internally (group header already groups, may be intentional)", "in-card 'Stage 1 · Noise' label", "(absent)");
    }

    // Volume + savings: sketch has big number top + small label below ("23" / "times this month")
    const volEl = page.getByTestId("cluster-card-volume").first();
    if (await volEl.count() > 0) {
      const volText = (await volEl.textContent())?.trim() ?? "";
      if (/^\d+\s+times\s+this\s+month/.test(volText)) note("cluster-card", "minor", `volume is one inline string (sketch wants big number above small label): "${volText}"`);
      else note("cluster-card", "ok", `volume layout: "${volText}"`);
    }

    const savEl = page.getByTestId("cluster-card-savings").first();
    if (await savEl.count() > 0) {
      const savText = (await savEl.textContent())?.trim() ?? "";
      // sketch: big "€18/mo" + small "est. saved"
      if (/est\.\s*saved/i.test(savText)) note("cluster-card", "ok", `savings has "est. saved" small label`);
      else note("cluster-card", "major", `savings missing "est. saved" small label`, '"€18/mo\\nest. saved"', `"${savText}"`);
    }

    // Filter chip click → URL state change
    const needsReviewChip = page.getByRole("button", { name: /needs review/i }).first();
    if (await needsReviewChip.count() > 0) {
      await needsReviewChip.click();
      await page.waitForTimeout(400);
      const urlAfter = page.url();
      if (/status=/i.test(urlAfter)) note("filter-chips", "ok", "chip click updates URL state");
      else note("filter-chips", "minor", "chip click did not write URL state", "URL contains ?status=...", urlAfter);
      await shoot(page, "02-listing-needs-review-chip");
    }

    // -- Detail page: Filter rule ---------------------------------------------
    const filterRuleId = byKind["regex_rule"];
    if (filterRuleId) {
      await page.goto(`${URL_BASE}/automations/${SWARM}/patterns/${filterRuleId}`);
      await page.waitForLoadState("networkidle");
      await shoot(page, "03-detail-filter-rule");
      const dHtml = await page.content();

      // Breadcrumb shape: ← Patterns / Stage 1 · Noise filter / pc_xxx · created YYYY-MM-DD
      if (/Patterns/.test(dHtml) && (/Stage 1/.test(dHtml) || /Filter rule/i.test(dHtml))) note("detail/breadcrumb", "ok", "breadcrumb has hierarchy");
      else note("detail/breadcrumb", "major", "breadcrumb broken or missing");

      // Headline meta row: "Seen N times this month · est. saves €N/month"
      if (/Seen .* times this month/i.test(dHtml)) note("detail/header", "ok", "headline 'Seen N times this month' present");
      else note("detail/header", "minor", "headline missing 'Seen' framing");
      if (/est\.\s+saves/i.test(dHtml) || /est\.\s+saved/i.test(dHtml)) note("detail/header", "ok", "headline savings present");
      else note("detail/header", "major", "headline 'est. saves' missing");

      // Before/After flow card — accept sketch literal OR the shipped
      // operator-friendly variants ("With this suggestion" / "cost per email").
      if (/Today/.test(dHtml) && /(After applying|With this suggestion)/i.test(dHtml))
        note("detail/change-card", "ok", "Before / After headers present (Today + After/With-this-suggestion)");
      else
        note("detail/change-card", "major", "Before/After flow card not rendered", "Today / After-or-With-this-suggestion step flow", "(missing — fallback shown)");
      if (/(avg cost \/ email|cost per email)/i.test(dHtml))
        note("detail/change-card", "ok", "cost-per-email line present");
      else
        note("detail/change-card", "major", "cost-per-email line missing");
      if (/saves[\s\S]*€/i.test(dHtml)) note("detail/change-card", "ok", "savings delta in After column");
      else note("detail/change-card", "major", "savings delta missing in After column");

      // Evidence card — sketch lock vs shipped operator-friendly variant
      // ("N of N affected emails").
      if (/(Recent emails this rule would have caught|of \d+ affected emails)/i.test(dHtml))
        note("detail/evidence", "ok", "evidence card heading present");
      else
        note("detail/evidence", "minor", "evidence card heading not detected", '"Recent emails this rule would have caught" or "N of N affected emails"', "(see screenshot)");
      if (/would auto-archive/i.test(dHtml)) note("detail/evidence", "ok", "evidence row verdict chip present");
      else note("detail/evidence", "minor", "evidence row verdict chip missing (likely empty evidence with synthetic data)");

      // Action card big-action buttons
      const apply = page.getByRole("button", { name: /^Apply$/i }).first();
      const refine = page.getByRole("button", { name: /^Refine$/i }).first();
      const dismiss = page.getByRole("button", { name: /^Dismiss$/i }).first();
      for (const [name, loc] of [["Apply", apply], ["Refine", refine], ["Dismiss", dismiss]] as const) {
        if (await loc.count()) note(`detail/triad`, "ok", `${name} button present`);
        else note("detail/triad", "major", `${name} button missing`);
      }

      // Apply default-focused — sketch: box-shadow ring 0 0 0 2px var(--patterns)
      const applyFocused = await page.evaluate(() => document.activeElement?.textContent?.trim());
      if (applyFocused === "Apply") note("detail/triad", "ok", "Apply is the focused/default action");
      else note("detail/triad", "minor", `Apply not auto-focused on mount (active = "${applyFocused}")`, "Apply", String(applyFocused));

      // Submit button label flip — sketch: "Apply suggestion ⏎" default
      const submit = page.locator('button:has-text("Apply suggestion")').first();
      if (await submit.count()) note("detail/footer", "ok", `submit reads "Apply suggestion ⏎"`);
      else note("detail/footer", "major", `submit label not "Apply suggestion ⏎"`);

      // Refine reveal → submit relabels
      await refine.click().catch(() => {});
      await page.waitForTimeout(300);
      await shoot(page, "04-detail-filter-rule-refine");
      const refineSubmit = page.locator('button:has-text("Apply refined rule")').first();
      if (await refineSubmit.count()) note("detail/refine", "ok", `submit relabels "Apply refined rule ⏎" on Refine`);
      else note("detail/refine", "major", `submit did NOT relabel to "Apply refined rule" on Refine click`);

      // Refine field shape (Filter rule kind): subject pattern textbox + sender narrow optional
      const refineHtml = await page.content();
      if (/subject pattern|Subject pattern/i.test(refineHtml)) note("detail/refine", "ok", "subject pattern field present in Filter rule Refine");
      else note("detail/refine", "minor", "subject pattern field missing or different label");

      // Dismiss reveal
      await dismiss.click().catch(() => {});
      await page.waitForTimeout(300);
      await shoot(page, "05-detail-filter-rule-dismiss");
      const dismissSubmit = page.locator('button:has-text("Dismiss suggestion")').first();
      if (await dismissSubmit.count()) note("detail/dismiss", "ok", `submit relabels "Dismiss suggestion ⏎"`);
      else note("detail/dismiss", "major", `submit did not relabel for Dismiss`);

      // Footer undo note
      if (/engineer can reverse Apply if it misbehaves/i.test(refineHtml)) note("detail/footer", "ok", "reversibility footer copy present");
      else note("detail/footer", "minor", "reversibility footer copy not found");
    }

    // -- Detail page: Known sender --------------------------------------------
    const knownSenderId = byKind["sender_mapping"];
    if (knownSenderId) {
      await page.goto(`${URL_BASE}/automations/${SWARM}/patterns/${knownSenderId}`);
      await page.waitForLoadState("networkidle");
      await shoot(page, "06-detail-known-sender");
      const dHtml = await page.content();
      // Refine reveal
      const refine = page.getByRole("button", { name: /^Refine$/i }).first();
      if (await refine.count()) {
        await refine.click().catch(() => {});
        await page.waitForTimeout(300);
        await shoot(page, "07-detail-known-sender-refine");
        const html2 = await page.content();
        // Sketch lock: customer account number input with live registry feedback below ("✓ Partner Co BV · NXT db moyne_smeba")
        if (/Numbers only/i.test(html2)) note("detail/known-sender-refine", "ok", `"Numbers only" helper present`);
        else note("detail/known-sender-refine", "minor", `"Numbers only" helper missing`);
        // Live registry feedback below the input
        if (/✓\s+\w/.test(html2) || /NXT db/i.test(html2)) note("detail/known-sender-refine", "ok", "live registry feedback present");
        else note("detail/known-sender-refine", "major", "live customer-name resolution feedback missing — sketch 007 explicitly locks '✓ <Customer name> · NXT db <name>' under the customer-account input", "✓ <Customer name> · NXT db <name>", "(no live feedback)");
      }
    }

    // -- Detail page: New topic (Stage 3) -------------------------------------
    const newIntentId = byKind["new_intent"];
    if (newIntentId) {
      await page.goto(`${URL_BASE}/automations/${SWARM}/patterns/${newIntentId}`);
      await page.waitForLoadState("networkidle");
      await shoot(page, "08-detail-new-topic");
      const dHtml = await page.content();
      const refine = page.getByRole("button", { name: /^Refine$/i }).first();
      if (await refine.count()) {
        await refine.click().catch(() => {});
        await page.waitForTimeout(300);
        await shoot(page, "09-detail-new-topic-refine");
        // sketch: intent_key + handler_event + handler_status: placeholder/registered
        const html3 = await page.content();
        if (/handler|intent[_\s]?key|placeholder/i.test(html3)) note("detail/new-topic-refine", "ok", "new-topic refine exposes intent/handler fields");
        else note("detail/new-topic-refine", "minor", "new-topic refine field shape unclear — sketch lock");
      }
      // Apply for non-deterministic kinds (per P4-D-08): no migration emitted, just status flip
      // Smoke can't actually click Apply without state pollution, so just verify warning copy
      if (/engineer will wire|engineer-driven|engineer must|no migration/i.test(dHtml)) note("detail/new-topic", "ok", "non-deterministic kind warns about engineer-driven Apply");
      else note("detail/new-topic", "minor", "non-deterministic kind doesn't warn about engineer-driven Apply path (per P4-D-08)");
    }

    const summary = {
      ts: new Date().toISOString(),
      counts: {
        ok: findings.filter((f) => f.sev === "ok").length,
        minor: findings.filter((f) => f.sev === "minor").length,
        major: findings.filter((f) => f.sev === "major").length,
      },
      findings,
    };
    writeFileSync(resolve(SCREENSHOT_DIR, "findings.json"), JSON.stringify(summary, null, 2));
    console.log(`\n=== ok=${summary.counts.ok} minor=${summary.counts.minor} major=${summary.counts.major} ===`);
  } finally {
    if (browser) await browser.close();
    await admin.auth.admin.deleteUser(userId);
    console.log(`🧹 deleted ${email}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

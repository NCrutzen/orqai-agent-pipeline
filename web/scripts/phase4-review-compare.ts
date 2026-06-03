#!/usr/bin/env tsx
/**
 * Cross-sketch compare for the /review (Bulk Review) surface.
 * Tests shipped surfaces against sketches 001 (mode chrome), 003 (Stage 1 noise),
 * 004 (Stage 2 resolver), 005 (Stage 3 ranked-intent reorder).
 *
 * Does NOT submit any overrides — read-only smoke. Captures screenshots
 * for visual review + structured findings.json.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const URL_BASE = "http://localhost:3000";
const SCREENSHOT_DIR = resolve(__dirname, "..", "playwright-snapshots", "phase4-review-compare");
const SWARM = "debtor-email";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Severity = "ok" | "minor" | "major";
const findings: Array<{ sketch: string; section: string; sev: Severity; msg: string; expected?: string; got?: string }> = [];
const note = (sketch: string, section: string, sev: Severity, msg: string, expected?: string, got?: string) => {
  findings.push({ sketch, section, sev, msg, expected, got });
  const icon = sev === "ok" ? "✅" : sev === "minor" ? "⚠️ " : "❌";
  console.log(`${icon} [${sketch}/${section}] ${msg}`);
};

mkdirSync(SCREENSHOT_DIR, { recursive: true });
async function shoot(page: Page, name: string) {
  const path = resolve(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(`📸 ${name}.png`);
}

async function main() {
  const ts = Date.now();
  const email = `phase4-review-${ts}@phase4.local`;
  const password = randomBytes(16).toString("hex");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  const userId = created.data.user!.id;
  console.log(`👤 ${email}`);

  // Grant project membership so RLS-gated /review rows are readable.
  // Debiteuren Email = 60c730a3-be04-4b59-87e8-d9698b468fc9
  const { error: pmErr } = await admin
    .from("project_members")
    .insert({ project_id: "60c730a3-be04-4b59-87e8-d9698b468fc9", user_id: userId });
  if (pmErr) console.warn(`project_members insert: ${pmErr.message}`);
  else console.log(`🔑 added to Debiteuren Email project`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // Sign in & land on /review
    await page.goto(`${URL_BASE}/login?next=${encodeURIComponent(`/automations/${SWARM}/review`)}`);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
    await page.waitForTimeout(800);
    await shoot(page, "01-review-listing");

    const listingHtml = await page.content();

    // ── Sketch 001 — mode-keyed shell ──────────────────────────────────────
    // Lock: orange/slate-blue split-bar with mode descriptors
    if (/Queue\s*[·•]\s*Live/i.test(listingHtml)) note("001", "mode-bar", "ok", `"Queue · Live" descriptor`);
    else note("001", "mode-bar", "major", `Queue tab missing "Queue · Live" descriptor`, "Queue · Live", "(bare label)");
    if (/History\s*[·•]\s*(Review|Replay)/i.test(listingHtml)) note("001", "mode-bar", "ok", `"History · Review/Replay" descriptor`);
    else note("001", "mode-bar", "major", `History tab missing descriptor`, "History · Review", "(bare label)");
    // 5-stage strip — Safety · Noise · Customer · Topic · Action
    const stageNames = ["Safety", "Noise", "Customer", "Topic", "Action"];
    for (const s of stageNames) {
      if (new RegExp(`\\b${s}\\b`, "i").test(listingHtml)) note("001", "5-stage-strip", "ok", `"${s}" column header present`);
      else note("001", "5-stage-strip", "major", `5-stage strip missing "${s}" column`);
    }

    // ── Find a row to expand. Use first row-strip — sketch 002 inline-expand pattern ──
    const firstRow = page.locator('[data-testid="row-strip"], [data-testid="bulk-review-row"], button[aria-expanded]').first();
    const rowCount = await firstRow.count();
    if (rowCount === 0) {
      note("002", "row-list", "major", "no rows found on /review surface", "≥1 row with status=blocked|predicted", "(empty)");
      writeFileSync(resolve(SCREENSHOT_DIR, "findings.json"), JSON.stringify({ counts: summarize(), findings }, null, 2));
      return;
    }
    // Try clicking to expand
    await firstRow.click().catch(async () => {
      // fallback: click the first article-like clickable thing
      await page.locator('article, tr, li').first().click().catch(() => {});
    });
    await page.waitForTimeout(800);
    await shoot(page, "02-review-row-expanded");

    const expHtml = await page.content();

    // ── Sketch 002 — inline-expand 2-col body ──────────────────────────────
    // Lock: Read column left + Decide column right, one row open at a time, J/K nav, ⏎ submit, Esc collapse
    if (/Read[\s\S]{0,200}Decide/i.test(expHtml) || /\bRead\b[\s\S]{0,500}\bDecide\b/.test(expHtml)) {
      note("002", "inline-expand", "ok", "Read / Decide column layout present");
    } else {
      note("002", "inline-expand", "minor", "Read/Decide column labels not text-visible (may use icons or semantic markup only)");
    }

    // ── Sketch 003 — Stage 1 noise feedback ────────────────────────────────
    // Locks: section pattern, email body block (14px/1.65/pre-wrap NOT italic), body toolbar, audit-block
    // Try focusing Stage 1 via the stage tabs/chip strip
    const stage1Tab = page.locator('button:has-text("Noise"), button:has-text("Stage 1"), [data-stage="1"]').first();
    if (await stage1Tab.count()) {
      await stage1Tab.click().catch(() => {});
      await page.waitForTimeout(400);
      await shoot(page, "03-stage-1-noise");
      const s1Html = await page.content();
      // Confirm/Override button color logic (sketch 002 lock)
      const hasConfirmGreen = /confirm/i.test(s1Html);
      const hasOverrideAmber = /override/i.test(s1Html);
      if (hasConfirmGreen) note("003", "footer", "ok", "Confirm button copy present");
      else note("003", "footer", "minor", "Confirm button copy not found via text");
      if (hasOverrideAmber) note("003", "footer", "ok", "Override copy present");
      else note("003", "footer", "minor", "Override copy not found via text");
      // EvalTypeRadio MUST NOT appear (sketch 004 lock supersedes sketch 003 — removed from operator UI)
      if (/regression vs new case|new case|recent regression/i.test(s1Html)) {
        note("003", "eval-type-removal", "major", "EvalTypeRadio still surfacing in operator UI (sketch 004 lock removed it)", "(absent)", "still present");
      } else {
        note("003", "eval-type-removal", "ok", "EvalTypeRadio not surfacing in operator UI");
      }
      // Audit block "Why this verdict?" (Stage 1 = 160px min-height per sketch lock)
      if (/Why this verdict/i.test(s1Html)) note("003", "audit-block", "ok", "audit-block 'Why this verdict?' heading present");
      else note("003", "audit-block", "minor", "audit-block heading not 'Why this verdict?' literal");
      // Body toolbar — "View full thread" + "Translate" + language hint
      if (/View full thread/i.test(s1Html)) note("003", "body-toolbar", "ok", "View full thread button present");
      else note("003", "body-toolbar", "major", "View full thread button missing", '"↗ View full thread (N msgs)"', "(missing)");
      if (/Translate/i.test(s1Html)) note("003", "body-toolbar", "ok", "Translate dropdown present");
      else note("003", "body-toolbar", "major", "Translate dropdown missing", '"⇄ Translate ▾"', "(missing)");
      // LLM Pass 2 evidence card variant — purple accent
      if (/LLM|2nd[-\s]?pass|rescue/i.test(s1Html)) note("003", "llm-pass-2", "ok", "LLM Pass-2 evidence terminology present (some surface variant)");
      else note("003", "llm-pass-2", "minor", "LLM Pass-2 rescue evidence card not detected (may need row that fired it)");
      // No standalone 👍/👎 (REQ-02 implicit via Confirm/Override)
      if (/[👍👎]|thumbs[_-]?up|thumbs[_-]?down/i.test(s1Html)) {
        note("003", "no-standalone-vote", "major", "standalone 👍/👎 widget surfaced (sketch 003 lock: REQ-02 implicit via Confirm/Override)", "(absent)", "(present)");
      } else {
        note("003", "no-standalone-vote", "ok", "no standalone 👍/👎 widget");
      }
    } else {
      note("003", "stage-tab", "major", "Stage 1 (Noise) tab not found on row detail", "stage tab labeled 'Noise' or 'Stage 1'", "(missing)");
    }

    // ── Sketch 004 — Stage 2 resolver attribution ──────────────────────────
    const stage2Tab = page.locator('button:has-text("Customer"), button:has-text("Stage 2"), [data-stage="2"]').first();
    if (await stage2Tab.count()) {
      await stage2Tab.click().catch(() => {});
      await page.waitForTimeout(400);
      await shoot(page, "04-stage-2-customer");
      const s2Html = await page.content();
      // 4-step resolver chain — thread / sender-map / identifier / llm_tiebreaker
      const steps = ["thread", "sender", "identifier", "tiebreaker"];
      const stepsFound = steps.filter((s) => new RegExp(s, "i").test(s2Html));
      if (stepsFound.length >= 3) note("004", "resolver-chain", "ok", `${stepsFound.length}/4 resolver steps visible (${stepsFound.join(", ")})`);
      else if (stepsFound.length >= 1) note("004", "resolver-chain", "major", `only ${stepsFound.length}/4 resolver steps visible`, "vertical chain: thread / sender-map / identifier / llm_tiebreaker", stepsFound.join(", "));
      else note("004", "resolver-chain", "major", "resolver chain visualization MISSING entirely", "vertical 4-step chain with winner highlight", "(no steps surfaced)");
      // Winner step highlight — orange left-border
      if (/winner|matched|picked|pick/i.test(s2Html)) note("004", "winner-highlight", "ok", "winner step terminology present");
      else note("004", "winner-highlight", "minor", "winner step terminology not detected");
      // Override input — number-only customer account
      if (/account.*number|customer.*number|Numbers only/i.test(s2Html)) note("004", "number-only-input", "ok", "number-only customer-account override input present");
      else note("004", "number-only-input", "minor", "number-only customer-account input cue not visible (may need Override mode active)");
      // Live customer-name resolution feedback
      if (/✓\s+\w|NXT db/i.test(s2Html)) note("004", "live-feedback", "ok", "live customer-name resolution feedback rendered");
      else note("004", "live-feedback", "minor", "live customer-name feedback not visible (requires typed number)");
      // Re-run downstream switch
      if (/re-?run.*downstream|Stage 3|re-?dispatch/i.test(s2Html)) note("004", "rerun-switch", "ok", "Re-run downstream switch terminology present");
      else note("004", "rerun-switch", "major", `"Re-run downstream stages with corrected customer" switch missing`, "Switch labeled re-run / re-dispatch", "(missing)");
    } else {
      note("004", "stage-tab", "major", "Stage 2 (Customer) tab not found");
    }

    // ── Sketch 005 — Stage 3 ranked-intent reorder ────────────────────────
    const stage3Tab = page.locator('button:has-text("Topic"), button:has-text("Stage 3"), [data-stage="3"]').first();
    if (await stage3Tab.count()) {
      await stage3Tab.click().catch(() => {});
      await page.waitForTimeout(400);
      await shoot(page, "05-stage-3-topic");
      const s3Html = await page.content();
      // Ranked-intent editor: ▲▼ up/down buttons, confidence bars, position 1 highlighted
      const hasUpDown = /[▲▼]|up[_-]?arrow|down[_-]?arrow|aria-label="(move up|move down)/i.test(s3Html);
      if (hasUpDown) note("005", "reorder-buttons", "ok", "▲▼ reorder buttons present");
      else note("005", "reorder-buttons", "major", "▲▼ reorder buttons missing", "vertical list with stacked ▲▼ per row", "(no reorder affordance)");
      // Position 1 highlight — DISPATCH WINNER tag
      if (/DISPATCH WINNER|dispatch.*winner|winner/i.test(s3Html)) note("005", "winner-tag", "ok", "DISPATCH WINNER terminology");
      else note("005", "winner-tag", "minor", `"DISPATCH WINNER" tag not visible`, "Position 1 has 'DISPATCH WINNER' tag (green) or 'YOUR PICK' (amber if reordered)", "(no tag)");
      // Confidence bars
      if (/confidence|confidence-bar/i.test(s3Html)) note("005", "confidence-bars", "ok", "confidence terminology present");
      else note("005", "confidence-bars", "minor", "confidence bar markup not detected");
      // Eval-contract footer note
      if (/intent[_-]correction|Each move emits/i.test(s3Html)) note("005", "eval-contract-note", "ok", "eval-contract footer present");
      else note("005", "eval-contract-note", "minor", "eval-contract 'Each move emits its own pipeline_events row' footer missing");
      // Escalate-to-human path — red-bordered card "None of these — escalate to human queue"
      if (/None of these|escalate to human|human queue/i.test(s3Html)) note("005", "escalate-path", "ok", "escalate-to-human-queue path present");
      else note("005", "escalate-path", "major", "escalate-to-human-queue path missing", "Red-bordered '⚠ None of these — escalate to human queue' card below editor", "(missing)");
      // Kanban jargon should NOT appear in operator-facing strings
      if (/Kanban|kanban/.test(s3Html)) note("005", "no-kanban-jargon", "major", "'Kanban' jargon leaked into operator UI (sketch 005 lock)", "human queue / human", "Kanban");
      else note("005", "no-kanban-jargon", "ok", "no Kanban jargon in operator UI");
    } else {
      note("005", "stage-tab", "major", "Stage 3 (Topic) tab not found");
    }

    // ── Cross-cutting: J/K keyboard nav (sketch 002 lock) ─────────────────
    // Press J and see if focused row changes
    const beforeUrl = page.url();
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(300);
    const afterJ = page.url();
    if (afterJ !== beforeUrl) note("002", "j-k-nav", "ok", "J key navigates between rows");
    else note("002", "j-k-nav", "minor", "J key did not change URL — may navigate via DOM focus only (acceptable)");

    // Esc collapses
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await shoot(page, "06-after-esc");

    function summarize() {
      return {
        ok: findings.filter((f) => f.sev === "ok").length,
        minor: findings.filter((f) => f.sev === "minor").length,
        major: findings.filter((f) => f.sev === "major").length,
      };
    }
    const summary = { ts: new Date().toISOString(), counts: summarize(), findings };
    writeFileSync(resolve(SCREENSHOT_DIR, "findings.json"), JSON.stringify(summary, null, 2));
    console.log(`\n=== ok=${summary.counts.ok} minor=${summary.counts.minor} major=${summary.counts.major} ===`);
  } finally {
    if (browser) await browser.close();
    await admin.auth.admin.deleteUser(userId);
    console.log(`🧹 deleted ${email}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

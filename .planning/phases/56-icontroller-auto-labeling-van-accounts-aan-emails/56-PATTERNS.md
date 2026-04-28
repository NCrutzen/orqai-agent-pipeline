# Phase 56: iController auto-labeling van accounts aan emails — Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 22 (6 backend modules + 1 route rewrite + 5 dashboard files + 1 cron + 1 migration + 9 tests)
**Analogs found:** 21 / 22 (probe artifact has no exact analog — reusing cleanup probe template)

Phase 56 is composition over verified Phase 55/59/60 primitives. Custom code surface = probe + Browserless label module + NXT-Zap client + LLM tiebreaker + dashboard page/drawer/actions + flip cron. All other concerns (auth, screenshots, Wilson math, broadcast, service-role writes) are direct re-use.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/automations/debtor-email/probe-label-ui.ts` | utility (probe) | request-response (browser) | `web/lib/automations/debtor-email-cleanup/probe-email-popup.ts` | template-match |
| `web/lib/automations/debtor-email/label-email-in-icontroller.ts` | service (Browserless module) | request-response | `web/lib/automations/debtor-email/drafter.ts` | role+flow exact |
| `web/lib/automations/debtor-email/nxt-zap-client.ts` | service (sync HTTP client) | request-response | `web/app/api/automations/smeba/sugarcrm-search/route.ts` (timeout pattern) | partial — flow only |
| `web/lib/automations/debtor-email/resolve-debtor.ts` | service (orchestrator) | transform/pipeline | `web/app/api/automations/debtor/label-email/route.ts` (lines 91-128 MVP pipeline) | partial — extract+extend |
| `web/lib/automations/debtor-email/llm-tiebreaker.ts` | service (Orq.ai client) | request-response | `web/lib/v7/briefing/schema.ts` (Zod+json_schema) + RESEARCH §Pattern in 56-RESEARCH.md | role-match |
| `web/lib/inngest/functions/labeling-flip-cron.ts` | cron (Inngest function) | batch/event-driven | `web/lib/inngest/functions/classifier-promotion-cron.ts` | exact (different mutation target + N threshold) |
| `web/app/api/automations/debtor/label-email/route.ts` | controller (API route) | request-response | self (existing MVP) — keep auth+Zod, replace pipeline | exact-self |
| `web/app/(dashboard)/automations/debtor-email-labeling/page.tsx` | component (server) | CRUD read | `web/app/(dashboard)/automations/classifier-rules/page.tsx` | exact |
| `web/app/(dashboard)/automations/debtor-email-labeling/labeling-row-list.tsx` | component (client) | CRUD read | `web/app/(dashboard)/automations/classifier-rules/rules-table.tsx` | role-match |
| `web/app/(dashboard)/automations/debtor-email-labeling/labeling-row-drawer.tsx` | component (client) | CRUD read+update | `web/components/v7/drawer/agent-detail-drawer.tsx` | role-match (re-skin) |
| `web/app/(dashboard)/automations/debtor-email-labeling/actions.ts` | server actions | CRUD update | `web/app/(dashboard)/automations/classifier-rules/actions.ts` | exact |
| `web/app/(dashboard)/automations/debtor-email-labeling/use-counts-rpc.ts` | hook | CRUD read + realtime | `web/components/automations/automation-realtime-provider.tsx` (broadcast subscribe pattern) | role-match |
| `supabase/migrations/2026MMDD_debtor_email_labeling_phase56.sql` | migration | DDL | `supabase/migrations/20260423_debtor_email_labeling.sql` + `supabase/migrations/20260428_classifier_rules.sql` | role+context exact |
| `web/tests/labeling/route.test.ts` | test (integration) | request-response | n/a — RESEARCH 56-VALIDATION.md spec | spec-only |
| `web/tests/labeling/resolve-debtor.test.ts` | test (unit) | transform | `web/lib/inngest/functions/__tests__/classifier-promotion-cron.test.ts` (if exists) | role-match |
| `web/tests/labeling/nxt-zap-client.test.ts` | test (unit) | request-response | n/a | spec-only |
| `web/tests/labeling/llm-tiebreaker.test.ts` | test (unit) | request-response | n/a | spec-only |
| `web/tests/labeling/label-email-in-icontroller.test.ts` | test (unit, mocked Page) | request-response | n/a | spec-only |
| `web/tests/labeling/flip-cron.test.ts` | test (unit) | batch | classifier-promotion-cron's evaluateRule pure-function pattern | pattern-match |
| `web/tests/labeling/page.test.tsx` | test (component) | CRUD read | n/a | spec-only |
| `web/tests/labeling/drawer.test.tsx` | test (component) | CRUD read+update | n/a | spec-only |
| `web/tests/labeling/actions.test.ts` | test (unit) | CRUD update | n/a | spec-only |

---

## Pattern Assignments

### `web/lib/automations/debtor-email/probe-label-ui.ts` (utility, browser)

**Analog:** `web/lib/automations/debtor-email-cleanup/probe-email-popup.ts` — adapted for label/assign DOM instead of composer.

**Imports + env-gating pattern** (probe-email-popup.ts lines 13-37):
```typescript
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(__dirname, "../../../.env.local") });
import { connectWithSession, saveSession, captureScreenshot } from "@/lib/browser";
import { resolveCredentials } from "@/lib/credentials/proxy";
import type { Page, BrowserContext } from "playwright-core";

const ENV = (process.env.ICONTROLLER_ENV === "production" ? "production" : "acceptance") as "production" | "acceptance";
const URL_BASE = ENV === "production"
  ? "https://walkerfire.icontroller.eu"
  : "https://test-walkerfire-testing.icontroller.billtrust.com";
const CREDENTIAL_ID = ENV === "production"
  ? "dfae6b50-59dd-44e6-81ac-79d4f3511c3f"
  : "e9a9570e-5f0d-4d50-8b41-212fc6bdb78a";
const SESSION_KEY: string | undefined = undefined; // fresh login per probe
const OUT_DIR = resolve(__dirname, "../../../../.planning/briefs/artifacts");
const AUTOMATION = "debtor-email-label-probe";
```

**Login + read-only navigation pattern** (probe-email-popup.ts lines 55-78):
```typescript
async function ensureLoggedIn(page: Page) {
  await page.goto(URL_BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const hasLoginForm = await page.locator("#login-username").isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasLoginForm) { /* already authed */ return; }
  const creds = await resolveCredentials(CREDENTIAL_ID);
  await page.fill("#login-username", creds.username);
  await page.fill("#login-password", creds.password);
  await page.click("#login-submit");
  await page.waitForLoadState("domcontentloaded");
}
```

**DOM scan-by-keyword pattern** (RESEARCH.md §Pattern 2 — already verbatim in research file lines 346-364):
```typescript
const candidates = await page.evaluate((pattern) => {
  const re = new RegExp(pattern.source, pattern.flags);
  const els = Array.from(document.querySelectorAll<HTMLElement>(
    "button, a, [role='button'], select, input, .btn, [data-action], [title], label"
  ));
  return els.map(el => ({
    tag: el.tagName, text: (el.textContent || "").trim().slice(0,100),
    title: el.getAttribute("title") || "", aria: el.getAttribute("aria-label") || "",
    id: el.id || null, cls: (el.className?.toString() || "").slice(0,120),
    visible: el.offsetParent !== null,
  })).filter(c => re.test(`${c.text} ${c.title} ${c.aria} ${c.cls}`));
}, { source: LABEL_KEYWORDS.source, flags: LABEL_KEYWORDS.flags });
```

**Output contract:** write `candidates.json` + screenshots into `.planning/briefs/artifacts/debtor-email-label-probe/` (mirrors cleanup probe). STRICTLY READ-ONLY — never click Save/Apply.

---

### `web/lib/automations/debtor-email/label-email-in-icontroller.ts` (service, Browserless module)

**Analog:** `web/lib/automations/debtor-email/drafter.ts` — same shape (input args → result discriminated union, screenshots before/after, session reuse, env config).

**Result type pattern** (drafter.ts lines 56-80):
```typescript
export type DraftFailureReason = "login_failed" | "message_not_found" | "attach_failed" | "save_failed" | "composer_failed";
export interface CreateDraftSuccess {
  success: true;
  draftUrl: string;
  screenshots: { beforeSave: { path: string | null; url: string | null }; afterSave: {...}; };
  bodyInjectionPath: "iframe" | "textarea" | "skipped";
}
export interface CreateDraftFailure { success: false; reason: DraftFailureReason; screenshot: ...; details: string; }
export type CreateDraftResult = CreateDraftSuccess | CreateDraftFailure;
```
Adapt for label module per D-15:
```typescript
export interface LabelEmailInput { icontroller_message_url: string; customer_account_id: string; customer_name?: string; source_mailbox: string; }
export interface LabelEmailResult { status: "labeled" | "already_labeled" | "skipped_conflict" | "failed"; reason?: string; screenshot_before_url: string|null; screenshot_after_url: string|null; }
```

**Session + env config pattern** (drafter.ts lines 1-35) — but per RESEARCH §Anti-Patterns, **DO NOT** use a dedicated session key. Use the default `openIControllerSession` so labeling shares cookies with cleanup. Imports stay:
```typescript
import { type Page, type BrowserContext } from "playwright-core";
import { connectWithSession, saveSession, captureScreenshot } from "@/lib/browser";
import { resolveCredentials } from "@/lib/credentials/proxy";
import { openIControllerSession, closeIControllerSession } from "@/lib/automations/icontroller/session";
```

**Idempotency flow (D-16):**
1. `await page.goto(input.icontroller_message_url, { waitUntil: "domcontentloaded" });` (NEVER `networkidle` per CLAUDE.md).
2. Read current label state from DOM (selectors from probe artifact).
3. If already-labeled with `customer_account_id` → return `{status:"already_labeled"}`. If labeled different → `{status:"skipped_conflict", reason}`. Else proceed.
4. `captureScreenshot(page, { automation: "debtor-email-labeling", label: "before" })`.
5. Apply label (selectors from probe).
6. `captureScreenshot(page, { automation: "debtor-email-labeling", label: "after" })`.
7. Return signed URLs from `captureScreenshot` result.

**Shadow-DOM rule (CLAUDE.md):** any element inside shadow root → `page.evaluate(...)`, NOT `page.fill()`.

---

### `web/lib/automations/debtor-email/nxt-zap-client.ts` (service, sync HTTP)

**Analog:** RESEARCH §Pattern 1 (already concrete; lines 246-298 in 56-RESEARCH.md). Use verbatim — no further extraction needed.

**Key shape:**
- Env: `NXT_ZAPIER_WEBHOOK_URL`, `NXT_ZAPIER_WEBHOOK_SECRET`
- Timeout: `25_000` ms (under Zapier 30s)
- `LookupKind = "sender_to_account" | "identifier_to_account" | "candidate_details"`
- Request body: `{ nxt_database, lookup_kind, payload }` — Bearer auth header
- Response: `{ matches: NxtMatch[] }` (Zod-validate before returning)

**Add Zod parse at boundary** (mirrors `route.ts` line 12 pattern):
```typescript
const NxtMatchSchema = z.object({
  customer_account_id: z.string(),
  customer_name: z.string(),
  contactperson_name: z.string().optional(),
  invoice_numbers: z.array(z.string()).optional(),
  recent_invoices: z.array(z.object({ id: z.string(), date: z.string(), amount: z.number() })).optional(),
  last_interaction: z.string().optional(),
  confidence_signal: z.enum(["exact","shared_mailbox","fuzzy"]).optional(),
});
const NxtZapResponseSchema = z.object({ matches: z.array(NxtMatchSchema) });
```

---

### `web/lib/automations/debtor-email/resolve-debtor.ts` (service, pipeline orchestrator)

**Analog:** existing `route.ts` lines 91-128 (MVP partial pipeline) — extract + extend to 4 layers per D-00.

**Extracted from route.ts (the part to KEEP and migrate into the new module)** lines 96-128:
```typescript
const invoices = extractInvoiceCandidates(input.subject, input.body_text);
const convId = input.conversation_id ?? email.conversation_id ?? null;
let inherited: { debtor_id: string; debtor_name: string | null } | null = null;
if (convId) {
  const { data: prior } = await supabase.schema("debtor").from("email_labels")
    .select("debtor_id, debtor_name").eq("conversation_id", convId)
    .not("debtor_id", "is", null).in("status", ["labeled", "dry_run"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (prior?.debtor_id) inherited = { debtor_id: prior.debtor_id, debtor_name: prior.debtor_name ?? null };
}
```

**Pipeline structure (NEW per D-00):**
```typescript
export async function resolveDebtor(args: ResolveArgs): Promise<ResolveResult> {
  // Layer 1: thread inheritance (KEEP existing query above; add customer_account_id field)
  const inherited = await checkThreadInheritance(args);
  if (inherited) return { method: "thread_inheritance", customer_account_id: inherited.customer_account_id, confidence: "high" };

  // Layer 2: sender → contactperson (NEW PRIMARY per D-00)
  const senderMatches = await callNxtZap({ nxt_database: args.nxt_database, lookup_kind: "sender_to_account", payload: { from_email: args.from_email } });
  if (senderMatches.matches.length === 1) return { method: "sender_match", customer_account_id: senderMatches.matches[0].customer_account_id, confidence: "high" };
  if (senderMatches.matches.length >= 2) return await llmTiebreak(senderMatches.matches, args);

  // Layer 3: identifier-parse (existing extract-invoices.ts seed)
  const invoices = extractInvoiceCandidates(args.subject, args.body_text);
  if (invoices.candidates.length > 0) {
    const idMatches = await callNxtZap({ nxt_database: args.nxt_database, lookup_kind: "identifier_to_account", payload: { invoice_numbers: invoices.candidates } });
    if (idMatches.matches.length === 1) return { method: "identifier_match", customer_account_id: idMatches.matches[0].customer_account_id, confidence: "high" };
    if (idMatches.matches.length >= 2) return await llmTiebreak(idMatches.matches, args);
  }

  // Layer 4: zero-hit → unresolved (D-03: NO LLM call)
  return { method: "unresolved", customer_account_id: null, confidence: "none" };
}
```

---

### `web/lib/automations/debtor-email/llm-tiebreaker.ts` (service, Orq.ai)

**Analog:** RESEARCH §"Orq.ai LLM tiebreaker (D-13)" — concrete code already in 56-RESEARCH.md lines 540-602. Use verbatim with planner-supplied agent slug.

**Critical from CLAUDE.md (`orqai-patterns.md`):**
- `response_format: { type: "json_schema", json_schema: { strict: true } }` — MANDATORY
- Zod-validate output (15-20% prompt-only failure rate)
- 45s client timeout (orq internal retry = 31s)
- Primary `anthropic/claude-sonnet-4-6` + 3-4 fallbacks (configured in Orq.ai project, not in code)

**Post-validate:** `selected_account_id MUST be in candidates list` (security: prompt injection protection per RESEARCH §Security V11).

---

### `web/lib/inngest/functions/labeling-flip-cron.ts` (cron, batch)

**Analog:** `web/lib/inngest/functions/classifier-promotion-cron.ts` — copy structure exactly; differences are inlined below.

**Cron header pattern** (classifier-promotion-cron.ts lines 1-11):
```typescript
// Phase 56-XX (D-24..D-26). Per-mailbox debtor-email-labeling flip cron.
//
// cron: TZ=Europe/Amsterdam 0 6 * * 1-5 -- daily 06:00 Amsterdam, Mon-Fri
// Single-line comment only -- never put cron strings inside JSDoc per
// CLAUDE.md learning eb434cfd (the */N would close the comment).
```

**Inngest function shell** (classifier-promotion-cron.ts lines 177-180):
```typescript
export const labelingFlipCron = inngest.createFunction(
  { id: "labeling/flip-cron", retries: 2 },
  { cron: "TZ=Europe/Amsterdam 0 6 * * 1-5" },
  async ({ step }) => { /* ... */ }
);
```

**Pure-evaluator extraction pattern** (classifier-promotion-cron.ts lines 59-175): split `evaluateMailbox(admin, mailbox, mutate)` into a pure-ish function so unit tests can call it without Inngest. Mirrors `evaluateRule`.

**Wilson math (CRITICAL DIVERGENCE):**
```typescript
import { wilsonCiLower } from "@/lib/classifier/wilson";
// Do NOT import shouldPromote / shouldDemote — Phase 60 constants are N>=30.
// Phase 56 uses N>=50 per D-24. Inline the gates:
const FLIP_N_MIN = 50;          // D-24 (NOT wilson.ts PROMOTE_N_MIN=30)
const FLIP_CI_LO_MIN = 0.95;
const DEMOTE_CI_LO_MAX = 0.92;  // D-25 hysteresis
```
This is RESEARCH §Pitfall 3. Add a unit test "labeling flip rejects N=49 even at CI-lo=0.99".

**Shadow-mode flag pattern** (classifier-promotion-cron.ts line 181):
```typescript
const mutate = process.env.LABELING_CRON_MUTATE === "true";  // mirror of CLASSIFIER_CRON_MUTATE
```

**Audit-write pattern** (classifier-promotion-cron.ts lines 71-81 — `classifier_rule_evaluations` upsert with `swarm_type='debtor-email-labeling'` and `rule_key='mailbox_flip:<source_mailbox>'`):
```typescript
await admin.from("classifier_rule_evaluations").upsert(
  { swarm_type: "debtor-email-labeling", rule_key: `mailbox_flip:${mailbox.source_mailbox}`,
    n, agree, ci_lo, action },
  { onConflict: "swarm_type,rule_key,evaluated_at" },
);
```

**Mutation target divergence (NOT classifier_rules):** flip writes `debtor.labeling_settings.dry_run`:
```typescript
await admin.schema("debtor").from("labeling_settings")
  .update({ dry_run: false }).eq("source_mailbox", mailbox.source_mailbox);
```

**Per-mailbox group-by uses jsonb path** (RESEARCH §Pitfall 7):
```typescript
.filter("context->>icontroller_mailbox_id", "eq", String(mailbox.icontroller_mailbox_id))
```

**Demotion alert pattern** (classifier-promotion-cron.ts lines 116-121): `console.warn` with structured payload — Slack pickup downstream.

---

### `web/app/api/automations/debtor/label-email/route.ts` (controller, FULL REWRITE)

**Analog:** itself. **KEEP** the auth+Zod+dry-run scaffolding (lines 1-89); **REPLACE** the pipeline (lines 91-176) with calls to `resolveDebtor` + `email_labels` write + optional `labelEmailInController`.

**KEEP verbatim** (route.ts lines 1-89):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ICONTROLLER_MAILBOXES, isKnownMailbox } from "@/lib/automations/debtor-email/mailboxes";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET;
export const maxDuration = 60;

const Body = z.object({
  graph_message_id: z.string().min(1),
  conversation_id: z.string().optional(),
  subject: z.string().default(""),
  body_text: z.string().default(""),
  from_email: z.string().email().nullable().optional(),
  source_mailbox: z.string().min(1),
  icontroller_mailbox_id: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  if (!WEBHOOK_SECRET) return NextResponse.json({ error: "missing_webhook_secret" }, { status: 500 });
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer !== WEBHOOK_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  // ... mailbox-id sanity check ...
  // ... dry_run lookup ...
  // ... email_pipeline.emails 404 (D-29) ...
}
```

**ADD** (per D-06): read `nxt_database` from `labeling_settings`; 404 if null:
```typescript
const { data: settings } = await supabase.schema("debtor").from("labeling_settings")
  .select("dry_run, nxt_database").eq("source_mailbox", input.source_mailbox).maybeSingle();
if (!settings?.nxt_database) return NextResponse.json({ error: "no_nxt_database" }, { status: 404 });
```

**REPLACE** pipeline (lines 91-128) with:
```typescript
const result = await resolveDebtor({ ...input, nxt_database: settings.nxt_database, conversation_id: convId });
// D-28: ALWAYS write email_labels, even unresolved
const { data: labelRow } = await supabase.schema("debtor").from("email_labels").insert({
  email_id: email.id, icontroller_mailbox_id: input.icontroller_mailbox_id,
  source_mailbox: input.source_mailbox, nxt_database: settings.nxt_database,
  customer_account_id: result.customer_account_id, debtor_id: result.customer_account_id, // dual-write per OQ#5
  conversation_id: convId, confidence: result.confidence, method: result.method,
  status: dryRun ? "dry_run" : (result.customer_account_id ? "pending" : "unresolved"),
}).select("id").single();
// Telemetry per D-10 + Pitfall 7
await supabase.from("agent_runs").insert({ swarm_type: "debtor-email-labeling",
  context: { graph_message_id: input.graph_message_id, icontroller_mailbox_id: input.icontroller_mailbox_id,
             source_mailbox: input.source_mailbox, nxt_database: settings.nxt_database }, /* ... */ });
// Browserless step only if !dryRun AND resolved
if (!dryRun && result.customer_account_id) { await labelEmailInIcontroller(...); }
await emitAutomationRunStale(supabase, "debtor-email-labeling");
```

---

### `web/app/(dashboard)/automations/debtor-email-labeling/page.tsx` (server component)

**Analog:** `web/app/(dashboard)/automations/classifier-rules/page.tsx`.

**Header pattern** (classifier-rules/page.tsx lines 1-12):
```typescript
// Phase 56-XX (D-20). Debtor-email-labeling dashboard.
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 300;
```

**Server-side fetch + shadow banner pattern** (classifier-rules/page.tsx lines 21-68):
```typescript
export default async function DebtorEmailLabelingPage() {
  const admin = createAdminClient();
  const mutate = process.env.LABELING_CRON_MUTATE === "true";

  // RPC counts (D-22)
  const { data: counts } = await admin.rpc("label_dashboard_counts", { p_nxt_database: null });
  // Recent rows (D-22 cursor pagination, page-size 100)
  const { data: rows } = await admin.schema("debtor").from("email_labels")
    .select("*").order("created_at", { ascending: false }).limit(100);

  return (
    <div className="px-8 pt-16 pb-12 max-w-[1280px] mx-auto">
      <h1 className="text-[28px] font-semibold leading-[1.2] font-[family-name:var(--font-cabinet)]">
        Debtor email labeling
      </h1>
      {!mutate && (
        <div role="status" className="mt-6 px-6 py-4 rounded-[var(--v7-radius-card)] bg-[var(--v7-blue-soft)] text-[var(--v7-blue)] text-[14px]">
          Shadow mode — flip cron records evaluations but does not flip mailbox dry_run.
        </div>
      )}
      <LabelingRowList rows={rows ?? []} counts={counts ?? []} />
    </div>
  );
}
```

---

### `web/app/(dashboard)/automations/debtor-email-labeling/actions.ts` (server actions)

**Analog:** `web/app/(dashboard)/automations/classifier-rules/actions.ts` — exact pattern (`"use server"`, `createAdminClient`, `revalidatePath`).

**Pattern** (classifier-rules/actions.ts lines 1-22) — apply for approve/reject. Concrete code already in RESEARCH §Pattern 3 (56-RESEARCH.md lines 396-422). Add `revalidatePath("/automations/debtor-email-labeling")` and `await emitAutomationRunStale(admin, "debtor-email-labeling")` per D-23.

---

### `web/app/(dashboard)/automations/debtor-email-labeling/labeling-row-drawer.tsx` (component)

**Analog:** `web/components/v7/drawer/agent-detail-drawer.tsx` — re-skin per RESEARCH "Don't Hand-Roll".

**Imports + Sheet shell pattern** (agent-detail-drawer.tsx lines 1-30):
```typescript
"use client";
import { useMemo } from "react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useDrawer } from "@/components/v7/drawer/drawer-context";
```

**KPI tile pattern** (agent-detail-drawer.tsx lines 42-53) — re-use for confidence/method/status tiles. Drawer body shows: subject, sender, full body, LLM rationale (`reason` from `email_labels.notes`), screenshots (signed URLs from `screenshot_before_url`/`screenshot_after_url`), Approve / Reject + corrected_account_id buttons.

---

### `web/app/(dashboard)/automations/debtor-email-labeling/use-counts-rpc.ts` (hook)

**Analog:** `web/components/automations/automation-realtime-provider.tsx` (broadcast subscribe pattern, lines 58-80).

**Subscribe + refetch pattern** (automation-realtime-provider.tsx lines 58-80):
```typescript
useEffect(() => {
  const supabase = createClient();
  let cancelled = false;
  const refetch = async () => { /* re-fetch counts RPC */ };
  refetch();
  const channel = supabase.channel("automations:debtor-email-labeling:stale");
  channel.on("broadcast", { event: "stale" }, () => refetch()).subscribe();
  return () => { cancelled = true; supabase.removeChannel(channel); };
}, []);
```
**NEVER** subscribe to `postgres_changes` (RESEARCH §Anti-Patterns).

---

### `supabase/migrations/2026MMDD_debtor_email_labeling_phase56.sql` (migration)

**Analog:** combined `supabase/migrations/20260423_debtor_email_labeling.sql` (column-add idiom for `debtor.email_labels`) + `supabase/migrations/20260428_classifier_rules.sql` (CHECK constraint location for D-08).

**Concrete SQL already in RESEARCH §"Migration shape (D-08, D-27, D-31)"** — 56-RESEARCH.md lines 608-645. Use verbatim. Key elements:
- `alter table public.classifier_rules drop constraint classifier_rules_kind_check; alter table ... add constraint ... check (kind in ('regex', 'agent_intent', 'label_resolver'));`
- `alter table debtor.labeling_settings add column if not exists nxt_database text;`
- 6 additive columns on `debtor.email_labels` (`nxt_database`, `customer_account_id`, `reviewed_by`, `reviewed_at`, `screenshot_before_url`, `screenshot_after_url`).
- 3 new indexes (`(nxt_database, status, created_at desc)`, `(method, created_at desc)`, partial on `reviewed_at`).
- Seed `classifier_rules` row `('debtor-email-labeling', 'resolver:invoice_legacy_regex', 'label_resolver', 'candidate', ...)` with `ON CONFLICT (swarm_type, rule_key) DO NOTHING`.
- Add the `label_dashboard_counts(p_nxt_database text DEFAULT NULL)` RPC mirroring `classifier_queue_counts` (D-22).

**Note re D-27 ambiguity** (RESEARCH OQ#5): keep MVP `debtor_id` column for back-compat; add `customer_account_id` as new column; route writes both during transition window.

---

### Tests under `web/tests/labeling/*` (9 files)

**Analog (structural):** classifier cron has tests via `evaluateRule` pure function — same pattern (export pure function, unit-test it directly without Inngest harness).

**File paths verbatim from 56-VALIDATION.md:**
- `route.test.ts` — POST flow, 404 cases, dry-run gate, "always writes email_labels"
- `resolve-debtor.test.ts` — pipeline ordering, sender-first short-circuit, LLM-skipped-on-single-hit
- `nxt-zap-client.test.ts` — Bearer header, body shape, 25s timeout
- `llm-tiebreaker.test.ts` — Zod validation, json_schema, candidate-list post-validation
- `label-email-in-icontroller.test.ts` — idempotency (mocked Page)
- `flip-cron.test.ts` — Wilson per-mailbox, **N=49 rejection test (Pitfall 3)**, mutate flag
- `page.test.tsx` — RPC counts render, tree groups by mailbox
- `drawer.test.tsx` — broadcast channel name `automations:debtor-email-labeling:stale`
- `actions.test.ts` — sync writes to `agent_runs.human_verdict` + `email_labels.reviewed_*`

Test framework: vitest + jsdom + @vitejs/plugin-react (already configured per `web/vitest.config.ts`). Run command: `cd web && pnpm vitest run tests/labeling`.

---

## Shared Patterns

### Inbound webhook auth (Bearer)
**Source:** `web/app/api/automations/debtor/label-email/route.ts` lines 7, 33-40
**Apply to:** Inbound POST route (KEEP existing).
```typescript
const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET;
const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
if (bearer !== WEBHOOK_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
```

### Outbound webhook auth (Bearer to NXT-Zap)
**Source:** RESEARCH §Pattern 1
**Apply to:** `nxt-zap-client.ts` only.
```typescript
headers: { "content-type": "application/json", authorization: `Bearer ${NXT_ZAPIER_WEBHOOK_SECRET}` }
```

### Service-role admin client
**Source:** `web/lib/supabase/admin.ts` (`createAdminClient`)
**Apply to:** all server-side modules (route, resolve-debtor, label module, cron, server actions, page server-component).
```typescript
import { createAdminClient } from "@/lib/supabase/admin";
const admin = createAdminClient();
```

### Zod input/output validation
**Source:** route.ts lines 11-19 (input); RESEARCH §"Orq.ai LLM tiebreaker" (output)
**Apply to:** route body, NXT-Zap response, Orq.ai tiebreaker output.
```typescript
const Body = z.object({ /* ... */ });
const parsed = Body.safeParse(await request.json().catch(() => null));
if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
```

### Wilson math (with N divergence)
**Source:** `web/lib/classifier/wilson.ts` lines 15-23
**Apply to:** `labeling-flip-cron.ts` ONLY for `wilsonCiLower(n, k)`. **Do NOT** use `shouldPromote` / `shouldDemote` — those use N≥30. Inline `n >= 50 && ci_lo >= 0.95` (D-24).

### Realtime broadcast (write-side)
**Source:** `web/lib/automations/runs/emit.ts` lines 16-36
**Apply to:** route handler (after every email_labels write), approve/reject server actions, flip cron post-mutate.
```typescript
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
await emitAutomationRunStale(admin, "debtor-email-labeling");
// channel resolved: "automations:debtor-email-labeling:stale"
```

### Realtime broadcast (read-side / subscribe)
**Source:** `web/components/automations/automation-realtime-provider.tsx` lines 58-80
**Apply to:** `use-counts-rpc.ts` hook in dashboard page. NEVER `postgres_changes`.

### Inngest cron — TZ + comment style
**Source:** `web/lib/inngest/functions/classifier-promotion-cron.ts` lines 3-5
**Apply to:** `labeling-flip-cron.ts`.
- `TZ=Europe/Amsterdam` prefix MANDATORY (CLAUDE.md learning eb434cfd-107e-4a9c-bf8e-c1a443d36802)
- Cron string in `//` comments only — never inside `/** */` (the `*/N` would close the JSDoc)

### Browserless connection pattern
**Source:** `web/lib/automations/debtor-email/drafter.ts` lines 1-7 + CLAUDE.md
**Apply to:** `probe-label-ui.ts`, `label-email-in-icontroller.ts`.
```typescript
import { type Page, type BrowserContext } from "playwright-core"; // NOT "playwright"
import { connectWithSession, saveSession, captureScreenshot } from "@/lib/browser";
// chromium.connectOverCDP(`wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`)
// SPA navigation: waitUntil: "domcontentloaded" — NEVER "networkidle"
// Shadow DOM: page.evaluate(...) — NEVER page.fill()
```
**Session-key choice:** label module uses default `openIControllerSession` (shares cookies with cleanup) — NOT a dedicated key like drafter's `icontroller_session_drafter`. Per RESEARCH §Anti-Patterns.

### Screenshot capture
**Source:** `web/lib/browser/screenshots.ts` (`captureScreenshot`, bucket `automation-screenshots`, signed URL TTL 1h)
**Apply to:** probe + label module. Always capture BEFORE `browser.close()` on error path.
```typescript
const before = await captureScreenshot(page, { automation: "debtor-email-labeling", label: "before" });
// ... apply label ...
const after = await captureScreenshot(page, { automation: "debtor-email-labeling", label: "after" });
// before.url and after.url are signed URLs to persist in email_labels.screenshot_*_url
```

### Idempotency (Postgres ON CONFLICT)
**Source:** RESEARCH §Security V11; existing `email_labels` UNIQUE on `(graph_message_id)`
**Apply to:** route inserts to `email_labels`. Use `ON CONFLICT DO NOTHING` to absorb webhook replays.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `web/lib/automations/debtor-email/probe-label-ui.ts` | utility | browser | Cleanup probe is for COMPOSER UI, not label UI. Template re-use is correct, but label-DOM selectors are unknown until probe runs. Use template; planner accepts that selectors are TBD. |
| NXT contactperson schema (data-shape) | n/a | n/a | No existing code path. Operator must confirm during Wave 0 (RESEARCH Assumptions A1, OQ unblockable from code alone). |
| iController message-URL contract (`/messages/show/<id>`) | n/a | n/a | RESEARCH Assumption A2 — probe will confirm. |

---

## Metadata

**Analog search scope:** `web/lib/automations/`, `web/lib/inngest/functions/`, `web/app/api/automations/`, `web/app/(dashboard)/automations/`, `web/components/`, `web/lib/classifier/`, `web/lib/automations/runs/`, `supabase/migrations/`.
**Files scanned (Read):** 9 (probe-email-popup.ts, label-email/route.ts, classifier-promotion-cron.ts, emit.ts, wilson.ts, automation-realtime-provider.tsx, classifier-rules/page.tsx, classifier-rules/actions.ts, agent-detail-drawer.tsx, drafter.ts).
**Files referenced in RESEARCH but not re-Read** (already concrete in RESEARCH.md): `nxt-zap-client.ts` template, `llm-tiebreaker.ts` template, migration SQL, flip-cron skeleton, approve/reject actions, probe template.
**Pattern extraction date:** 2026-04-28

## PATTERN MAPPING COMPLETE

**Phase:** 56 — iController auto-labeling van accounts aan emails
**Files classified:** 22
**Analogs found:** 21 / 22

### Coverage
- Files with exact analog: 11 (route, page, actions, drawer, cron, drafter→label module, classifier-rules table→row-list, broadcast emit/subscribe, wilson, migrations, probe template)
- Files with role-match analog: 5 (resolve-debtor, llm-tiebreaker, nxt-zap-client, use-counts-rpc, drawer re-skin)
- Files with no analog (spec-only): 6 test files + probe-DOM-shape (probe artifact will produce selectors)

### Key Patterns Identified
- **Composition over invention:** route+actions+page+cron mirror Phase 60 file-for-file. New code = NXT-Zap client + LLM tiebreaker + Browserless label module + probe.
- **Wilson math reuse with N=50 inline:** `wilsonCiLower(n,k)` only — never `shouldPromote/shouldDemote` (Pitfall 3).
- **Phase 59 broadcast pattern enforced:** `emitAutomationRunStale(admin, "debtor-email-labeling")` write-side; `automations:debtor-email-labeling:stale` channel subscribe. NEVER `postgres_changes`.
- **Browserless session-share with cleanup:** default `openIControllerSession` key (NOT a dedicated key like drafter) so labeling+cleanup reuse warm cookies.
- **Dual-write `debtor_id` and `customer_account_id`** during D-27 transition window.
- **Pre-fetched LLM context (D-12):** Vercel collects candidate details via NXT-Zap, packages into single Orq.ai call. No agent tool-use loop.
- **Cron header convention:** TZ-prefix mandatory; cron strings in `//` only, never in `/** */`.

### File Created
`/Users/nickcrutzen/Developer/Agent Workforce/.planning/phases/56-icontroller-auto-labeling-van-accounts-aan-emails/56-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns by file path + line numbers in PLAN.md actions. The two known unknowns (NXT contactperson schema, iController label DOM) are explicitly flagged for Wave 0 operator+probe tasks before downstream Browserless work begins.

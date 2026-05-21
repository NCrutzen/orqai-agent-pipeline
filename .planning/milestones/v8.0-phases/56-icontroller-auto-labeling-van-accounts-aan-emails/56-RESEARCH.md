# Phase 56: iController auto-labeling van accounts aan emails — Research

**Researched:** 2026-04-28
**Domain:** Browser-automation (iController) + NXT-Zapier lookup transport + Orq.ai LLM tiebreaker + Supabase data-driven review-UI + Wilson-CI per-mailbox flip cron.
**Confidence:** HIGH for code/infra patterns (all anchors verified in repo); MEDIUM for NXT contactperson schema (no existing code path — must be discovered with operator); MEDIUM for iController label-DOM (no probe artifact found — Wave 0 probe is mandatory).

## Summary

CONTEXT.md (D-00..D-31) is locked and consistent with the codebase. The infrastructure Phase 56 needs is **almost entirely already shipped** by Phases 55, 59, 60: `agent_runs`, `classifier_rules`, Wilson math, broadcast helper, `automation-screenshots` bucket + `captureScreenshot/captureBeforeAfter` helpers, iController session reuse (`openIControllerSession`), invoice regex, MVP route skeleton, vitest infra. New code mostly composes existing assets.

**Two material discovery findings:**

1. **No `probe-label-ui.ts` exists.** [VERIFIED: git log + filesystem search] Searched all-branches git history (`git log --all --diff-filter=A` for `probe-label*`), `web/lib/automations/**`, untracked files, stashes, screenshot directories. No artifact captures the label-DOM. The CONTEXT.md D-17 fallback ("planner adds Wave 0 probe task") is the actual path. A template based on `cleanup/probe-email-popup.ts` is below.
2. **No NXT contactperson code exists yet.** [VERIFIED: grep across web/lib + web/app] No env var `NXT_ZAPIER_WEBHOOK_*` is wired. The closest analog is `web/lib/automations/debtor-email/fetch-document.ts` (async pending-row + Zapier callback pattern). Phase 56 introduces the first synchronous NXT-Zap call from Vercel.

**Primary recommendation:** Plan must include a Wave 0 with (a) probe-label-ui.ts task (mandatory, blocks `label-email-in-icontroller.ts`), (b) operator-confirmed NXT contactperson table name + column shape (un-blockable from code alone — needs Zapier exploration), (c) the 3 additive migrations (classifier_rules CHECK extension, email_labels columns, labeling_settings.nxt_database). Everything downstream is composition over verified primitives.

## User Constraints (from CONTEXT.md)

### Locked Decisions

D-00..D-31 in `.planning/phases/56-icontroller-auto-labeling-van-accounts-aan-emails/56-CONTEXT.md` are LOCKED. Highlights the planner must respect verbatim:

- **D-00:** Pipeline order is **thread → sender → identifier-parse → LLM tiebreaker**. Sender is primary.
- **D-01:** Sender lookup queries a **`contactperson` table** in NXT (or equivalent join), not just `debtors.email`.
- **D-03:** LLM fires **only on multi-candidate ambiguity**. Zero-hit → `unresolved`, no LLM. Single-hit → label directly.
- **D-04:** **One generic NXT-lookup Zap** with `{nxt_database, lookup_kind, payload}` body.
- **D-05:** Shared `NXT_ZAPIER_WEBHOOK_SECRET` env var; Zap validates `Authorization: Bearer …`.
- **D-06:** Add `nxt_database text` column to `debtor.labeling_settings`. Default `null`.
- **D-08:** Extend `classifier_rules.kind` CHECK to include `'label_resolver'`.
- **D-13:** Orq.ai `response_format: json_schema` returning `{selected_account_id, confidence, reason}`. Primary `anthropic/claude-sonnet-4-6`. 45s timeout.
- **D-15:** Browserless module signature: `labelEmail({icontroller_message_url, customer_account_id, screenshot_dir})`.
- **D-16:** Idempotency: read current label state; no-op when already correct; skip + warn when conflicting.
- **D-18:** Browserless via `playwright-core` + `chromium.connectOverCDP`. SPA navigation `waitUntil: 'domcontentloaded'`. Shadow-DOM via `.evaluate()`.
- **D-20..D-23:** New page `/automations/debtor-email-labeling`, drawer pattern, RPC counts (`label_dashboard_counts`), broadcast channel `automations:debtor-email-labeling:stale`.
- **D-24/D-25/D-26:** Per-mailbox Wilson flip: N≥50 AND CI-lo≥0.95; demote at <0.92; gated by env flag `LABELING_CRON_MUTATE`.
- **D-27..D-31:** Migration ordering is additive-first, switch-reads.

### Claude's Discretion

The planner has freedom on (and this research recommends below for each):

- Exact contactperson lookup query/schema (researcher reverse-engineers; operator confirms).
- Whether per-mailbox flip cron is **new file** or branched into `classifier-promotion-cron`.
- Whether `classifier_rules.definition jsonb` is added now.
- Drawer component variant (re-skin vs new).
- LLM agent slug + Orq.ai project_id.
- Screenshot bucket choice.
- Specific column types/lengths on `email_labels` migration.

### Deferred Ideas (OUT OF SCOPE)

Pattern-mining UI; DB-backed regex sandbox; per-rule manual flip approval; multi-DB UNION fallback; async retry queue; FireControl mailbox; label-removal flow; bulk approve; labeling provenance chips in Outlook.

## Phase Requirements

No formal REQ-IDs — D-00..D-31 in CONTEXT.md are the locked spec. Each plan task should cite the relevant `D-NN` it satisfies.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inbound email webhook | Vercel API route (`POST /api/automations/debtor/label-email`) | Zapier (per-mailbox trigger) | Zapier owns activation + retries; Vercel owns pipeline orchestration. |
| NXT contactperson + identifier lookup | Zapier Zap (`NXT_ZAPIER_WEBHOOK_URL`) | Vercel | NXT has no API and only Zapier has the whitelisted IP (CLAUDE.md). Vercel is sync caller. |
| Resolution pipeline (thread → sender → regex → LLM) | Vercel module (`resolve-debtor.ts`) | Supabase (read `email_labels`, `classifier_rules`) | Pure orchestration on top of verified primitives. |
| LLM tiebreaker | Orq.ai agent | Vercel module (`llm-tiebreaker.ts`) | Orq.ai owns prompt + fallbacks; Vercel pre-fetches context to avoid agent tool-loops. |
| Browserless label apply | Browserless.io | Vercel module (`label-email-in-icontroller.ts`) | iController has no API; Browserless executes Playwright. Reuses `openIControllerSession`. |
| Audit row write | Supabase `debtor.email_labels` | — | Service-role write from API route. |
| Telemetry | Supabase `public.agent_runs` | — | Cross-swarm via Phase 55's `swarm_type='debtor-email-labeling'`. |
| Per-mailbox flip cron | Inngest (cron) | Supabase | Wilson math reads `agent_runs`, mutates `labeling_settings.dry_run`. |
| Review UI | Next.js (App Router, `(dashboard)`) | Supabase (RPC + Realtime broadcast) | Phase 59 broadcast pattern — no `postgres_changes` subscription. |
| Approve/Reject | Next.js server action | Supabase (`agent_runs.human_verdict` + `email_labels.reviewed_*`) | Sync write. No worker required (D-21). |

## Standard Stack

### Core (verified in repo, no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `playwright-core` | as in `web/package.json` | Browserless control via CDP | CLAUDE.md mandate |
| `@supabase/supabase-js` | as installed | DB + Storage + Realtime | Stack lock |
| `inngest` | as installed | Cron + event-trigger functions | Stack lock |
| `zod` | as installed | API route + LLM output validation | Stack lock |
| `next` | 14+ App Router | Dashboard page + server actions | Stack lock |
| `vitest` + `jsdom` | configured `web/vitest.config.ts` | Test framework | [VERIFIED] |
| `@vitejs/plugin-react` | configured | React component testing | [VERIFIED] |
| Orq.ai REST API | n/a | LLM call (no SDK; raw fetch with `response_format`) | CLAUDE.md / `orqai-patterns.md` |

### Supporting (existing helpers — REUSE, DO NOT REWRITE)

| Asset | Path | Purpose |
|-------|------|---------|
| `openIControllerSession` / `closeIControllerSession` | `web/lib/automations/icontroller/session.ts` | Login+session reuse, single-tenant |
| `captureScreenshot` / `captureBeforeAfter` | `web/lib/browser/screenshots.ts` | Bucket `automation-screenshots`, signed URL 1h TTL |
| `connectWithSession` / `saveSession` | `web/lib/browser` | Browserless CDP connect + storageState |
| `extractInvoiceCandidates` | `web/lib/automations/debtor-email/extract-invoices.ts` | Seed regex (kept as-is per D-08) |
| `emitAutomationRunStale` | `web/lib/automations/runs/emit.ts` | Broadcast helper |
| `wilsonCiLower` / `shouldPromote` / `shouldDemote` | `web/lib/classifier/wilson.ts` | Wilson math + thresholds (note: PROMOTE_N_MIN=30, but D-24 mandates N≥50 for labeling — see Pitfall 3) |
| `createAdminClient` | `web/lib/supabase/admin.ts` | Service-role Supabase |
| `resolveCredentials` | `web/lib/credentials/proxy.ts` | iController credentials |
| `AutomationRealtimeProvider` | `web/components/automations/automation-realtime-provider.tsx` | Phase 59 broadcast subscription |
| `agent-detail-drawer.tsx` | `web/components/v7/drawer/` | Drawer pattern (re-skin recommended) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Synchronous Zap call | Async pending-row + callback (`fetch-document.ts` pattern) | D-29 mandates synchronous 404; async-callback adds latency + a second Zap. Reject. |
| Branch in `classifier-promotion-cron.ts` | New `labeling-flip-cron.ts` | See "Open Question 1" below — recommendation: NEW file. |
| Add `definition jsonb` to `classifier_rules` now | Defer (rule_key only) | See "Open Question 2" — recommendation: defer. |

**Installation:** No new npm packages required. All dependencies already installed in `web/package.json` per Phase 55/59/60 work.

**Version verification:** Skipped — using only already-installed deps; no upgrade in scope.

## Architecture Patterns

### System Architecture Diagram

```
[Outlook mailbox: Smeba/Smeba-Fire/Sicli-N/Sicli-S/Berki]
   │ (new inbound email)
   ▼
[Zapier Zap × 5 — one per mailbox; per-Zap on/off]
   │ POST {graph_message_id, conversation_id, subject, body_text,
   │       from_email, source_mailbox, icontroller_mailbox_id}
   │ Authorization: Bearer AUTOMATION_WEBHOOK_SECRET
   ▼
[Vercel /api/automations/debtor/label-email]
   │
   ├─ Read debtor.labeling_settings (dry_run, nxt_database) ──→ (404 if null nxt_database)
   ├─ Read email_pipeline.emails (404 if not_ingested → Zap retries)
   │
   ├─ Layer 1: Thread inheritance (Supabase: prior email_labels on conversation_id)
   │     └─ HIT → label directly, method=thread_inheritance
   │
   ├─ Layer 2: Sender → contactperson lookup
   │     │  POST NXT-Zap {nxt_database, lookup_kind:'sender_to_account',
   │     │                 payload:{from_email}}
   │     │  Authorization: Bearer NXT_ZAPIER_WEBHOOK_SECRET
   │     ├─ 1 hit  → label directly, method=sender_match, confidence=high
   │     ├─ ≥2     → fan-out to Layer 4 (LLM)
   │     └─ 0 hits → fall through to Layer 3
   │
   ├─ Layer 3: Identifier-parse (regex from classifier_rules kind='label_resolver')
   │     │  Run extract-invoices.ts (or future DB-backed rules)
   │     │  POST NXT-Zap {nxt_database, lookup_kind:'identifier_to_account',
   │     │                 payload:{invoice_numbers:[...]}}
   │     ├─ 1 hit  → label, method=identifier_match, confidence=high
   │     ├─ ≥2     → Layer 4 (LLM)
   │     └─ 0 hits → method=unresolved, customer_account_id=null
   │
   ├─ Layer 4: LLM tiebreaker (only multi-candidate)
   │     │  Pre-fetch candidate details:
   │     │  POST NXT-Zap {nxt_database, lookup_kind:'candidate_details',
   │     │                 payload:{customer_account_ids:[...]}}
   │     │  POST Orq.ai (response_format=json_schema, 45s timeout)
   │     └─ {selected_account_id, confidence, reason}
   │           method=llm_tiebreaker
   │
   ├─ ALWAYS write debtor.email_labels (audit row, even unresolved) — D-28
   ├─ ALWAYS write public.agent_runs (swarm_type='debtor-email-labeling')
   │
   └─ If !dry_run AND resolved AND status='pending':
         ▼
      [Browserless: label-email-in-icontroller.ts]
        ├─ openIControllerSession (reuses cookies)
        ├─ goto(icontroller_message_url) (D-15 pre-resolved URL)
        ├─ Read current label state — no-op if already correct (D-16)
        ├─ captureScreenshot before
        ├─ Apply label (selectors from probe-label-ui.ts artifact)
        ├─ captureScreenshot after
        └─ Update email_labels.{status='labeled', screenshot_*_url, labeled_at}

   ──→ emitAutomationRunStale("debtor-email-labeling")
       broadcasts on `automations:debtor-email-labeling:stale`
       → /automations/debtor-email-labeling page refetches RPC counts
```

```
[Operator] /automations/debtor-email-labeling
   ├─ tree: nxt_database → mailbox → method (counts via RPC label_dashboard_counts)
   ├─ list: rows with subject/sender/account/confidence/method/status
   └─ drawer (click row): full body + LLM rationale + screenshots
        ├─ [Approve] → write agent_runs.human_verdict='approve' +
        │              email_labels.reviewed_by/reviewed_at  (sync, D-21)
        └─ [Reject + corrected_account] → write human_verdict='reject' +
                                          corrected_category=<account_id>

[Inngest cron: labeling-flip-cron]  daily 06:00 Amsterdam, Mon-Fri
   per mailbox m in labeling_settings:
     N, agree = aggregate(agent_runs WHERE swarm_type='debtor-email-labeling'
                          AND context->>mailbox_id=m AND human_verdict NOT NULL)
     ci_lo = wilsonCiLower(N, agree)
     write classifier_rule_evaluations(swarm_type='debtor-email-labeling',
                                       rule_key='mailbox_flip:'||m,
                                       n, agree, ci_lo, action)
     IF LABELING_CRON_MUTATE='true':
       N≥50 AND ci_lo≥0.95 → labeling_settings.dry_run=false
       ci_lo<0.92          → labeling_settings.dry_run=true (alert)
```

### Recommended Project Structure

```
web/
├── app/
│   ├── api/automations/debtor/label-email/route.ts       # FULL REWRITE (MVP today)
│   └── (dashboard)/automations/debtor-email-labeling/
│       ├── page.tsx                                       # NEW (server: counts + initial rows)
│       ├── labeling-tree.tsx                              # NEW (client: tree-nav)
│       ├── labeling-row-list.tsx                          # NEW (client: cursor pagination)
│       ├── labeling-row-drawer.tsx                        # NEW (re-skin agent-detail-drawer)
│       └── actions.ts                                     # NEW (approve/reject server actions)
├── lib/
│   ├── automations/debtor-email/
│   │   ├── label-email-in-icontroller.ts                  # NEW (Browserless module)
│   │   ├── probe-label-ui.ts                              # NEW Wave 0 (probe artifact)
│   │   ├── resolve-debtor.ts                              # NEW (4-layer pipeline)
│   │   ├── llm-tiebreaker.ts                              # NEW (Orq.ai call)
│   │   ├── nxt-zap-client.ts                              # NEW (single Zap caller, lookup_kind switch)
│   │   ├── extract-invoices.ts                            # KEEP (referenced from classifier_rules seed)
│   │   ├── mailboxes.ts                                   # KEEP
│   │   └── triage/, drafter.ts, fetch-document.ts         # UNCHANGED
│   ├── inngest/functions/
│   │   └── labeling-flip-cron.ts                          # NEW (separate from classifier-promotion-cron)
│   └── classifier/wilson.ts                               # REUSE (note: thresholds differ — see Pitfall 3)
└── tests/labeling/                                         # NEW
    ├── route.test.ts            # POST flow + dry-run + 404
    ├── resolve-debtor.test.ts   # 4-layer pipeline branches
    ├── nxt-zap-client.test.ts   # request/response shape, timeout, retry
    ├── llm-tiebreaker.test.ts   # json_schema validation, timeout
    ├── label-email-in-icontroller.test.ts  # idempotency stub
    ├── flip-cron.test.ts        # Wilson eval per mailbox + mutate flag
    ├── page.test.tsx            # tree + counts render
    ├── drawer.test.tsx          # approve/reject actions
    └── actions.test.ts          # human_verdict write
```

### Pattern 1: NXT-Zap client (single caller, lookup_kind switch)

```typescript
// web/lib/automations/debtor-email/nxt-zap-client.ts
// Source: synthesised from D-04/D-05; pattern adapted from
// web/app/api/automations/smeba/sugarcrm-search/route.ts (timeout pattern)
const NXT_ZAPIER_WEBHOOK_URL = process.env.NXT_ZAPIER_WEBHOOK_URL;
const NXT_ZAPIER_WEBHOOK_SECRET = process.env.NXT_ZAPIER_WEBHOOK_SECRET;
const NXT_ZAP_TIMEOUT_MS = 25_000; // < 30s Zapier limit

export type LookupKind =
  | "sender_to_account"
  | "identifier_to_account"
  | "candidate_details";

export interface NxtZapRequest {
  nxt_database: string;
  lookup_kind: LookupKind;
  payload: Record<string, unknown>;
}

export interface NxtMatch {
  customer_account_id: string;
  customer_name: string;
  contactperson_name?: string;
  invoice_numbers?: string[];
  recent_invoices?: Array<{ id: string; date: string; amount: number }>;
  last_interaction?: string;
  confidence_signal?: "exact" | "shared_mailbox" | "fuzzy";
}

export interface NxtZapResponse {
  matches: NxtMatch[];
}

export async function callNxtZap(req: NxtZapRequest): Promise<NxtZapResponse> {
  if (!NXT_ZAPIER_WEBHOOK_URL || !NXT_ZAPIER_WEBHOOK_SECRET) {
    throw new Error("NXT_ZAPIER_WEBHOOK_URL/SECRET not configured");
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NXT_ZAP_TIMEOUT_MS);
  try {
    const res = await fetch(NXT_ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${NXT_ZAPIER_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`NXT-Zap ${req.lookup_kind} failed: ${res.status}`);
    }
    return (await res.json()) as NxtZapResponse;
  } finally {
    clearTimeout(t);
  }
}
```

### Pattern 2: Probe-script template (Wave 0)

```typescript
// web/lib/automations/debtor-email/probe-label-ui.ts
// Source: mirror of web/lib/automations/debtor-email-cleanup/probe-email-popup.ts
// READ-ONLY: open a message in iController, dump the label/assign DOM,
// screenshot. NO clicks that mutate state.
//
// Usage:
//   ICONTROLLER_ENV=production npx tsx web/lib/automations/debtor-email/probe-label-ui.ts
//
// Output: .planning/briefs/artifacts/debtor-email-label-probe-*/

import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
config({ path: resolve(__dirname, "../../../.env.local") });

import { openIControllerSession, closeIControllerSession } from "@/lib/automations/icontroller/session";
import { captureScreenshot } from "@/lib/browser";

const ENV = (process.env.ICONTROLLER_ENV === "production" ? "production" : "acceptance") as "acceptance" | "production";
const PROBE_MAILBOX_ID = 4; // Smeba
const AUTOMATION = "debtor-email-label-probe";
const OUT_DIR = resolve(__dirname, "../../../../.planning/briefs/artifacts");

const LABEL_KEYWORDS = /label|assign|toewijz|debtor|customer|account|klant/i;

async function main() {
  const session = await openIControllerSession(ENV);
  try {
    const { page, cfg } = session;
    await page.goto(`${cfg.url}/messages/index/mailbox/${PROBE_MAILBOX_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#messages-list", { timeout: 8000 }).catch(() => null);
    await captureScreenshot(page, { automation: AUTOMATION, label: "00-mailbox-list" });

    // Click first row to open detail.
    const firstRow = await page.$("#messages-list tr, #messages-list .message-row");
    if (!firstRow) throw new Error("no message rows visible");
    await firstRow.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    await captureScreenshot(page, { automation: AUTOMATION, label: "01-message-detail" });

    // Scan for label/assign-related controls.
    const candidates = await page.evaluate((pattern) => {
      const re = new RegExp(pattern.source, pattern.flags);
      const els = Array.from(document.querySelectorAll<HTMLElement>(
        "button, a, [role='button'], select, input, .btn, [data-action], [title], label"
      ));
      return els
        .map((el) => ({
          tag: el.tagName,
          text: (el.textContent || "").trim().slice(0, 100),
          title: el.getAttribute("title") || "",
          aria: el.getAttribute("aria-label") || "",
          action: el.getAttribute("data-action") || "",
          id: el.id || null,
          cls: (el.className?.toString() || "").slice(0, 120),
          name: el.getAttribute("name") || null,
          visible: el.offsetParent !== null,
        }))
        .filter((c) => re.test(`${c.text} ${c.title} ${c.aria} ${c.action} ${c.cls} ${c.name ?? ""}`));
    }, { source: LABEL_KEYWORDS.source, flags: LABEL_KEYWORDS.flags });

    mkdirSync(`${OUT_DIR}/${AUTOMATION}`, { recursive: true });
    writeFileSync(
      `${OUT_DIR}/${AUTOMATION}/candidates.json`,
      JSON.stringify({ url: page.url(), candidates }, null, 2)
    );
    console.log(`✓ ${candidates.length} label-candidate elements captured`);

    // Click likeliest candidate to open the label-picker UI (modal? dropdown?).
    // ... iterate; capture each state. Read-only: never click "Save" or "Apply".

    await captureScreenshot(page, { automation: AUTOMATION, label: "02-label-picker-open" });
  } finally {
    await closeIControllerSession(session);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

The probe's output (DOM excerpts + screenshots + selector notes) is checked into `.planning/briefs/artifacts/` and referenced as a comment block in `label-email-in-icontroller.ts`.

### Pattern 3: Approve/Reject server action (sync, no worker)

```typescript
// web/app/(dashboard)/automations/debtor-email-labeling/actions.ts
// Source: D-21 — sync write, no Inngest event. Mirrors Phase 60's verdict actions
// but skips the verdict-worker because there are no async side-effects this phase.
"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

export async function approveLabel(args: { agent_run_id: string; email_label_id: string; reviewer: string }) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from("agent_runs").update({
    human_verdict: "approve", verdict_set_at: now,
  }).eq("id", args.agent_run_id);
  await admin.schema("debtor").from("email_labels").update({
    reviewed_by: args.reviewer, reviewed_at: now,
  }).eq("id", args.email_label_id);
  await emitAutomationRunStale(admin, "debtor-email-labeling");
}

export async function rejectLabel(args: {
  agent_run_id: string; email_label_id: string; reviewer: string;
  corrected_account_id: string | null;
}) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin.from("agent_runs").update({
    human_verdict: "reject", verdict_set_at: now,
    corrected_category: args.corrected_account_id,
  }).eq("id", args.agent_run_id);
  await admin.schema("debtor").from("email_labels").update({
    reviewed_by: args.reviewer, reviewed_at: now,
  }).eq("id", args.email_label_id);
  await emitAutomationRunStale(admin, "debtor-email-labeling");
}
```

### Anti-Patterns to Avoid

- **Calling NXT directly from Vercel.** Whitelisted IP is Zapier's. Never bypass.
- **Using `waitUntil: 'networkidle'`** on iController SPA navigation — CLAUDE.md forbids; use `'domcontentloaded'`.
- **Re-using cleanup's session-key.** `drafter.ts` uses `icontroller_session_drafter`; cleanup uses `icontroller_session`. Phase 56 should use **the default** `openIControllerSession` (key `icontroller_session_prod` / `icontroller_session`) so it shares with cleanup's already-warm cookies — labeling and cleanup are sequential per email.
- **Putting cron strings inside JSDoc.** `*/N` closes the comment block. Use `//` or describe in words. [VERIFIED: classifier-promotion-cron.ts header — same pattern]
- **Subscribing to `postgres_changes`** from the dashboard. Use the Phase 59 broadcast pattern via `AutomationRealtimeProvider`.
- **Letting the LLM call NXT as a tool.** D-12 mandates pre-fetched context. Predictable cost + no agent loops.
- **Hand-rolling Wilson math.** Use `web/lib/classifier/wilson.ts`. But pass N≥50 threshold inline; do NOT use `shouldPromote` directly (its constant is N≥30).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser session | Fresh login each call | `openIControllerSession` | Cookie reuse saves 3-5s/call; storageState is pre-shared |
| Screenshot capture+upload | Custom S3/storage code | `captureScreenshot` from `@/lib/browser` | Already handles bucket `automation-screenshots`, signed URL 1h, error mapping |
| Wilson math | Re-implement formula | `wilsonCiLower(n, k)` from `@/lib/classifier/wilson` | Verified against Phase 60 empirical CI values |
| Realtime fanout | New channel pattern | `emitAutomationRunStale(admin, "debtor-email-labeling")` | Phase 59 contract — single channel per automation |
| Drawer UI | New slide-in component | Re-skin `web/components/v7/drawer/agent-detail-drawer.tsx` | v7 token-consistent |
| RPC counts | Custom view | New RPC `label_dashboard_counts(p_nxt_database text DEFAULT NULL)` mirroring `classifier_queue_counts` pattern | RPC pattern locked in D-22 |
| Service-role client | Inline service-role fetch | `createAdminClient` | Stack lock |

**Key insight:** Phase 56 is 80% composition over Phase 55+59+60 primitives. Custom code surface is small: probe artifact, Browserless module, NXT-Zap client, LLM tiebreaker, dashboard page+drawer+actions, flip cron.

## Runtime State Inventory

> Phase 56 is greenfield wiring on top of an existing MVP skeleton. Migrations are additive; no rename/refactor of existing data. This section is included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `debtor.email_labels` already exists with rows from prior MVP testing? | Migration ADDS columns (`nxt_database`, `customer_account_id`, `method`, `confidence`, `reviewed_by`, `reviewed_at`, `screenshot_before_url`, `screenshot_after_url`); existing rows get NULLs — acceptable. |
| Live service config | 5 Zapier Zaps to be created (one per mailbox) | Operator task post-deploy (Plan step 6, per D-31). Plus 1 NXT-lookup Zap with `lookup_kind` branches. |
| OS-registered state | None | None — verified, no scheduled tasks involved. |
| Secrets/env vars | NEW: `NXT_ZAPIER_WEBHOOK_URL`, `NXT_ZAPIER_WEBHOOK_SECRET`, `LABELING_CRON_MUTATE` | Add to Vercel env. EXISTING: `AUTOMATION_WEBHOOK_SECRET` reused for inbound, `ORQ_API_KEY` reused for LLM. |
| Build artifacts | None | None. |

## Common Pitfalls

### Pitfall 1: Probe-script "I think it exists already"

**What goes wrong:** Operator says probe exists; planner builds Browserless module assuming selectors are documented; module fails because no probe-script ever shipped.
**Why it happens:** Memory of a different probe (`debtor-email-cleanup/probe-email-popup.ts` exists for the **composer** UI, not labels) creates false confidence.
**How to avoid:** [VERIFIED] Researcher exhaustively searched git history (`git log --all --diff-filter=A` for `probe-label*`), filesystem, stash, untracked files. **No label-probe artifact exists.** Wave 0 must include `probe-label-ui.ts` BEFORE the Browserless module task. Probe artifact lands in `.planning/briefs/artifacts/`.
**Warning signs:** PR with `label-email-in-icontroller.ts` selectors that look hand-guessed.

### Pitfall 2: Email-not-yet-ingested race (404 frequency)

**What goes wrong:** Zapier fires faster than the upstream email-ingest. 404 returns; Zapier retries; if retry interval is too short and ingest is slow, Zap exhausts retries and the email is silently dropped.
**Why it happens:** D-29 chose synchronous 404 + Zapier retry over async queue. Acceptable iff frequency <1%.
**How to avoid:** Log every `email_not_ingested` 404 with `graph_message_id`. Phase 56 verification step: after 7 days, query log for 404 frequency. If >1%, escalate to async queue (deferred per D-29).
**Warning signs:** Spike in `404 email_not_ingested` events; user complaints of unlabeled mails despite Zap "success" (with retry count exhausted).

### Pitfall 3: Wilson threshold mismatch (N≥30 vs N≥50)

**What goes wrong:** Planner uses `shouldPromote(n, ci_lo)` directly in the flip cron. That helper's `PROMOTE_N_MIN=30` (Phase 60). D-24 mandates **N≥50** for per-mailbox flip.
**Why it happens:** `wilson.ts` is reused; constants are inlined.
**How to avoid:** In `labeling-flip-cron.ts`, do NOT call `shouldPromote`. Inline: `n >= 50 && ci_lo >= 0.95`. Use `wilsonCiLower(n, k)` for the math only. Add a unit test: "labeling flip rejects N=49 even at CI-lo=0.99".
**Warning signs:** Mailbox flips at N=30; over-eager promotion before adequate sample.

### Pitfall 4: Cron string in JSDoc

**What goes wrong:** Cron pattern `TZ=Europe/Amsterdam 0 6 * * 1-5` placed inside `/** */`. The `*/` mid-pattern... wait, this specific pattern doesn't have `*/N`. But `0 */N 6-19 * * 1-5` (business-hours window pattern) does, and developers copy-paste cron formats. `*/N` closes the JSDoc.
**Why it happens:** CLAUDE.md learning `eb434cfd-107e-4a9c-bf8e-c1a443d36802`.
**How to avoid:** [VERIFIED: classifier-promotion-cron.ts already uses `//` single-line comment header.] Mirror that pattern.
**Warning signs:** Build error "unexpected token" inside the cron file.

### Pitfall 5: Multi-database routing in NXT-Zap

**What goes wrong:** Vercel forwards `nxt_database` but the Zap branches don't all route to the right database connection; cross-brand contactperson lookups silently hit Smeba's DB.
**Why it happens:** Zap-side branching is invisible from code review.
**How to avoid:** Plan must include a smoke test (operator-task): for each of 5 mailboxes, send a `sender_to_account` lookup with a known sender from THAT brand and a known sender from a DIFFERENT brand. Verify hits/misses.
**Warning signs:** Cross-brand false positives in dry-run review (sender `x@smeba.nl` resolves to a Berki account).

### Pitfall 6: Idempotency check requires DOM read iController doesn't always expose

**What goes wrong:** D-16 says "module first reads current label state." But the label-DOM may only render the picker on click; the current state may live in a non-obvious data attribute.
**Why it happens:** Without the probe artifact, idempotency strategy is guess.
**How to avoid:** Probe artifact MUST capture both (a) the un-opened message-detail view DOM (where current label, if any, is displayed), and (b) the open label-picker DOM. Module reads from (a) for idempotency, mutates via (b).
**Warning signs:** Browserless logs show repeated label-applies for already-labeled emails; iController audit log shows redundant changes.

### Pitfall 7: `human_verdict` → Wilson aggregation: per-mailbox key not yet in `agent_runs`

**What goes wrong:** Flip cron aggregates by `mailbox_id`. `agent_runs` has `context jsonb` per Phase 55, where mailbox-specific fields go. If labeling writer doesn't put `icontroller_mailbox_id` (or `nxt_database`) in context, the cron can't group.
**Why it happens:** Convention in Phase 55: `context: {graph_message_id, icontroller_draft_url, entity}`.
**How to avoid:** Labeling route writes `agent_runs.context = {graph_message_id, icontroller_mailbox_id, source_mailbox, nxt_database}`. Cron uses `context->>'icontroller_mailbox_id'` for GROUP BY. Add a JSONB GIN index OR (cleaner) use a SQL view that flattens this — or rely on the Phase 60-11 typed-columns extension once shipped.
**Warning signs:** Flip cron computes 0/0 = NaN per mailbox.

## Code Examples

### iController message URL contract (D-15)

```typescript
// Caller resolves message URL from graph_message_id BEFORE invoking labelEmail.
// Most likely shape (probe will confirm):
//   `${cfg.url}/messages/show/<icontroller_internal_id>`
// where icontroller_internal_id is found by navigating the mailbox list and
// matching subject+sender+date. The route mailbox URL pattern from todo doc:
//   /messages/index/mailbox/{id}  (list view; click row → detail)
//
// Phase 56 contract puts this URL in the function input — separation of concerns.
export interface LabelEmailInput {
  icontroller_message_url: string;   // pre-resolved (D-15)
  customer_account_id: string;
  customer_name?: string;            // for debug/screenshot annotation
  source_mailbox: string;            // for screenshot dir prefix
}
export interface LabelEmailResult {
  status: "labeled" | "already_labeled" | "skipped_conflict" | "failed";
  reason?: string;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
}
```

### Orq.ai LLM tiebreaker (D-13)

```typescript
// web/lib/automations/debtor-email/llm-tiebreaker.ts
// Source: orqai-patterns.md (response_format=json_schema mandatory) +
// web/lib/v7/briefing/schema.ts (Zod validation pattern)
import { z } from "zod";

const TiebreakerOutput = z.object({
  selected_account_id: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().min(1),
});
export type TiebreakerOutput = z.infer<typeof TiebreakerOutput>;

const ORQ_TIMEOUT_MS = 45_000; // CLAUDE.md / D-13

export async function callTiebreaker(args: {
  email_subject: string;
  email_body: string;
  candidates: Array<{ customer_account_id: string; customer_name: string;
                     contactperson_name?: string; recent_invoices?: unknown[];
                     last_interaction?: string }>;
}): Promise<TiebreakerOutput> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");
  // Reuse existing Debiteuren Email Orq.ai project — slug TBD by planner;
  // CONTEXT.md mentions reuse of project_id 60c730a3-... / 019db9c0-...
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ORQ_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.orq.ai/v2/agents/<slug>/invoke", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        inputs: { email_subject: args.email_subject, email_body: args.email_body,
                  candidates: args.candidates },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "label_tiebreaker_output",
            schema: {
              type: "object",
              properties: {
                selected_account_id: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                reason: { type: "string", minLength: 1 },
              },
              required: ["selected_account_id", "confidence", "reason"],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Orq.ai tiebreaker failed: ${res.status}`);
    const json = await res.json();
    return TiebreakerOutput.parse(json.output ?? json);
  } finally {
    clearTimeout(t);
  }
}
```

### Migration shape (D-08, D-27, D-31)

```sql
-- supabase/migrations/2026MMDD_debtor_email_labeling_phase56.sql
-- D-08: extend classifier_rules.kind CHECK (Postgres requires drop+add)
alter table public.classifier_rules drop constraint classifier_rules_kind_check;
alter table public.classifier_rules add constraint classifier_rules_kind_check
  check (kind in ('regex', 'agent_intent', 'label_resolver'));

-- D-06: nxt_database column on labeling_settings
alter table debtor.labeling_settings add column if not exists nxt_database text;
-- Operator backfills per-mailbox post-deploy (planner: NOT in migration body
-- — defaults to NULL = no auto-routing, safe).

-- D-27: additive columns on email_labels
alter table debtor.email_labels add column if not exists nxt_database text;
alter table debtor.email_labels add column if not exists customer_account_id text;
-- (existing columns: debtor_id, debtor_name, method, confidence — KEEP, used
-- by MVP. Phase 56 SUPPLEMENTS, doesn't replace.)
alter table debtor.email_labels add column if not exists reviewed_by text;
alter table debtor.email_labels add column if not exists reviewed_at timestamptz;
alter table debtor.email_labels add column if not exists screenshot_before_url text;
alter table debtor.email_labels add column if not exists screenshot_after_url text;

create index if not exists email_labels_nxt_db_status_idx
  on debtor.email_labels (nxt_database, status, created_at desc);
create index if not exists email_labels_method_idx
  on debtor.email_labels (method, created_at desc);
create index if not exists email_labels_reviewed_at_idx
  on debtor.email_labels (reviewed_at) where reviewed_at is not null;

-- D-31 step 2: seed one classifier_rules row pointing at extract-invoices.ts
insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values (
  'debtor-email-labeling',
  'resolver:invoice_legacy_regex',
  'label_resolver',
  'candidate',
  'Maps to web/lib/automations/debtor-email/extract-invoices.ts INVOICE_PATTERN /\b(17|25|30|32|33)\d{6}\b/g'
)
on conflict (swarm_type, rule_key) do nothing;
```

> **NOTE: `customer_account_id` vs MVP's `debtor_id`.** The current migration (`20260423_debtor_email_labeling.sql`) uses `debtor_id text`. CONTEXT.md D-27 mandates `customer_account_id`. Recommendation: **add `customer_account_id` as a new column**, deprecate `debtor_id` (keep for back-compat), and have the route write both during a transition window. Cleaner long-term name; aligns with NXT terminology. Planner decides whether to ship the rename now or defer.

### Per-mailbox flip cron skeleton (D-24..D-26)

```typescript
// web/lib/inngest/functions/labeling-flip-cron.ts
// cron: TZ=Europe/Amsterdam 0 6 * * 1-5  -- single-line comment, NEVER inside /** */.
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { wilsonCiLower } from "@/lib/classifier/wilson";

const FLIP_N_MIN = 50;        // D-24 (NOT the wilson.ts default of 30)
const FLIP_CI_LO_MIN = 0.95;
const DEMOTE_CI_LO_MAX = 0.92; // D-25 hysteresis

export const labelingFlipCron = inngest.createFunction(
  { id: "labeling-flip-cron", name: "Per-mailbox debtor-email-labeling flip" },
  { cron: "TZ=Europe/Amsterdam 0 6 * * 1-5" },
  async ({ step }) => {
    const mutate = process.env.LABELING_CRON_MUTATE === "true";
    const admin = createAdminClient();
    const { data: settings } = await admin
      .schema("debtor").from("labeling_settings")
      .select("source_mailbox, icontroller_mailbox_id, nxt_database, dry_run");
    if (!settings) return { skipped: "no_settings" };

    const out: Array<Record<string, unknown>> = [];
    for (const m of settings) {
      const result = await step.run(`eval-${m.source_mailbox}`, async () =>
        evaluateMailbox(admin, m, mutate));
      out.push(result);
    }
    return { mutate, results: out };
  },
);

async function evaluateMailbox(admin, mailbox, mutate: boolean) {
  // Aggregate human_verdict over recent N=50 window per mailbox.
  // Window: most recent 50 verdicts (regardless of date) per D-25.
  const { data: rows } = await admin
    .from("agent_runs")
    .select("human_verdict")
    .eq("swarm_type", "debtor-email-labeling")
    .not("human_verdict", "is", null)
    .filter("context->>icontroller_mailbox_id", "eq", String(mailbox.icontroller_mailbox_id))
    .order("verdict_set_at", { ascending: false })
    .limit(FLIP_N_MIN);

  const n = rows?.length ?? 0;
  const agree = (rows ?? []).filter(r => r.human_verdict === "approve").length;
  const ci_lo = wilsonCiLower(n, agree);

  const ruleKey = `mailbox_flip:${mailbox.source_mailbox}`;
  const evalAction = pickAction({ n, ci_lo, dry_run: mailbox.dry_run, mutate });

  await admin.from("classifier_rule_evaluations").insert({
    swarm_type: "debtor-email-labeling",
    rule_key: ruleKey, n, agree, ci_lo, action: evalAction,
  });

  if (mutate) {
    if (mailbox.dry_run && n >= FLIP_N_MIN && ci_lo >= FLIP_CI_LO_MIN) {
      await admin.schema("debtor").from("labeling_settings")
        .update({ dry_run: false }).eq("source_mailbox", mailbox.source_mailbox);
    } else if (!mailbox.dry_run && ci_lo < DEMOTE_CI_LO_MAX) {
      console.warn("[labeling-flip-cron] demote", { mailbox: mailbox.source_mailbox, n, ci_lo });
      await admin.schema("debtor").from("labeling_settings")
        .update({ dry_run: true }).eq("source_mailbox", mailbox.source_mailbox);
    }
  }
  return { mailbox: mailbox.source_mailbox, n, agree, ci_lo, action: evalAction };
}

function pickAction({ n, ci_lo, dry_run, mutate }: { n: number; ci_lo: number; dry_run: boolean; mutate: boolean }) {
  const wouldPromote = dry_run && n >= FLIP_N_MIN && ci_lo >= FLIP_CI_LO_MIN;
  const wouldDemote = !dry_run && ci_lo < DEMOTE_CI_LO_MAX;
  if (mutate) return wouldPromote ? "promoted" : wouldDemote ? "demoted" : "no_change";
  return wouldPromote ? "shadow_would_promote" : wouldDemote ? "shadow_would_demote" : "no_change";
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `automation_runs` postgres_changes subscription | Phase 59 broadcast (`automations:<name>:stale`) + manual refetch | 2026-04 (Phase 59 shipped) | Phase 56 dashboard MUST use broadcast pattern. |
| Per-rule whitelist `Set` in code | `public.classifier_rules` table + 60s cache | 2026-04 (Phase 60 shipped) | Phase 56 extends with `kind='label_resolver'`. |
| Hand-curated CI-lo thresholds | Wilson math via `lib/classifier/wilson.ts` | 2026-04 (Phase 60 shipped) | Reuse, but don't reuse the constants — Phase 56 has different N threshold. |
| MVP `debtor_id` column | Phase 56 `customer_account_id` | This phase | Migration is additive; back-compat retained. |

**Deprecated/outdated:**
- The MVP route's invoice-first ordering — replaced by sender-first per D-00.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NXT contactperson table exists with shape `{id, email, customer_account_id, name?}` or accessible via JOIN | Architecture, Pattern 1 | [ASSUMED] If schema is different, NXT-Zap payload + response normalization changes. Operator must confirm during Wave 0. |
| A2 | iController `/messages/show/<id>` URL pattern exposes message detail with label control | D-15 contract | [ASSUMED — based on todo doc reference, not probed] If URL is `/messages/index/mailbox/{m}#<id>` or otherwise, caller's URL-resolution step changes. Probe will confirm. |
| A3 | iController has a label/assign UI for debtor-account on inbound messages | Pattern 2, D-15 | [ASSUMED — operator believes it exists] If iController has no per-message label primitive, the entire phase is infeasible. Probe is the dispositive test. |
| A4 | Single iController login covers all 5 mailboxes | D-19 | [VERIFIED: `web/lib/automations/icontroller/session.ts` confirms single-tenant, single credential set] |
| A5 | Reusing `automation-screenshots` bucket is acceptable | Storage | [VERIFIED: bucket exists, used by drafter + cleanup + prolius-report] |
| A6 | Existing Debiteuren Email Orq.ai project can host a new tiebreaker agent | D-13 | [ASSUMED] CONTEXT.md mentions IDs but doesn't confirm a tiebreaker agent slug exists. Wave 0 task: deploy/configure agent in Orq.ai. |
| A7 | `agent_runs.context jsonb` is the right place to put `icontroller_mailbox_id` for cron group-by | Pitfall 7 | [VERIFIED: Phase 55 CONTEXT.md sets the precedent — `context jsonb` for swarm-specific fields] |
| A8 | `extract-invoices.ts` regex `/\b(17|25|30|32|33)\d{6}\b/g` covers current invoice formats | D-09 seed | [VERIFIED: used in MVP route + corroborated by todo doc note "covers current sample"] |
| A9 | NXT Zapier connections support all 5 brand databases | D-07 | [ASSUMED] Operator confirms during Zap creation. |

## Open Questions (RESOLVED)

1. **New cron file vs branch in `classifier-promotion-cron.ts`?**
   - What we know: Phase 60's cron iterates `classifier_rules` per `swarm_type` and writes per-rule evaluations. Phase 56's flip target is per-mailbox (`labeling_settings.dry_run`), not per-rule (`classifier_rules.status`). Math is the same (Wilson), source table is the same (`agent_runs`), but mutation target differs.
   - What's unclear: Does shoehorning per-mailbox eval into Phase 60's cron muddy its single responsibility?
   - **Recommendation:** **NEW file `web/lib/inngest/functions/labeling-flip-cron.ts`.** Rationale: (a) different mutation target, (b) different N threshold (50 vs 30) — co-locating thresholds in one file invites bugs, (c) Phase 60 cron's loop is per-rule; per-mailbox needs a different loop and different SQL grouping (joining on `context->>icontroller_mailbox_id`), (d) operator-visibility: a separate function ID makes Inngest dashboard easier to read. Both crons write to the same `classifier_rule_evaluations` audit table with distinct `rule_key` namespaces (`mailbox_flip:<source>` vs Phase 60's `<rule_key>`).

2. **Add `classifier_rules.definition jsonb` now?**
   - What we know: D-09 says "deferred to Phase 56+1 if not needed initially." Phase 56's seed rule (`resolver:invoice_legacy_regex`) is just a rule_key pointing at code. No structured config needed.
   - What's unclear: Phase 61+ pattern-mining will need it.
   - **Recommendation:** **DEFER.** Add a Phase-56 plan task to write a follow-up issue describing the definition jsonb shape so Phase 61 doesn't start cold. The current `classifier_rules` schema has a `notes text` column which is sufficient to comment-link the seed rule to its code path.

3. **Channel naming exact match.**
   - What we know: D-23 says `automations:debtor-email-labeling:stale`. Phase 59 helper `emitAutomationRunStale(admin, automation)` constructs `automations:${automation}:stale`.
   - **Confirmed:** [VERIFIED in `web/lib/automations/runs/emit.ts`] passing `"debtor-email-labeling"` produces exactly the channel D-23 specifies.

4. **Inngest event for verdict telemetry?**
   - What we know: D-21 + D-26 say approve/reject are sync writes. Cron consumes `agent_runs` directly.
   - **Confirmed:** No event-trigger worker needed in Phase 56. (Phase 60's `classifier-verdict-worker` is for Outlook categorize/archive side-effects which are out of scope for labeling.)

5. **`debtor_id` (MVP) vs `customer_account_id` (D-27).**
   - **Recommendation:** **Add `customer_account_id` as a new nullable column. Keep `debtor_id` for back-compat.** Route writes both during a transition window (~2 weeks post-deploy). Plan a follow-up cleanup task to drop `debtor_id` once dashboards confirm `customer_account_id` is populated everywhere.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Browserless.io (Amsterdam) | Browserless label module | ✓ | n/a | — |
| iController (production) | Browserless module | ✓ | walkerfire.icontroller.eu | — |
| Supabase Storage `automation-screenshots` bucket | Screenshot upload | ✓ | n/a | — |
| Orq.ai LLM Router | LLM tiebreaker | ✓ | n/a | If down: write `email_labels.method='llm_tiebreaker_failed'`, surface in dashboard for manual resolution. |
| Zapier (whitelisted IP for NXT) | NXT lookup transport | ✓ (operator-confirmed) | n/a | Phase blocked if NXT-Zap not buildable; planner must include operator-task to create the Zap. |
| `playwright-core` + Browserless CDP | Probe + label module | ✓ | as in `web/package.json` | — |
| Supabase Management API token | Migration apply | ⚠ | per Phase 50 deferred verification, token may be expired | Operator applies via Studio SQL Editor, or refresh token. |
| `LABELING_CRON_MUTATE` env var | Flip cron live mode | ✗ — to add | n/a | Default unset = shadow mode (safe). |
| `NXT_ZAPIER_WEBHOOK_URL/SECRET` env vars | NXT lookup | ✗ — to add | n/a | Plan must include "set env vars in Vercel" operator-step. |

**Missing dependencies with no fallback:**
- NXT contactperson schema confirmation (needs operator + Zapier access).
- Probe artifact (needs Browserless run on production iController per D-17).

**Missing dependencies with fallback:**
- Supabase Management API token: applying via Studio is documented (Phase 50, 52, 53 precedents).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest + jsdom + @vitejs/plugin-react ([VERIFIED: `web/vitest.config.ts`]) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && pnpm vitest run tests/labeling --reporter=basic` |
| Full suite command | `cd web && pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-00/D-01 | Resolution pipeline runs thread→sender→identifier→LLM in order; sender-hit short-circuits regex+LLM | unit | `pnpm vitest run tests/labeling/resolve-debtor.test.ts -t "sender-first ordering"` | ❌ Wave 0 |
| D-03 | LLM only fires on multi-candidate ambiguity | unit | `pnpm vitest run tests/labeling/resolve-debtor.test.ts -t "LLM skipped on single-hit"` | ❌ Wave 0 |
| D-04/D-05 | NXT-Zap client sends `{nxt_database, lookup_kind, payload}` with Bearer auth, 25s timeout | unit | `pnpm vitest run tests/labeling/nxt-zap-client.test.ts` | ❌ Wave 0 |
| D-06 | Route 404s when `labeling_settings.nxt_database` is null | integration | `pnpm vitest run tests/labeling/route.test.ts -t "no nxt_database"` | ❌ Wave 0 |
| D-08/D-31 | Migration extends `classifier_rules.kind` CHECK; seeds resolver:invoice_legacy_regex | manual-only | `psql -c "select kind from public.classifier_rules where rule_key='resolver:invoice_legacy_regex'"` | n/a (operator) |
| D-13 | LLM tiebreaker output validated by Zod, returns on bad json | unit | `pnpm vitest run tests/labeling/llm-tiebreaker.test.ts` | ❌ Wave 0 |
| D-15/D-16 | `labelEmail` is no-op when current state matches; warns + skips on conflict | unit (mocked Page) | `pnpm vitest run tests/labeling/label-email-in-icontroller.test.ts` | ❌ Wave 0 |
| D-17 | Probe artifact is checked in to `.planning/briefs/artifacts/` | manual-only | `ls .planning/briefs/artifacts/debtor-email-label-probe-*` | n/a (operator-run) |
| D-20/D-22 | Page renders RPC counts; tree groups by mailbox | component | `pnpm vitest run tests/labeling/page.test.tsx` | ❌ Wave 0 |
| D-21 | Approve/Reject server actions write `agent_runs.human_verdict` and `email_labels.reviewed_*` synchronously | unit | `pnpm vitest run tests/labeling/actions.test.ts` | ❌ Wave 0 |
| D-23 | Drawer subscribes via AutomationRealtimeProvider; channel `automations:debtor-email-labeling:stale` | smoke | `pnpm vitest run tests/labeling/drawer.test.tsx -t "broadcast channel"` | ❌ Wave 0 |
| D-24/D-25 | Flip cron promotes at N≥50 + CI-lo≥0.95; demotes at <0.92; respects `LABELING_CRON_MUTATE=false` | unit | `pnpm vitest run tests/labeling/flip-cron.test.ts` | ❌ Wave 0 |
| D-28 | Every call writes `email_labels` row, even unresolved | integration | `pnpm vitest run tests/labeling/route.test.ts -t "always writes email_labels"` | ❌ Wave 0 |
| D-29 | 404 `email_not_ingested` when email_pipeline.emails missing | integration | `pnpm vitest run tests/labeling/route.test.ts -t "404 email_not_ingested"` | ❌ Wave 0 |
| D-30 | Smeba (mailbox_id=4) is the canary — flip-cron eval is per-mailbox | unit | `pnpm vitest run tests/labeling/flip-cron.test.ts -t "per-mailbox aggregation"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && pnpm vitest run tests/labeling --reporter=basic`
- **Per wave merge:** `cd web && pnpm vitest run`
- **Phase gate:** Full suite green + probe artifact checked in + dry-run results reviewed for Smeba before flipping `LABELING_CRON_MUTATE=true`.

### Wave 0 Gaps
- [ ] `web/tests/labeling/route.test.ts` — POST flow, 404 cases, dry-run gate
- [ ] `web/tests/labeling/resolve-debtor.test.ts` — 4-layer pipeline branches
- [ ] `web/tests/labeling/nxt-zap-client.test.ts` — request/response/timeout
- [ ] `web/tests/labeling/llm-tiebreaker.test.ts` — Zod validation, json_schema
- [ ] `web/tests/labeling/label-email-in-icontroller.test.ts` — idempotency
- [ ] `web/tests/labeling/flip-cron.test.ts` — Wilson per-mailbox, mutate flag
- [ ] `web/tests/labeling/page.test.tsx` — page render + tree
- [ ] `web/tests/labeling/drawer.test.tsx` — drawer + realtime channel
- [ ] `web/tests/labeling/actions.test.ts` — approve/reject sync write
- [ ] `web/lib/automations/debtor-email/probe-label-ui.ts` — probe artifact (Wave 0 BLOCKING for the Browserless module task)

Framework install: not needed (vitest already configured per `web/vitest.config.ts`).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Inbound: existing `AUTOMATION_WEBHOOK_SECRET` Bearer (route.ts already enforces). Outbound to NXT-Zap: new `NXT_ZAPIER_WEBHOOK_SECRET`. |
| V3 Session Management | yes | iController session reused via Supabase storageState (`@/lib/browser`); single-tenant credential. RLS on new tables = service-role-only writes. |
| V4 Access Control | yes | Dashboard `/automations/debtor-email-labeling` — Supabase auth + project_members gate (existing `(dashboard)` layout). Approve/Reject server actions service-role for table writes; UI gate by user session. |
| V5 Input Validation | yes | Zod on inbound webhook body (existing pattern). Zod on Orq.ai output. NXT-Zap response normalization via Zod. |
| V6 Cryptography | yes | No hand-rolled crypto. Bearer secrets in env vars. Credentials via existing `resolveCredentials` (encrypted storage). |
| V7 Error Handling | yes | Never log Bearer tokens or credentials. iController errors → screenshot before browser.close (CLAUDE.md). |
| V11 Business Logic | yes | Idempotency check (D-16) prevents duplicate label-applies. Dry-run kill-switch + `LABELING_CRON_MUTATE` env flag prevent unintended state mutations. |
| V12 File Upload | yes | Screenshot upload to `automation-screenshots` bucket — service-role only, signed URL TTL 1h. |

### Known Threat Patterns for {Vercel + Zapier + Browserless + iController}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replay of inbound webhook | Tampering / Repudiation | `email_labels (graph_message_id)` UNIQUE constraint OR `ON CONFLICT DO NOTHING` (idempotent insert). |
| Forged inbound webhook | Spoofing | Constant-time-equal Bearer check on `AUTOMATION_WEBHOOK_SECRET` (existing). |
| NXT-Zap response tampering | Tampering | Bearer `NXT_ZAPIER_WEBHOOK_SECRET` + Zod validation of response shape. |
| Information disclosure via screenshot URL | Info disclosure | Signed URL TTL 1h; bucket access service-role only; URL stored in `email_labels.screenshot_*_url` (RLS-protected). |
| Cross-brand data leak (sender resolves to wrong DB) | Tampering | `nxt_database` is per-mailbox; Vercel forwards it; Zap routes connections accordingly. Smoke-test required (Pitfall 5). |
| LLM prompt injection via email body | Tampering | LLM output strict-validated by Zod; `selected_account_id` MUST be from the candidates list (post-validate). |
| Browserless session hijack | Spoofing | iController storageState in Supabase Storage, service-role read; refreshed on stale-cookie detect. |
| Premature flip from dry_run to live | Tampering | `LABELING_CRON_MUTATE` env flag, default off; D-19/D-26 shadow-mode pattern. |

## Sources

### Primary (HIGH confidence) — VERIFIED in repo

- `web/vitest.config.ts` — test framework
- `web/lib/browser/screenshots.ts` — `automation-screenshots` bucket, signed URL TTL 1h
- `web/lib/automations/icontroller/session.ts` — single-tenant session reuse
- `web/lib/automations/runs/emit.ts` — broadcast channel pattern
- `web/lib/classifier/wilson.ts` — Wilson math + thresholds
- `web/lib/inngest/functions/classifier-promotion-cron.ts` — cron + step.run + shadow-mode pattern
- `web/app/api/automations/debtor/label-email/route.ts` — MVP route skeleton
- `web/app/api/automations/smeba/sugarcrm-search/route.ts` — Zapier sync-call pattern (timeout 18s)
- `supabase/migrations/20260423_debtor_email_labeling.sql` — existing email_labels schema
- `supabase/migrations/20260428_classifier_rules.sql` — `kind` CHECK location for D-08
- `web/lib/v7/briefing/schema.ts` — Zod + json_schema validation pattern
- `.planning/phases/56-icontroller-auto-labeling-van-accounts-aan-emails/56-CONTEXT.md` — locked decisions
- `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` — `agent_runs` discriminator
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-CONTEXT.md` — classifier engine

### Secondary (MEDIUM confidence)

- CLAUDE.md project instructions — Stack, Browserless patterns, Inngest cron rules, Orq.ai patterns
- Phase 56 source todo `2026-04-23-debtor-email-auto-labeling-in-icontroller.md` — iController URL pattern, mailbox IDs

### Tertiary (LOW confidence — flagged in Assumptions Log)

- NXT contactperson table schema (A1, A9) — operator must confirm
- iController message-detail URL pattern + label-DOM existence (A2, A3) — probe must confirm
- Orq.ai tiebreaker agent slug (A6) — operator must deploy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive verified in repo, no new installs
- Architecture: HIGH — composition over Phase 55+59+60, all integration points exist
- NXT integration: MEDIUM — first synchronous Zap-call pattern in this codebase; contactperson schema unknown
- iController label-DOM: MEDIUM — no probe artifact; Wave 0 probe is mandatory
- Pitfalls: HIGH — most are verified-from-prior-phase known issues
- Validation architecture: HIGH — vitest + jsdom infra already exists per Phase 60-00

**Research date:** 2026-04-28
**Valid until:** 2026-05-28 (30 days; stack is stable, but iController DOM probe results may shift the Browserless module's selectors).

## RESEARCH COMPLETE

# Phase 84: Stage 1 noise rules for AP-automation FYI traffic — Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 11 new/modified
**Analogs found:** 10 / 11 (1 file has no direct analog — `gen-tenant-domains.ts` closely mirrors `gen-entity-types.ts`)

> **Hard-separation reminder (enforced throughout):** every row Phase 84 writes goes to `swarm_noise_categories` (Stage 1) — NEVER `swarm_intents` (Stage 3). Static-check test in Wave 0 enforces (`SELECT INTERSECT ... = 0 rows`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/20260520_phase84_tenant_domains.sql` (NEW) | migration | DDL (column-add + UPDATE) | `supabase/migrations/20260504b_swarms_registry_generalisation.sql` | exact (ALTER swarms ADD COLUMN + per-swarm UPDATE) |
| `supabase/migrations/20260520_phase84_noise_categories.sql` (NEW) | migration | DML (idempotent UPSERT × 16) | `supabase/migrations/20260511_swarm_noise_spam_key.sql` | exact (canonical cross-swarm noise INSERT) |
| `supabase/migrations/20260520_phase84_classifier_rules_seed.sql` (NEW) | migration | DML (INSERT 8 candidate rows) | `supabase/migrations/20260428_classifier_rules.sql` (schema) | role-match (no prior seed migration exists; pattern derived from schema + Phase 60 D-05 rule_key naming) |
| `web/scripts/gen-tenant-domains.ts` (NEW) | utility / codegen | batch transform (DB read → file write) | `web/scripts/gen-entity-types.ts` | exact (mirror line-for-line; per-swarm map shape per Open Q #4) |
| `web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts` (NEW, auto-emitted) | generated config | static export | `web/lib/automations/debtor-email/coordinator/entity.generated.ts` (existing) | exact |
| `web/package.json` (MODIFY — extend `codegen` npm script) | config | n/a | existing `codegen` script entry | role-match |
| `web/lib/debtor-email/classify.ts` (MODIFY — add 8 matchers) | service / classifier | request-response (pure function) | self (existing matchers in the same file, lines 44–197) | exact (intra-file precedent for every new regex) |
| `web/lib/inngest/functions/classifier-screen-worker.ts` (MODIFY — loopback rule + `direction` plumbing) | controller (Inngest worker) | event-driven | self (existing step.run blocks lines 167–216) | exact |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` (MODIFY — retire `TENANT_DOMAINS` stub at line 50) | controller (Inngest fn) | event-driven | self (TODO comment in-file is the wiring contract) | exact |
| `web/lib/debtor-email/__tests__/classify.test.ts` (MODIFY — add 8 test groups) | test | unit | self (existing test file, lines 16–80 show the pattern) | exact |
| `web/__tests__/static-checks/swarm-hard-separation.test.ts` (NEW) | test | integration / static | no prior static-check file exists at this path | no-analog (write from scratch; pattern below) |
| `.planning/phases/84-*/CORPUS-SAMPLES.md` (NEW) | docs / fixtures | n/a | no analog | no-analog (free-form table) |

## Pattern Assignments

---

### `supabase/migrations/20260520_phase84_noise_categories.sql` (migration, idempotent UPSERT × 16)

**Analog:** `supabase/migrations/20260511_swarm_noise_spam_key.sql` (verbatim cross-swarm UPSERT)

**Cross-swarm INSERT + ON CONFLICT pattern** (lines 30–41):
```sql
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'spam', 'Spam', 'Spam', 'categorize_archive', null, 25),
  ('sales-email',  'spam', 'Spam', 'Spam', 'categorize_archive', null, 25)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();
```

**Header comment pattern** (lines 1–28 — preserve the asymmetry note):
- Explain debtor-email = regex Pass 1 in `classify.ts`
- Explain sales-email = LLM 2nd-pass picks up the key from the call-time closed list
- State explicitly "does NOT add a row to `swarm_intents`" (hard-separation invariant)

**Apply to all 8 Phase 84 categories:** copy this block per category, swap the `category_key` / `display_label` / `outlook_label` / `display_order` triple. `action='categorize_archive'`, `swarm_dispatch=null` for all 8 per D-04.

---

### `supabase/migrations/20260520_phase84_tenant_domains.sql` (migration, DDL + UPDATE)

**Analog:** `supabase/migrations/20260504b_swarms_registry_generalisation.sql`

**ALTER TABLE additive column pattern** (lines 10–15):
```sql
alter table public.swarms
  add column if not exists stage1_regex_module        text,
  add column if not exists stage2_entity_resolver     text,
  add column if not exists stage3_coordinator_agent_key text,
  add column if not exists canonical_context_shape    jsonb,
  add column if not exists entity_brand               jsonb;
```

**Adapt to Phase 84:**
```sql
alter table public.swarms
  add column if not exists tenant_domains jsonb not null default '[]'::jsonb;
```

**Per-swarm UPDATE backfill pattern** (lines 44–85, simplified):
```sql
update public.swarms
   set entity_brand = jsonb_build_array('smeba','smeba-fire','sicli-noord','sicli-sud','berki')
 where swarm_type = 'debtor-email';
```

**Adapt to Phase 84 (use `jsonb_build_array` or raw `'[...]'::jsonb`):**
```sql
update public.swarms
   set tenant_domains = '["fire-control.nl","moyneroberts.com","smeba-fire.be","smeba.nl"]'::jsonb
 where swarm_type = 'debtor-email';
update public.swarms
   set tenant_domains = '["smeba.nl"]'::jsonb  -- operator confirms during planning
 where swarm_type = 'sales-email';
```

**No new RLS policies needed** — `public.swarms` already has them (`20260429b_swarm_registry.sql:67-83` per RESEARCH §Pattern 2). Column-add inherits.

---

### `supabase/migrations/20260520_phase84_classifier_rules_seed.sql` (migration, INSERT candidate rows)

**Analog:** `supabase/migrations/20260428_classifier_rules.sql` (schema source-of-truth)

**Schema columns relevant to Phase 84 seed** (lines 5–23):
```sql
create table if not exists public.classifier_rules (
  id              uuid primary key default gen_random_uuid(),
  swarm_type      text not null,
  rule_key        text not null,
  kind            text not null check (kind in ('regex', 'agent_intent')),
  status          text not null check (status in (
    'candidate', 'promoted', 'demoted', 'manual_block'
  )) default 'candidate',
  n               int not null default 0,
  agree           int not null default 0,
  ...
  unique (swarm_type, rule_key)
);
```

**Phase 84 seed pattern (per Open Q #3 recommendation — flat `rule_key = category_key`, `kind='regex'`, default `status='candidate'`):**
```sql
insert into public.classifier_rules (swarm_type, rule_key, kind, status, notes)
values
  ('debtor-email', 'coupa_invoice_paid_notification',    'regex', 'candidate', 'Phase 84 D-01. Promotion gate: D-05 (Wilson-CI OR corpus-evidence).'),
  ('debtor-email', 'coupa_invoice_approved_notification','regex', 'candidate', 'Phase 84 D-01.'),
  -- ... 6 more for debtor-email
  -- sales-email gets the same 8 rule_keys (kind='agent_intent' since Pass 2 LLM is what fires the rule)
  ('sales-email',  'coupa_invoice_paid_notification',    'agent_intent', 'candidate', 'Phase 84 D-08. LLM 2nd-pass attribution; no regex module for sales-email.')
on conflict (swarm_type, rule_key) do nothing;
```

**Why `kind` differs per swarm:** the schema check constraint allows `'regex'` (debtor-email matchers in `classify.ts`) or `'agent_intent'` (LLM 2nd-pass picks the key from the call-time closed list — Pitfall 5 in RESEARCH).

---

### `web/scripts/gen-tenant-domains.ts` (utility, codegen — NEW)

**Analog:** `web/scripts/gen-entity-types.ts` (verbatim mirror)

**Imports + dotenv loading** (lines 15–26):
```typescript
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: resolve(__dirname, "..", ".env.local") });
```

**OUTPUT_PATH + HEADER** (lines 28–44):
```typescript
const OUTPUT_PATH = resolve(__dirname, "..", "lib", "automations",
  "debtor-email", "coordinator", "entity.generated.ts");

const HEADER = `// AUTO-GENERATED by scripts/gen-entity-types.ts ...
// DO NOT EDIT BY HAND. Run \`npm run codegen\` after registry changes.
`;
```

**Idempotency block (copy verbatim — line 81–90):**
```typescript
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
const existing = existsSync(OUTPUT_PATH)
  ? readFileSync(OUTPUT_PATH, "utf8")
  : null;
if (existing === next) {
  console.log("[gen-tenant-domains] already up-to-date — no write");
  return;
}
writeFileSync(OUTPUT_PATH, next, "utf8");
```

**Alphabetical sort pattern (line 52):** `const sorted = [...codes].sort();` — apply per-swarm domain list.

**Phase 84 deviation from analog: per-swarm map shape (Open Q #4 recommendation):**
```typescript
// Render body — produces:
export const TENANT_DOMAINS_BY_SWARM = {
  "debtor-email": ["fire-control.nl","moyneroberts.com","smeba-fire.be","smeba.nl"],
  "sales-email":  ["smeba.nl"],
} as const;
export type TenantDomain = (typeof TENANT_DOMAINS_BY_SWARM)[keyof typeof TENANT_DOMAINS_BY_SWARM][number];
```
DB read: `select swarm_type, tenant_domains from public.swarms order by swarm_type;` (sorted in TS to keep diffs stable).

---

### `web/lib/debtor-email/classify.ts` (service / classifier — MODIFY: add 8 regex matchers)

**Analog:** self — the file's own existing matchers (lines 44–197) ARE the pattern.

**Regex declaration pattern (sender + subject anchored, with comment block citing observed corpus):** lines 65–66, 116–117, 130–131:
```typescript
// SUBJECT_PAID_MARKER — observed: CBRE portal forwards (lines 119–129 comment).
const SUBJECT_PAID_MARKER =
  /(gemarkeerd\s+als\s+betaald|goedgekeurd\s+voor\s+betaling|marked\s+as\s+paid|approved\s+for\s+payment|released\s+for\s+payment)/i;
```

**Branch placement (specificity-first, first-match-wins — Pitfall 2):** lines 247–326. Existing block has explicit ordering:
1. `[SPAM]` prefix hard-block (line 273) — same shape Phase 84 Coupa-Betaald rule follows
2. Auto-reply family (line 292)
3. Payment family (lines 319–360)

**Phase 84 placement directive:** new rules go **BEFORE** `SUBJECT_AUTO_REPLY` and `SENDER_PAYMENT_ROLE` branches. The 6 ISS-PtP / Coupa rules must precede `SUBJECT_AUTO_REPLY` (Pitfall 2: a broad `Automatisch antwoord:` match would swallow them).

**Return shape (line 274):**
```typescript
return { category: "spam", confidence: 0.99, matchedRule: "subject_spam_prefix" };
```

**Phase 84 needs new Category union members.** Existing union (lines 19–25):
```typescript
export type Category =
  | "auto_reply" | "ooo_temporary" | "ooo_permanent"
  | "payment_admittance" | "spam" | "unknown";
```
Extend by adding the 8 new category_keys (`coupa_invoice_paid_notification`, etc.). NB: union string-equality must match `swarm_noise_categories.category_key` exactly.

**Coupa-Betaald regex template (D-06 anchored — derived from observed subject):**
```typescript
const SUBJECT_COUPA_INVOICE_PAID =
  /^Factuur\s+\d+\s+gemarkeerd\s+als\s+Betaald\s+door\s+ISS$/i;
```

**Loopback rule — DO NOT put in `classify.ts`** (per Pitfall 3 recommendation). The `classify()` signature today is `{subject, from, bodySnippet}` and the worker passes `from: ""` (line 205). Place loopback evaluation in the screen-worker instead — see next file.

---

### `web/lib/inngest/functions/classifier-screen-worker.ts` (controller — MODIFY: loopback rule)

**Analog:** self — existing step.run blocks (lines 167–216) ARE the pattern.

**`step.run` block pattern (lines 167–177):**
```typescript
const { swarmRow, categories } = await step.run("load-swarm-row", async () => {
  const sw = await loadSwarm(admin, swarm_type);
  if (!sw) throw new Error(`swarms row not found for ${swarm_type}`);
  const cats = await loadSwarmNoiseCategories(admin, swarm_type);
  return { swarmRow: sw, categories: cats };
});
```

**Loopback evaluation placement (after regex Pass 1, before LLM Pass 2 — verified Pitfall 3 recommendation from RESEARCH §336–351):**

Insert AFTER `step.run("regex", ...)` (line 216) and BEFORE `if (regexOutcome.category === "unknown")` (line 227):

```typescript
// Phase 84 D-03 — own_outbound_invoice_loopback. Evaluated in the worker
// (not classify.ts) because classify.ts signature does NOT carry `from` or
// `direction`. Stage 1, noise filter only (NOT a Stage 3 intent).
if (regexOutcome.category === "unknown") {
  const tenantDomains = (swarmRow.tenant_domains as string[] | undefined) ?? [];
  const fromDomain = (fromFromEvent ?? "").split("@")[1]?.toLowerCase() ?? "";
  // D-03 guard: direction='inbound' prevents spoofed external sender abuse
  // (R-02 mitigation). `direction` source per Open Q #1: extend event payload
  // OR DB lookup of email_pipeline.emails.direction. Recommendation:
  // event-widening (cleaner; matches existing `from`/`receivedAt` passthrough
  // already present at line 138–144).
  if (direction === "inbound" && fromDomain && tenantDomains.includes(fromDomain)) {
    regexOutcome.category = "own_outbound_invoice_loopback";
    regexOutcome.matchedRule = "loopback_tenant_domain";
    regexOutcome.invoked = true;
  }
}
```

**Event-widening pattern (the existing passthrough at lines 136–144 is the template):**
```typescript
// Phase 82.2 Plan 07 D-A passthrough fields
mailbox_id: mailboxIdFromEvent,
from: fromFromEvent,
fromName: fromNameFromEvent,
receivedAt: receivedAtFromEvent,
```
Add `direction: directionFromEvent` in the same destructure block; producer (`stage-0-safety-worker.ts`) must populate it from `email_pipeline.emails.direction`.

**`SendFn` cast pattern for any new event emit (lines 82–87 — CLAUDE.md `dae6276` rule):**
```typescript
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
// usage: await (inngest.send as unknown as SendFn)({ name: ..., data: ... });
```

**`SwarmRow` type extension required.** Add `tenant_domains: string[]` to `web/lib/swarms/types.ts`. Cache TTL (60s, `loadSwarm`) handles propagation automatically.

---

### `web/lib/inngest/functions/debtor-email-coordinator.ts` (controller — MODIFY: retire `TENANT_DOMAINS` stub)

**Analog:** self — lines 46–50 are an explicit wiring contract.

**Existing stub (lines 46–50):**
```typescript
// Phase 83 Plan 06 (D-08 fallback) — static tenant-domain list while
// swarms.tenant_domains is not yet registry-driven. TODO(phase-84 D-03):
// swap to a registry lookup over swarms.tenant_domains JSONB once Phase 84
// ships that column. See T-83-19 mitigation in 83-06-PLAN.md.
const TENANT_DOMAINS = ["smeba.nl", "smeba-fire.be", "moyneroberts.com"];
```

**Phase 84 replacement (two equivalent options — choose at planning time):**

Option A (registry read via `loadSwarm`, runtime):
```typescript
import { loadSwarm } from "@/lib/swarms/registry";
// ... inside the function, in a step.run that already loads the swarm:
const swarm = await loadSwarm(admin, SWARM_TYPE);
const tenantDomains = (swarm?.tenant_domains as string[] | undefined) ?? [];
```

Option B (generated import, compile-time):
```typescript
import { TENANT_DOMAINS_BY_SWARM } from "@/lib/automations/debtor-email/coordinator/tenant-domains.generated";
const tenantDomains = TENANT_DOMAINS_BY_SWARM[SWARM_TYPE] ?? [];
```

Phase 84 D-03 + Pitfall 4 (codegen drift) favours **Option B** for build-time literal-union safety, mirroring `entity.generated.ts` precedent. Option A is the fallback if the codegen path is descoped.

---

### `web/lib/debtor-email/__tests__/classify.test.ts` (test — MODIFY: add 8 test groups)

**Analog:** self (existing TDD-style test, lines 16–80).

**Test group structure (lines 16–46):**
```typescript
describe("60-09 SUBJECT_TICKET_REF — exclude factuurportal IDs", () => {
  it("FP-2026-270485 (invoice rejection) does NOT match subject_ticket_ref", () => {
    const result = classify({
      subject: "FP-2026-270485: Uw factuur voor de gemeente Overbetuwe ...",
      from: "no-reply@factuurportal.eu",
      bodySnippet: "Helaas kan uw factuur niet door ons verwerkt worden ...",
    });
    expect(result.matchedRule).not.toBe("subject_ticket_ref");
  });
  // ... positive + negative + boundary fixtures
});
```

**Phase 84 needs 8 describe-groups × 3 fixtures each (positive / negative / boundary)** per RESEARCH §Wave 0 Gaps. The loopback group additionally needs `direction='outbound'` negative + spoofed-external-from negative (D-03 guard verification) — but those test the WORKER, not `classify.ts`. Loopback worker tests go in `classifier-screen-worker.test.ts` (extending the existing test file at the same level).

---

### `web/__tests__/static-checks/swarm-hard-separation.test.ts` (test — NEW, no analog)

**No analog file at this path.** RESEARCH flags this as a Wave 0 net-new test. Pattern derived from invariant alone:

```typescript
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe("Hard-separation invariant: swarm_noise_categories ∩ swarm_intents = ∅", () => {
  it("returns zero rows when intersecting both registries by (swarm_type, key)", async () => {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await admin.rpc("exec_sql", { sql: `
      select n.swarm_type, n.category_key
        from public.swarm_noise_categories n
        join public.swarm_intents i
          on i.swarm_type = n.swarm_type
         and i.intent_key = n.category_key
    `});
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
```
(Use direct SQL via `psql`/REST if no `exec_sql` RPC exists — RESEARCH §Validation Architecture leaves the binding to planner discretion.)

---

### `supabase/migrations/_template.sql` reminder for any new table

Not adding a new table in Phase 84 (column-add only on existing `public.swarms`). But for the planner's reference, the template's mandatory block (lines 33–44) — `ENABLE RLS` + at least one `service_role` policy — does NOT apply here. RLS is already enabled on `public.swarms`.

## Shared Patterns

### Cross-swarm idempotent UPSERT
**Source:** `supabase/migrations/20260511_swarm_noise_spam_key.sql:30-41`
**Apply to:** the 8 `swarm_noise_categories` rows × 2 swarms = 16 inserts (one SQL file, one INSERT statement per category with two VALUES rows; `on conflict do update set ... updated_at = now()` for safe re-runs).

### CLAUDE.md / Phase 65 `inngest.send` cast (no destructuring)
**Source:** `web/lib/inngest/functions/classifier-screen-worker.ts:82-87`
**Apply to:** any new event emit in `classifier-screen-worker.ts` (likely none in Phase 84 — loopback returns inline without emitting a new event, just sets `regexOutcome.category`).

### Codegen idempotency (read-existing → compare → skip write)
**Source:** `web/scripts/gen-entity-types.ts:81-90`
**Apply to:** `gen-tenant-domains.ts` (verbatim copy of the 10-line block).

### `step.run` for any DB side effect
**Source:** `web/lib/inngest/functions/classifier-screen-worker.ts:167-177` and `step.run("regex", ...)` at 181
**Apply to:** the loopback evaluation MAY be inline (no side effect, just an in-memory boolean check) — but if the planner chooses Option A (per-call registry read of tenant_domains), wrap it in `step.run("load-tenant-domains", ...)`. Option B (generated import) needs no `step.run`.

### Wilson-CI promotion gate (NO change — Phase 60 infrastructure)
**Source:** `web/lib/inngest/functions/classifier-promotion-cron.ts` (existing, untouched by Phase 84)
**Apply to:** all 8 new `classifier_rules.rule_key` rows will be auto-picked up by the cron once `classifier_rule_telemetry` view sees `agent_runs.rule_key` matches. D-05 corpus-evidence path = operator hand-flips `classifier_rules.status='promoted'` (no new code).

### Hard-separation invariant
**Source:** `supabase/migrations/20260507_phase75_swarm_categories_data_cleanup.sql` (precedent: that migration explicitly DELETEs intent keys from the noise table)
**Apply to:** every Phase 84 INSERT must verify that the same `(swarm_type, category_key)` does NOT exist in `swarm_intents`. Wave 0 static-check test enforces.

## No Analog Found

| File | Role | Data Flow | Reason / fallback |
|------|------|-----------|--------------------|
| `web/__tests__/static-checks/swarm-hard-separation.test.ts` | test | integration | No prior static-check test directory in repo; pattern written from scratch (see above). |
| `.planning/phases/84-*/CORPUS-SAMPLES.md` | docs | n/a | Free-form fixture log; no standard schema. Use email_id + subject + sender + verdict table per category. |
| `web/scripts/gen-tenant-domains.ts` (output **shape**) | utility | n/a | `gen-entity-types.ts` produces a flat tuple; Phase 84 needs a per-swarm map (Open Q #4). Mechanics copied; render-body shape is novel. |

## Metadata

**Analog search scope:**
- `supabase/migrations/` (filtered: `20260428*`, `20260429b*`, `20260504b*`, `20260507_phase75*`, `20260511*`, `_template*`)
- `web/scripts/gen-entity-types.ts` (codegen precedent, Phase 69 D-03)
- `web/lib/debtor-email/classify.ts` (intra-file matcher precedent)
- `web/lib/inngest/functions/classifier-screen-worker.ts` (step.run + SendFn pattern)
- `web/lib/inngest/functions/debtor-email-coordinator.ts` (existing `TENANT_DOMAINS` stub + TODO wiring contract)
- `web/lib/debtor-email/__tests__/classify.test.ts` (existing TDD pattern)

**Files scanned:** 8 (7 analogs read end-to-end; classifier-screen-worker partially — first 260 lines covering the relevant step.run blocks).

**Pattern extraction date:** 2026-05-20

## PATTERN MAPPING COMPLETE

**Phase:** 84 - stage-1-noise-rules-for-ap-automation-fyi-traffic
**Files classified:** 11
**Analogs found:** 10 / 11

### Coverage
- Files with exact analog: 9 (the 2 migrations, codegen mirror, generated file, classify.ts intra-file, screen-worker self, coordinator self, classify test self, package.json)
- Files with role-match analog: 1 (classifier_rules seed — schema-derived, no prior seed migration to copy verbatim)
- Files with no analog: 2 (`swarm-hard-separation.test.ts` net-new; `CORPUS-SAMPLES.md` free-form)

### Key Patterns Identified
- Every Phase 84 INSERT goes to `swarm_noise_categories` ONLY (hard-separation invariant; RESEARCH Pitfall 1 + Wave 0 static-check enforces).
- Cross-swarm noise rows follow `20260511_swarm_noise_spam_key.sql` verbatim — one INSERT with two VALUES rows + idempotent ON CONFLICT.
- `swarms.tenant_domains` column-add mirrors the Phase 68 `entity_brand` precedent (additive jsonb with default + per-swarm UPDATE backfill).
- Codegen for `tenant_domains` is a 1:1 structural mirror of `gen-entity-types.ts` — only the OUTPUT_PATH, DB query, and `renderBody()` shape (per-swarm map vs flat tuple) differ.
- `classify.ts` is first-match-wins; all 8 new matchers go BEFORE existing `SUBJECT_AUTO_REPLY` / `SENDER_PAYMENT_ROLE` to avoid Pitfall 2 swallowing.
- Loopback rule (`own_outbound_invoice_loopback`) lives in `classifier-screen-worker.ts`, NOT `classify.ts`, because the regex module's signature lacks `from` and `direction` — Pitfall 3 recommended placement.

### File Created
`/Users/nickcrutzen/Developer/Agent Workforce/.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files. Recommended wave structure aligns with RESEARCH §Ready for Planning:
- **Wave 0**: tests (`classify.test.ts` 8 groups + worker loopback tests + `swarm-hard-separation.test.ts`) + `CORPUS-SAMPLES.md` fixtures + sales-email per-category corpus review (D-08 R-04 mitigation).
- **Wave 1**: 3 migrations (column-add + 16 noise rows + 8 classifier_rules seed) + codegen (`gen-tenant-domains.ts` + generated file + `package.json` chain) + retire `debtor-email-coordinator.ts:50` `TENANT_DOMAINS` stub.
- **Wave 2**: `classify.ts` 8 regex matchers + `classifier-screen-worker.ts` loopback wiring (event payload widening for `direction` OR worker-side `email_pipeline.emails` lookup).
- **Wave 3**: 7-day shadow window + corpus-evidence path executed + D-05 gate satisfied → promote to `auto_active`.

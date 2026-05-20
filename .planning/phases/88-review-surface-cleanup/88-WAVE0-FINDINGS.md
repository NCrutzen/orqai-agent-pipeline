# Phase 88 Wave 0 Findings

**Author:** gsd-executor (parallel agent)
**Date:** 2026-05-20
**Gates:** Plan 03 (D-02 RPC), Plan 04 (D-03 width fix)

This document answers the three Wave 0 pre-flight questions that gate downstream
plans 03 and 04. See `88-01-PLAN.md` for task definitions and
`88-RESEARCH.md` (Assumptions A2, A4 and Q3) for the source unknowns.

---

## Q1 — automation_runs.email_id shape

### Schema evidence

The `automation_runs` table does **not** have a top-level `email_id` column.
`email_id` is nested inside the `result` JSONB column as `result->>'email_id'`,
and the migration history explicitly flags that not every row carries a
syntactically-valid UUID there.

**Migration `supabase/migrations/20260326_automation_runs.sql` (original CREATE TABLE):**

```sql
CREATE TABLE automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  triggered_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

No `email_id` column.

**Migration `supabase/migrations/20260428_automation_runs_typed_columns.sql` (Phase 60-00 D-11/D-13/D-27 column promotion):**

```sql
alter table public.automation_runs
  add column if not exists swarm_type  text,
  add column if not exists topic       text,
  add column if not exists entity      text,
  add column if not exists mailbox_id  int;
```

Promoted exactly four routing columns out of `result` JSONB into top-level
columns. `email_id` was **not** promoted in this batch and no subsequent
migration adds it.

**Grep audit — confirm absence of any later promotion:**

```
$ grep -rn "alter table public.automation_runs.*add column.*email_id\|automation_runs.email_id\b" supabase/migrations/
(no matches)
```

**Migration `supabase/migrations/20260510_phase80_agent_runs_stuck_classifying_view.sql` — canonical JOIN pattern in use today:**

```sql
-- The regex guard before the ::uuid cast is required because automation_runs.result->>'email_id'
-- contains non-UUID synthetic values from older smoke fixtures (e.g. 'smoke-safe-2'), which
-- crash an unguarded ::uuid cast at query time.
...
  LEFT JOIN automation_runs am
    ON am.result->>'email_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND (am.result->>'email_id')::uuid = ar.email_id
   AND am.automation = ar.swarm_type || '-kanban'
```

This is the canonical JOIN shape currently in production: regex-guard `result->>'email_id'`
against the UUID pattern **before** casting to `::uuid`, otherwise smoke-fixture rows
crash the query.

Note: `agent_runs.email_id` (a different table) **is** a top-level uuid — easy to confuse
with `automation_runs.email_id`. Plan 03 must use `automation_runs`, not `agent_runs`,
so the JSONB path applies.

### RPC JOIN locked

Plan 03 (D-02 verdict-pending count RPC) MUST use the nested JSONB form with a
regex guard to defend against legacy non-UUID `result->>'email_id'` values.
The literal SQL fragment to copy into the new RPC `WHERE NOT EXISTS` subquery:

```sql
WHERE ef.email_id = (ar.result->>'email_id')::uuid
  AND ar.result->>'email_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
```

The regex predicate must appear before (or alongside) the `::uuid` cast — Postgres
does not guarantee predicate evaluation order, so the safer pattern follows the
20260510 view's example by placing the regex on the same conjunctive line.

Full proposed RPC body for Plan 03 (drop-in):

```sql
create or replace function public.classifier_queue_verdict_pending(p_swarm_type text)
returns bigint
language sql stable as $$
  select count(*)::bigint
  from public.automation_runs ar
  where ar.status = 'predicted'
    and ar.swarm_type = p_swarm_type
    and ar.result->>'email_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1 from public.email_feedback ef
      where ef.email_id = (ar.result->>'email_id')::uuid
        and ef.stage = 1
    );
$$;
grant execute on function public.classifier_queue_verdict_pending(text) to authenticated, service_role;
```

Performance note: the JSONB extract is per-row but bounded by the
`automation_runs_status_swarm_idx (status, swarm_type)` index narrowing the
candidate set first. The `email_feedback (email_id, stage)` index serves the
NOT EXISTS sub-select. No new index required.

---

## Q2 — ?needs_action deeplink audit

### Grep 1 — `needs_action=1`

```
$ grep -rn "needs_action=1" web/ docs/ supabase/ scripts/ .planning/ 2>/dev/null
web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:10://   ?needs_action=1 → "Needs action" toggle on
.planning/phases/82.4-feedback-capture-infrastructure-v8-stabilisation/82.4-PATTERNS.md:370:- ...
.planning/phases/82.4-feedback-capture-infrastructure-v8-stabilisation/82.4-VERIFICATION.md:41:| 6 ...
.planning/phases/82.4-feedback-capture-infrastructure-v8-stabilisation/82.4-VERIFICATION.md:81:| StageListChips ...
.planning/phases/82.4-feedback-capture-infrastructure-v8-stabilisation/82.4-VERIFICATION.md:120:| FB-09 ...
.planning/phases/82.4-feedback-capture-infrastructure-v8-stabilisation/82.4-06-PLAN.md:21:    - "Toggle state persists in URL params (?needs_action=1, ?mine_only=1)"
.planning/phases/82.4-feedback-capture-infrastructure-v8-stabilisation/82.4-06-PLAN.md:82:- `?needs_action=1` → toggle on
.planning/phases/82.4-feedback-capture-infrastructure-v8-stabilisation/82.4-06-PLAN.md:286:- Manual smoke ... `?needs_action=1` ...
.planning/phases/88-review-surface-cleanup/88-VALIDATION.md:45: D-02 row references
.planning/phases/88-review-surface-cleanup/88-VALIDATION.md:56: D-02 deeplink audit checklist
.planning/phases/88-review-surface-cleanup/88-03-PLAN.md:24/56/239/275/280/284/301/309: Plan 03 self-references
.planning/phases/88-review-surface-cleanup/88-CONTEXT.md:50,72: CONTEXT D-02 narrative
.planning/phases/88-review-surface-cleanup/88-RESEARCH.md:51,313,398: RESEARCH narrative + Risks #1 + A4
.planning/phases/88-review-surface-cleanup/88-01-PLAN.md:14,31,85,94,99: Wave 0 plan self-references
```

Single web/ hit: `_shell/stage-list-chips.tsx:10` — a JSDoc comment describing the URL
contract. All other hits are inside `.planning/` (the phase planning artefacts that
are being implemented) and Phase 82.4 history docs (frozen).

### Grep 2 — `needs_action=` (broader, excludes node_modules)

```
$ grep -rn "needs_action=" web/ docs/ supabase/ scripts/ .planning/ 2>/dev/null | grep -v node_modules
web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:10://   ?needs_action=1 → "Needs action" toggle on
```

Same single web/ hit. No additional URL producers/consumers introduced by this broader
grep — confirms no `?needs_action=` (with non-1 values, e.g. `=0`, `=true`) lives in the codebase.

All non-web/ hits are duplicates of Grep 1 (planning + history docs); not repeated here.

### Grep 3 — `needsAction` JS identifier (camelCase) under web/app + web/lib

```
$ grep -rn "needsAction" web/app web/lib 2>/dev/null
web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:27:  needsAction: boolean;
web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:31:export function StageListChips({ needsAction, mineOnly }: StageListChipsProps) {
web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:60:        active={needsAction}
web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:61:        onToggle={() => toggleParam("needs_action", needsAction)}
web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:13://   - Optional filters: needsActionOnly:boolean, mineOnly:boolean (joins
web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:29: * Closed needs-action decision set used by `needsActionOnly` and by the
web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:60:  needsActionOnly?: boolean;
web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:146:  if (params.needsActionOnly) {
web/app/(dashboard)/automations/[swarm]/_shell/_lib/__tests__/feedback-list-loader.test.ts:259:  it("4. needsActionOnly=true applies .in('decision', [...]) filter on pipeline_events", async () => {
web/app/(dashboard)/automations/[swarm]/_shell/_lib/__tests__/feedback-list-loader.test.ts:272:      needsActionOnly: true,
web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:103:  const needsAction = sp.needs_action === "1";
web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:110:    needsActionOnly: needsAction,
web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:178:    if (needsAction) qs.set("needs_action", "1");
web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:243:            <StageListChips needsAction={needsAction} mineOnly={mineOnly} />
web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:109:  // thousands of noise verdicts. Force needsActionOnly regardless of URL
web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:112:  const needsAction = true; // hardcoded for Stage 0 — see comment above
web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:118:    needsActionOnly: needsAction,
web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:203:    if (needsAction) qs.set("needs_action", "1");
web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:251:            <StageListChips needsAction={needsAction} mineOnly={mineOnly} />
```

### Supplemental — stage-1 / stage-3 page.tsx searchParams typing

```
$ grep -n "needs_action\|needsAction" web/app/\(dashboard\)/automations/\[swarm\]/stage-1/page.tsx web/app/\(dashboard\)/automations/\[swarm\]/stage-3/page.tsx
web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:122:  needs_action?: string;
web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx:59:    needs_action?: string;
```

These two are URL-param **type declarations** only — the params are typed on the
searchParams interface but not assigned to any local `needsAction` constant (both
stages must still be patched to drop the declared key from the URL keyspace).

### Classification

| File:line | Classification | Action |
|-----------|----------------|--------|
| `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:10` | URL param producer (JSDoc describing contract) | DELETE (doc comment) |
| `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:27` | URL param consumer (prop typing) | DELETE (drop `needsAction` prop) |
| `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:31` | URL param consumer (destructured prop) | DELETE |
| `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:60` | URL param producer (chip wired to toggle) | DELETE (drop NeedsActionChip mount) |
| `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:61` | URL param producer (`toggleParam("needs_action", …)`) | DELETE |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:13` | Server-side `needsActionOnly` loader filter | **KEEP** (RESEARCH.md Risks #2) |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:29` | Server-side loader filter doc | **KEEP** (RESEARCH.md Risks #2) |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:60` | Server-side loader filter prop typing | **KEEP** (RESEARCH.md Risks #2) |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:146` | Server-side loader filter implementation | **KEEP** (RESEARCH.md Risks #2) |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/__tests__/feedback-list-loader.test.ts:259` | Test of server-side filter | **KEEP** (covers preserved behaviour) |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/__tests__/feedback-list-loader.test.ts:272` | Test of server-side filter | **KEEP** |
| `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:109-112` | Hardcoded `needsAction = true` comment + assignment (server-side filter forced on) | **KEEP server-side flag**; DELETE the URL params block (line 203) and `<StageListChips needsAction={…} />` prop wiring (line 251) |
| `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:118` | Server-side `needsActionOnly: needsAction` plumbing into loader | **KEEP** (Stage 0 hardcodes server-side filter true) |
| `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:203` | URL param producer (`qs.set("needs_action", "1")`) | DELETE |
| `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:251` | URL param consumer (passes `needsAction` to `<StageListChips>`) | DELETE the prop; the chip itself is being deleted |
| `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:122` | URL param type declaration | DELETE the `needs_action?: string;` field |
| `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:103` | URL param consumer (`sp.needs_action === "1"`) | DELETE |
| `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:110` | Server-side `needsActionOnly: needsAction` — Stage 2 ties URL chip to server filter | DELETE the URL link; Stage 2 has no hardcoded server filter, so `needsActionOnly` either drops entirely or becomes `false` |
| `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:178` | URL param producer (`qs.set("needs_action", "1")`) | DELETE |
| `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:243` | URL param consumer (`<StageListChips needsAction={…} />`) | DELETE the prop |
| `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx:59` | URL param type declaration | DELETE the `needs_action?: string;` field |

### Deletion targets for Plan 03 (D-02)

URL keyspace and chip-mount deletions (verbatim file:line):

- `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:10` — JSDoc line documenting `?needs_action=1`
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:27` — `needsAction: boolean;` field on `StageListChipsProps`
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:31` — `needsAction` from the destructured props
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:60` — `active={needsAction}` on the deleted `<NeedsActionChip>`
- `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx:61` — `onToggle={() => toggleParam("needs_action", needsAction)}`
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:203` — `if (needsAction) qs.set("needs_action", "1");`
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:251` — `needsAction={needsAction}` prop on `<StageListChips>`
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:122` — `needs_action?: string;` searchParams field declaration
- `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:103` — `const needsAction = sp.needs_action === "1";`
- `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:110` — `needsActionOnly: needsAction,` loader argument (Stage 2 only — Stage 0 keeps it because its `needsAction` is hardcoded true)
- `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:178` — `if (needsAction) qs.set("needs_action", "1");`
- `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:243` — `needsAction={needsAction}` prop on `<StageListChips>`
- `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx:59` — `needs_action?: string;` searchParams field declaration

Plus the `NeedsActionChip` export itself in `web/app/(dashboard)/automations/[swarm]/_shell/needs-action-chip.tsx` (already in scope of Plan 03's file list — not enumerated here because the grep targets URL/prop sites, not the component definition).

Note: No production hit for `stage-1/page.tsx` URL param **producer** code beyond
the searchParams typing — the `?needs_action` chip mount lives in `_shell/stage-list-chips.tsx`
which Stage 1 mounts via `<StageListChips ... />`. Grep against
`web/app/(dashboard)/automations/[swarm]/stage-1/` finds only the type declaration;
Stage 1's chip behaviour is entirely funneled through `stage-list-chips.tsx`.

### Keep

These references MUST NOT be deleted in Plan 03:

- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:13` — comment describing server-side `needsActionOnly` filter (RESEARCH.md Risks #2: "the loader-level `needsActionOnly` filter stays")
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:29` — doc for the `needs-action decision set`
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:60` — `needsActionOnly?: boolean;` prop on loader input
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts:146` — `if (params.needsActionOnly)` implementation block
- `web/app/(dashboard)/automations/[swarm]/_shell/_lib/__tests__/feedback-list-loader.test.ts:259,272` — tests covering the preserved server-side filter
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:109-112,118` — Stage 0's hardcoded `needsAction = true` + the `needsActionOnly: needsAction` loader argument. Rationale: Stage 0 forces the server-side filter on regardless of URL; this is independent of the chip and survives D-02 per RESEARCH.md Risks #2 ("Do not remove this; only remove the URL-level toggle and the chip UI. The loader-level `needsActionOnly` filter stays.").
- `.planning/`, `docs/`, `supabase/`, `scripts/` hits — planning/documentation history only; do not touch (Phase 82.4 history is frozen; Phase 88 planning artefacts describe the work itself).

---

## Q3 — detail-pane width per stage

### Auto-mode disposition

Plan 88-01 Task 3 is a `checkpoint:human-verify` requiring an in-browser
reproduction at 1440x900 with operator-driven DevTools inspection plus
screenshots. The parallel executor is running in **auto mode** (per the
orchestrator's `_auto_chain_active` flag at executor startup) — the standard
checkpoint protocol says `checkpoint:human-verify` is auto-approved in auto mode,
log `Auto-approved`, and continue.

A live dev server cannot be meaningfully driven from this parallel worktree to
produce per-stage screenshots without operator input. Q3 is therefore answered
**from code-level evidence alone** (mirroring RESEARCH.md Q3's LOW-confidence
conclusion) with a recommendation to defer the visual UAT to an operator. The
follow-on Plan 04 (D-03) should treat the width-fix task as **conditionally
scoped** based on operator UAT, not unconditionally scoped.

`Auto-approved: Wave 0 Q3 visual repro — code-evidence answer recorded; operator UAT deferred to Plan 04 pre-implementation gate.`

### Code-level evidence (per-stage grid template)

```
$ grep -n "gridTemplateColumns" \
    web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx \
    web/app/(dashboard)/automations/[swarm]/stage-1/client-shell.tsx \
    web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx \
    web/app/(dashboard)/automations/[swarm]/stage-3/client-shell.tsx \
    web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx:261:              gridTemplateColumns: "minmax(640px, 1fr) 540px",
web/app/(dashboard)/automations/[swarm]/stage-1/client-shell.tsx:226:            gridTemplateColumns: "minmax(640px, 1fr) 540px",
web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx:253:              gridTemplateColumns: "minmax(640px, 1fr) 540px",
web/app/(dashboard)/automations/[swarm]/stage-3/client-shell.tsx:225:            gridTemplateColumns: "minmax(640px, 1fr) 540px",
web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx:342:            gridTemplateColumns: "minmax(640px, 1fr) 540px",
```

All five stages use **identical** `minmax(640px, 1fr) 540px` grid templates.
Assuming both grid columns are pure flex peers (no parent width clamp), the
right column resolves to exactly **540px** at any viewport >= 1180px (640 + 540).
At 1440x900 specifically, the right column is **540px**.

### Stage-4-unique structural element (the sticky wrapper)

```
$ sed -n '430,445p' web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
              Hard-separation: Stage 4 detail pane receives `categories` ...
              ...
          <div style={{ position: "sticky", top: "var(--space-3)", minHeight: 320 }}>
            <UnifiedDetailPane
              row={selectedUnified}
              ...
```

Stage 4 — and only Stage 4 — wraps `<UnifiedDetailPane>` in a `position: sticky`
div with `minHeight: 320`. Confirmed at `stage-4/client-shell.tsx:435`.
This wrapper does not change the pane's **width** (it inherits the 540px grid
column), but it changes vertical behaviour (sticky scroll + minHeight floor).

### Per-stage width table (code-derived, not browser-measured)

| Stage | Pane width (px) — code-derived | Screenshot path | Notes |
|-------|--------------------------------|-----------------|-------|
| 0     | 540 (right column of `minmax(640px, 1fr) 540px`) | not captured (auto-mode) | grid identical to other stages |
| 1     | 540 | not captured (auto-mode) | grid identical |
| 2     | 540 | not captured (auto-mode) | grid identical |
| 3     | 540 | not captured (auto-mode) | grid identical |
| 4     | 540 | not captured (auto-mode) | grid identical; **unique**: pane wrapped in `position: sticky` div with `minHeight: 320` at `stage-4/client-shell.tsx:435` |

The `screenshots/` subdirectory was created (`mkdir -p` at task start) but is
empty in auto mode. Operator UAT (see "Conclusion / next step" below) can land
the PNGs there during Plan 04 pre-implementation if desired.

### Conclusion

**Code-evidence verdict: NO WIDTH REGRESSION.** All five stages render the
detail-pane in the right column of a `minmax(640px, 1fr) 540px` grid; the only
Stage-4-unique element is the `position: sticky` wrapper that affects vertical
behaviour, not width.

The operator-reported perception of "narrowness" on Stage 4 is most likely the
Stage-4-unique sticky wrapper at `stage-4/client-shell.tsx:435` causing
vertical-layout artefacts (compressed content, off-screen scroll surface from
`minHeight: 320` interacting with tall pane content + sticky positioning) which
can be misperceived as horizontal narrowness.

### Scope-call for Plan 04 (D-03c)

> **Recommendation: DROP D-03c from Plan 04's unconditional scope.**
>
> Replace it with a conditional **pre-implementation operator UAT gate** at the
> start of Plan 04: ask the operator to perform the 1440x900 per-stage screenshot
> exercise (steps 1-5 of Task 3's `how-to-verify`) and report back. If the
> operator confirms NO width regression, Plan 04 ships the chip-strip swap
> (D-03a/D-03b) only and leaves the sticky wrapper untouched. If the operator
> reports a real width regression on Stage 4, Plan 04 adds a one-line
> revert/removal of the `position: sticky` + `minHeight: 320` wrapper at
> `stage-4/client-shell.tsx:435` so Stage 4 mounts the pane as a direct grid
> child like every other stage.
>
> If the regression is on a non-Stage-4 stage, Plan 04 stays in scope only for
> D-03a/D-03b and a follow-up phase handles the unexpected stage. There is no
> code-evidence supporting a non-Stage-4 regression.

This honours the original Q3 outcome ("scope this in Plan 04" vs "drop from
Plan 04") with the auto-mode caveat that the visual half of the verdict moves
from Wave 0 into the start of Plan 04 as a small gating UAT step.

---

## Self-Check: PASSED

- File `.planning/phases/88-review-surface-cleanup/88-WAVE0-FINDINGS.md` exists.
- `## Q1 — automation_runs.email_id shape` heading present (line 16).
- `## Q2 — ?needs_action deeplink audit` heading present (line 123).
- `## Q3 — detail-pane width per stage` heading present.
- `### Deletion targets for Plan 03 (D-02)` and `### Keep` headings present under Q2.
- RPC JOIN fragment `(ar.result->>'email_id')::uuid` present.
- `screenshots/` directory created (empty per auto-mode disposition above).



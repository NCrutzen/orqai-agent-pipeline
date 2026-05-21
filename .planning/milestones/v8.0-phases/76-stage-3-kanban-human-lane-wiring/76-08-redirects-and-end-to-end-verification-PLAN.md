---
phase: 76
plan: 08
type: execute
wave: 7
depends_on: [03, 04, 05, 06, 07]
files_modified:
  - web/middleware.ts
  - web/app/(dashboard)/automations/[swarm]/review/page.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx
  - web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx
  - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md
autonomous: false
requirements: []
must_haves:
  truths:
    - "Old URL /automations/[swarm]/review redirects to /automations/[swarm]/stage-1 (D-05.6)"
    - "Old query string ?tab=safety on /review redirects to /stage-0 (D-05.6)"
    - "Old query string ?tab=pending on /review redirects to /stage-1?sub=pending (D-05.6)"
    - "Stage 0 and Stage 1 routes exist as redirects/wrappers so the registry-driven tab strip resolves links"
    - "End-to-end verification confirms zero silent dead-letters: every email past Stage 1 either dispatches a Stage 4 handler OR creates a Kanban row"
    - "76-VALIDATION.md populated with per-task validation results"
  artifacts:
    - path: "web/middleware.ts"
      provides: "Next.js middleware redirecting legacy URLs"
      contains: "stage-0\\|stage-1"
    - path: "web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx"
      provides: "Wrapper that re-exports the existing review/page.tsx (or redirects)"
    - path: ".planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md"
      provides: "Filled-in validation map per RESEARCH.md §Validation Architecture"
  key_links:
    - from: "/automations/[swarm]/review"
      to: "/automations/[swarm]/stage-1"
      via: "Next.js middleware redirect (301 permanent? or 308? — pick 308 to preserve method)"
      pattern: "stage-1"
    - from: "/automations/[swarm]/review?tab=safety"
      to: "/automations/[swarm]/stage-0"
      via: "middleware redirect with query-string strip"
      pattern: "stage-0"
---

<objective>
Wire the backwards-compat redirects per CONTEXT.md D-05.6 ("Old URLs `/review`, `?tab=safety`, `?tab=pending` redirect to stage-keyed equivalents"). Stand up minimal Stage 0 and Stage 1 route wrappers so the registry-driven tab strip's links resolve. Run end-to-end Phase 76 verification: insert synthetic test rows for each of the three Kanban triggers (`no_handler`, `low_confidence`, `handler_error`), execute each operator action, confirm Realtime broadcasts and database state. Populate `76-VALIDATION.md` per RESEARCH.md §Validation Architecture.

Per D-05.6: old URLs stay alive as backwards-compat aliases for at least one milestone after this ships. The redirect approach (vs. server-side aliasing) is pinned at HTTP 308 (Permanent Redirect — preserves method) to keep operator bookmarks working without changing semantics.

Per CONTEXT.md "Bulk Review and Kanban are both views of the per-stage operator surface": the existing `[swarm]/review/page.tsx` becomes the Stage 1 surface. Two implementation options:
- (A) `[swarm]/stage-1/page.tsx` re-exports from `../review/page.tsx`
- (B) `[swarm]/stage-1/page.tsx` is a thin wrapper that mounts the existing review components with the stage-keyed shell on top

Pick (A) for minimum churn. The review/ directory keeps its current implementation; only its consumers (the navigation links + the `/review` URL itself) change.

Purpose: Close the URL-rename loop so Phase 76 can ship without breaking operator bookmarks; verify the runtime behavior end-to-end before declaring Phase 76 done.

Output: 4 file changes/creates; verification report appended to 76-VALIDATION.md; final checkpoint:human-verify.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-UI-SPEC.md
@web/app/(dashboard)/automations/[swarm]/review/page.tsx
@web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx
@web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx
@web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx

<interfaces>
<!-- Existing middleware (if any) — read web/middleware.ts FIRST. May or may not exist. -->
<!-- If middleware.ts exists, EXTEND it. If not, CREATE it. -->

<!-- Redirect rules (D-05.6): -->
<!--   /automations/[swarm]/review                  → /automations/[swarm]/stage-1 -->
<!--   /automations/[swarm]/review?tab=safety       → /automations/[swarm]/stage-0 -->
<!--   /automations/[swarm]/review?tab=pending      → /automations/[swarm]/stage-1?sub=pending -->
<!--   /automations/[swarm]/review (no query)       → /automations/[swarm]/stage-1 (default to Bulk Review) -->

<!-- Status code: 308 Permanent Redirect (preserves method, signals long-term) -->

<!-- Stage 0 surface: TODAY's existing safety surface lives somewhere — possibly review?tab=safety. -->
<!-- For Phase 76: stage-0/page.tsx mounts the same shell + a "no content yet" or pointer to the existing surface. -->
<!-- Stage 0 isn't part of Phase 76's scope per CONTEXT.md ("Stage 0 = existing safety-review surface (today's ?tab=safety)"). -->
<!-- We just need the route to resolve so the tab strip link doesn't 404. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backwards-compat middleware (D-05.6) for /review → /stage-N</name>
  <files>web/middleware.ts</files>
  <read_first>
    - web/middleware.ts (read FIRST — may exist with auth/session middleware; extend, do not replace)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-05.6 verbatim)
    - Next.js 15 middleware docs ref via Context7 if needed (`mcp__context7__resolve-library-id` next.js, then `mcp__context7__get-library-docs` with topic "middleware redirect")
  </read_first>
  <behavior>
    - Existing middleware behavior preserved (auth/session checks).
    - `/automations/<swarm>/review` (no query) → 308 → `/automations/<swarm>/stage-1`
    - `/automations/<swarm>/review?tab=safety` → 308 → `/automations/<swarm>/stage-0`
    - `/automations/<swarm>/review?tab=pending` → 308 → `/automations/<swarm>/stage-1?sub=pending`
    - Other query params on /review preserved on the redirect target where unambiguous; if not, drop them.
    - Other `?tab=` values pass through to /stage-1 (let Stage 1 decide what to do).
  </behavior>
  <action>
1. Read `web/middleware.ts`. If it exists with existing logic (e.g., Supabase session middleware), insert the redirect block at the TOP of the matcher logic so redirects fire before auth wrapping (redirects are public-cacheable; auth is a separate concern).

2. Add (or create the file with):
```ts
import { NextResponse, type NextRequest } from "next/server";

const REVIEW_REDIRECT_RE = /^\/automations\/([^\/]+)\/review\/?$/;

export function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;
  const match = pathname.match(REVIEW_REDIRECT_RE);
  if (match) {
    const swarm = match[1];
    const tab = searchParams.get("tab");
    let target: string;
    if (tab === "safety") {
      target = `/automations/${swarm}/stage-0`;
    } else if (tab === "pending") {
      target = `/automations/${swarm}/stage-1?sub=pending`;
    } else {
      target = `/automations/${swarm}/stage-1`;
    }
    return NextResponse.redirect(new URL(target, origin), 308);
  }
  // ... existing middleware passthrough / auth logic ...
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/automations/:swarm/review",
    "/automations/:swarm/review/",
    // plus existing matchers if any
  ],
};
```

3. If a Supabase session middleware already exists, INTEGRATE the redirect check at the start (return early on redirect match before invoking session logic). Read the existing matcher config carefully and merge — do NOT overwrite.
  </action>
  <verify>
    <automated>cd web && npm run build 2>&1 | tail -5 && grep -c "stage-1\|stage-0" web/middleware.ts</automated>
  </verify>
  <acceptance_criteria>
    - `web/middleware.ts` exists
    - `grep -c "stage-1" web/middleware.ts` ≥ 1
    - `grep -c "stage-0" web/middleware.ts` ≥ 1
    - `grep -c "308" web/middleware.ts` ≥ 1 (correct redirect status)
    - `grep -c "review" web/middleware.ts` ≥ 1
    - If existing middleware functionality was present, it must be preserved (verify by reading the diff)
    - `cd web && npm run build` exits 0
  </acceptance_criteria>
  <done>Old /review URLs redirect to stage-keyed equivalents; existing middleware functionality preserved.</done>
</task>

<task type="auto">
  <name>Task 2: Stub Stage 0 + Stage 1 route wrappers so registry-driven tab links resolve</name>
  <files>
    web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx,
    web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx
  </files>
  <read_first>
    - web/app/(dashboard)/automations/[swarm]/review/page.tsx (the existing Bulk Review page — Stage 1 wraps this)
    - web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-04 REVISED — Stage 0 = existing safety surface; Stage 1 = today's Bulk Review)
  </read_first>
  <behavior>
    - Stage 1 page: re-exports the existing review/page.tsx default export, OR mounts a thin wrapper that calls the same loaders + renders the same components. Since the existing review/page.tsx renders its own page header / surface, the cleanest path is: copy review/page.tsx logic, wrap with PageHeader + StageTabStrip(currentStage=1) at the top, render the existing review composite below. For Phase 76 minimum-churn: re-export under stage-1, leave review/ alone (the middleware redirect kills external traffic to /review). If re-export complicates the shell embedding, do a thin wrapper that imports the existing review page client/server components.
    - Stage 0 page: minimal placeholder. Renders PageHeader + StageTabStrip(currentStage=0) + "Stage 0 surface — see existing safety review at <link to existing implementation>" copy. The actual Stage 0 surface is out of scope for Phase 76 (CONTEXT.md "Stage 0 = existing safety-review surface"). Just ensure the tab link resolves and operator can navigate back.
  </behavior>
  <action>
1. **stage-1/page.tsx** — pick the simplest viable approach. Read review/page.tsx FIRST.
   - If it's a default export server component without complex internal state, write:
     ```tsx
     export { default } from "../review/page";
     ```
     This re-exports the entire review surface under the stage-1 URL. The existing review page already renders its own page chrome (which may overlap with the new shell — read its source to confirm if it needs trimming; if so, add a minimal wrapper instead).
   - If review/page.tsx renders its own header/tabs that conflict with the new shell, write a wrapper:
     ```tsx
     import { notFound } from "next/navigation";
     import { createAdminClient } from "@/lib/supabase/admin";
     import { loadSwarm } from "@/lib/swarms/registry";
     import { PageHeader } from "../_shell/page-header";
     import { StageTabStrip } from "../_shell/stage-tab-strip";
     import ReviewSurface from "../review/page"; // adjust import path

     export const dynamic = "force-dynamic";

     export default async function Stage1Page({ params }: { params: Promise<{ swarm: string }> }) {
       const { swarm: swarmType } = await params;
       const admin = createAdminClient();
       const swarm = await loadSwarm(admin, swarmType);
       if (!swarm) notFound();
       return (
         <>
           <PageHeader swarm={swarm} />
           <StageTabStrip swarm={swarm} currentStage={1} />
           <ReviewSurface params={params} />
         </>
       );
     }
     ```
   Pick the path that compiles cleanly. If neither works (unlikely but possible due to different layout assumptions in review/), document the gap in 76-VALIDATION.md and use the re-export.

2. **stage-0/page.tsx** — minimal:
   ```tsx
   import { notFound } from "next/navigation";
   import { createAdminClient } from "@/lib/supabase/admin";
   import { loadSwarm } from "@/lib/swarms/registry";
   import { PageHeader } from "../_shell/page-header";
   import { StageTabStrip } from "../_shell/stage-tab-strip";

   export const dynamic = "force-dynamic";

   export default async function Stage0Page({ params }: { params: Promise<{ swarm: string }> }) {
     const { swarm: swarmType } = await params;
     const admin = createAdminClient();
     const swarm = await loadSwarm(admin, swarmType);
     if (!swarm) notFound();
     return (
       <>
         <PageHeader swarm={swarm} />
         <StageTabStrip swarm={swarm} currentStage={0} />
         <main style={{ padding: "var(--space-5)" }}>
           <p style={{ fontSize: "13px", color: "var(--v7-text-muted)" }}>
             Stage 0 (Safety) — existing safety-review surface. Phase 76 leaves this content untouched.
           </p>
         </main>
       </>
     );
   }
   ```
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit && cd web && npx next build 2>&1 | tail -10 && test -f 'web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx' && test -f 'web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx'</automated>
  </verify>
  <acceptance_criteria>
    - Both files exist
    - `cd web && npm run build` exits 0
    - Visiting `/automations/debtor-email/stage-0` and `/automations/debtor-email/stage-1` returns 200 (manual smoke acceptable; browser verifies in Task 3)
    - Tab strip on /stage-3 contains a working link to /stage-1 (no 404)
  </acceptance_criteria>
  <done>Stage 0 and Stage 1 route wrappers in place; tab strip links resolve.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: End-to-end Phase 76 verification + populate 76-VALIDATION.md</name>
  <what-built>Complete Phase 76: pipeline triggers (Plan 03+04), Server Actions (Plan 05), per-swarm UI (Plan 06+07), redirects (Task 1+2). This task verifies the whole loop and writes the validation report.</what-built>
  <how-to-verify>
    Operator + planner together walk through this checklist. Findings recorded in `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-VALIDATION.md`.

    **A. Redirect verification:**
    1. Visit `http://localhost:3000/automations/debtor-email/review` → expect 308 redirect to `/automations/debtor-email/stage-1`.
    2. Visit `http://localhost:3000/automations/debtor-email/review?tab=safety` → expect 308 to `/stage-0`.
    3. Visit `http://localhost:3000/automations/debtor-email/review?tab=pending` → expect 308 to `/stage-1?sub=pending`.
    4. Tab strip on /stage-3 — click each tab; all 5 resolve to working pages.

    **B. Pipeline runtime verification (3 triggers):**
    For each, observe `/automations/debtor-email/stage-3` (or stage-4 for handler_error) and confirm a row appears within ~2s of trigger.

    1. **no_handler trigger** — pick an email known to map to a placeholder intent (e.g., `address_change`):
       - Verify the email reaches Stage 3 → confirm via SQL: `SELECT * FROM automation_runs WHERE swarm_type='debtor-email' AND result->>'kanban_reason'='no_handler' ORDER BY created_at DESC LIMIT 1;` returns a row.
       - Confirm `coordinator_runs` row marked `completed_at` (no dangling).
       - Confirm NO `inngest.send` for the placeholder intent's handler_event in Inngest dashboard for that run.
       - Confirm row visible at `/automations/debtor-email/stage-3` with `no_handler` reason pill (blue).

    2. **low_confidence trigger** — pick an email known to fire the escalation gate (low confidence OR top-N count OR requires_orchestration_flag):
       - Confirm Kanban row created with `result.kanban_reason='low_confidence'`.
       - Confirm NO `debtor-email/orchestrator.requested` event in Inngest for that run.
       - Confirm row visible with `low_conf` amber reason pill.

    3. **handler_error trigger** — manually fail the invoice-copy handler (e.g., set `OUTLOOK_API_BASE` to a bad URL temporarily, then trigger an `invoice_copy_request`):
       - Confirm Kanban row created with `result.kanban_reason='handler_error'`, `result.error_detail` populated.
       - Confirm `automation_runs` of the failed handler is marked `failed` independently.
       - Confirm row visible at `/automations/debtor-email/stage-4` with `handler_error` red reason pill.

    **C. Operator action verification (3 actions, both stages):**

    4. **Close** (both Stage 3 and Stage 4):
       - Click → optimistic removal → confirm row disappears.
       - SQL: row's status is now `completed` with `completed_at` set.

    5. **Replay same-intent** (Stage 3 only — low_confidence row):
       - Open detail pane → click `✓ Replay through Stage 4`.
       - If chosen intent matches Stage 3 top pick: NO override.submitted event; direct handler_event fires.
       - Confirm via Inngest dashboard.

    6. **Replay edited-intent** (Stage 3 only):
       - Open inline editor → pick a different intent → Confirm.
       - Confirm `debtor-email/override.submitted` event fired with `axis=stage_3_intent`.
       - Confirm `pipeline_events` row created for the override.

    7. **Reclassify-as-noise** (both Stage 3 and Stage 4):
       - Open inline editor → pick `auto_reply` → Confirm.
       - Confirm `debtor-email/override.submitted` with `axis=stage_1_category`.
       - Confirm Outlook archive + iController cleanup queue both fire downstream (verify via `automation_runs` lookup).
       - Confirm `unknown` is NOT in the dropdown options.

    **D. Cross-swarm sanity:**

    8. Visit `/automations/sales-email/stage-3` → expect 404 (no swarms registry row yet — Phase 78 ships).
    9. `grep -rE "['\"](debtor-email|sales-email)['\"]" web/app/\(dashboard\)/automations/\[swarm\]/stage-3 web/app/\(dashboard\)/automations/\[swarm\]/stage-4 web/app/\(dashboard\)/automations/\[swarm\]/_shell web/app/\(dashboard\)/automations/\[swarm\]/_actions web/app/\(dashboard\)/automations/\[swarm\]/_lib` → expect ZERO matches.

    **E. Test suite green:**
    10. `cd web && npx vitest run` → all tests green (no regressions, all Phase 76 tests pass).
    11. `cd web && npm run build` → exits 0.

    **F. Populate 76-VALIDATION.md:**
    Read the current 76-VALIDATION.md stub. Append a `## Phase 76 Validation Results` section documenting each of A–E with PASS/FAIL + evidence (commit shas, screenshot paths if captured, SQL outputs).
  </how-to-verify>
  <resume-signal>
    Type "phase-76-verified" once all of A–E pass and 76-VALIDATION.md is populated. If any step fails, paste the failure detail; the planner will produce a gap-closure plan via `/gsd-plan-phase 76 --gaps`.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator browser → middleware | Redirects are pure URL rewrites; no untrusted content interpolation |
| /stage-1 wrapper → review/page.tsx | Same trust boundary as today's review (auth-gated) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-08-01 | T (Tampering) | Open redirect — `/automations/[swarm]/review` could be tampered to redirect to evil.com | mitigate | Redirect target is constructed from validated path segments only (regex-matched `swarm`); query-string `tab` value is checked against an enum (`safety`, `pending`); no operator-supplied URL fragment ever lands in `NextResponse.redirect` target |
| T-76-08-02 | I (Information disclosure) | 308 vs 301 vs 302 choice | accept | 308 chosen for method-preservation; same posture as any internal app redirect |
| T-76-08-03 | S (Spoofing) | Stage 0/1 wrappers | mitigate | `loadSwarm(admin, swarmType)` validates swarm before render (matches Plan 06 pattern) |
| T-76-08-04 | E (Elevation of privilege) | Stage 1 wrapper inherits review surface auth | inherit | Existing review page's auth posture carries over unchanged |
| T-76-08-05 | R (Repudiation) | End-to-end verification audit | mitigate | 76-VALIDATION.md captures evidence per item; commit history pins the verification |
</threat_model>

<verification>
- Middleware redirect rules verified by browser navigation (Task 3 step A).
- All three pipeline triggers verified end-to-end (Task 3 step B).
- All three operator actions verified, including same-intent vs edited-intent Replay branch (Task 3 step C).
- Cross-swarm grep returns zero matches (Task 3 step D, item 9).
- Full Vitest suite green (Task 3 step E, item 10).
- 76-VALIDATION.md populated.
</verification>

<success_criteria>
- Operator's existing bookmarks (`/review`, `?tab=safety`, `?tab=pending`) continue to work via 308 redirects.
- Phase 76 zero-silent-dead-letter goal verified live: every email leaving Stage 1 either dispatches a handler that completes OR creates a Kanban row with a clear reason.
- Cross-swarm reuse target met: Phase 78 sales-email onboarding requires only registry inserts, zero UI/runtime code changes.
- 76-VALIDATION.md is the artifact of record for Phase 76 acceptance.
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-08-SUMMARY.md` documenting:
- Middleware diff
- Stage 0 / Stage 1 wrapper file approach (re-export vs wrapper)
- Top-line results from 76-VALIDATION.md (each of A–E with PASS/FAIL)
- Open gaps (if any) for `/gsd-plan-phase 76 --gaps`
</output>

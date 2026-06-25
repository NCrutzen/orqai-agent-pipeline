---
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
plan: 04
subsystem: info-routing-dedup
tags: [info-routing, dedup, stage-3-router, inngest, coordinator, route-05, verdict, typescript]

# Dependency graph
requires:
  - phase: 131-03
    provides: buildRoutingVerdict (optional dedup 4th arg) + the additive routingDestinations block in debtor-email-coordinator.ts (resolve target mailbox → build verdict → persist decision_details.routing)
provides:
  - extractRecipientAddresses — 3-shape tolerant recipient extractor (raw_json Graph, outlook {to,cc}, sugarcrm [{email}]); reads raw_json (the flat recipients column is NULL for info-routing ingest rows), lowercases + dedupes
  - normalizeMessageId — strip-<>+trim+lowercase, whitespace-hardened; applied to BOTH sides before layer-(b) match
  - checkDuplicateDelivery — two-layer guard returning { status, matched_layer }; layer (a) To/CC always (pure), layer (b) cross-mailbox internet_message_id/conversation_id match for ingested targets only (graceful skip + coverage-gap log otherwise)
  - the real dedup result wired into the coordinator routing block (inside step.run, replay-safe) → lands on verdict.dedup
affects: [132-forward-side-effect-bulk-review, stage-3-coordinator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-layer dedup as a pure helper + opportunistic mockable DB read: layer (a) is IO-free (To/CC parse, unit-testable without Supabase); layer (b) is a single select against email_pipeline.emails behind a DedupAdmin structural interface (mockable, no full client type), gated on a known ingested-mailbox set with a graceful coverage-gap skip — never throws, never blocks (D-04)"
    - "Target-mailbox resolution is done once via resolveRoutingDestination for the dedup target, matching the verdict's own internal resolution so the dedup target and the verdict target never diverge"
    - "Dedup DB read lives inside step.run (replay-safe, CLAUDE.md/Inngest pitfall) and feeds buildRoutingVerdict's optional dedup arg — no signature break from Plan 03"

key-files:
  created:
    - web/lib/automations/info-routing/dedup.ts
    - web/lib/automations/info-routing/__tests__/routing-dedup.test.ts
  modified:
    - web/lib/inngest/functions/debtor-email-coordinator.ts

key-decisions:
  - "normalizeMessageId trims FIRST then strips brackets then lowercases (RESEARCH normalizer whitespace-hardened): the verbatim `s.replace(/^<|>$/g,'').trim().toLowerCase()` leaves outer-whitespace-wrapped ids like '  <ID@host> ' un-stripped because ^< / >$ don't anchor through the spaces. Trim-first makes the bracket strip robust without changing the no-whitespace behavior the spec describes."
  - "ingestedTargetMailboxes is derived from the active routing_destinations target_mailbox set (dedupe + drop nulls), not a hardcoded constant. The dedup helper itself is the conservative gate: for any target whose rows aren't actually ingested it logs a coverage gap and skips layer (b) (RESEARCH A7 — order@ is the meaningfully-ingested target today). This keeps the ingested set registry-derived and future-proof as more mailboxes are ingested."
  - "Layer (b) match is on the target mailbox ADDRESS via ilike on `mailbox` (Pitfall 3 — info@ rows' mailbox is a sugarcrm display name; order@-style outlook rows carry the clean address). message_id is the strongest signal and returns immediately; conversation_id is the weaker fallback collected across the row scan."

patterns-established:
  - "DedupAdmin structural interface: layer (b) types only the from(table).select().eq()/ilike().limit() surface it needs, so the coordinator passes its real admin client via a single `as unknown as DedupAdmin` cast and unit tests pass a tiny hand-rolled builder mock — no full Supabase client type in the helper"

requirements-completed: [ROUTE-05]

# Metrics
duration: 7min
completed: 2026-06-17
---

# Phase 131 Plan 04: Two-layer duplicate-delivery guard Summary

**The only net-new logic in the phase: a two-layer duplicate-delivery guard wired into the Stage-3 routing verdict so Phase 132 never double-forwards. Layer (a) ALWAYS parses the source email's To/CC from `raw_json.toRecipients`/`ccRecipients` (the flat `recipients` column is NULL for info-routing ingest rows) — tolerant of all 3 live ingest shapes — and flips to `already_addressed`/`to_cc` when the resolved target mailbox is already a recipient. Layer (b) OPPORTUNISTICALLY matches the normalized `internet_message_id`/`conversation_id` against the target mailbox's INGESTED rows (matched by address, Pitfall 3) → `already_addressed`/`message_id`|`conversation`; a non-ingested target gracefully skips with a coverage-gap log (never throws, never blocks). The real `{ status, matched_layer }` result is computed inside `step.run` (replay-safe) and feeds `buildRoutingVerdict`'s optional dedup arg, landing on `verdict.dedup`. Both tasks committed (TDD RED→GREEN + wiring); full suite 2804 green; tsc clean; no codegen drift; zero `swarm_type` literal; debtor/sales byte-neutral.**

## Performance

- **Duration:** ~7 min
- **Tasks:** 2 of 2 complete
- **Files created:** 2 · **Files modified:** 1

## Accomplishments

- **`dedup.ts` (Task 1, ROUTE-05) — TDD RED→GREEN:**
  - `extractRecipientAddresses(emailRow)` copied verbatim from RESEARCH §Code Examples: iterates `raw_json.toRecipients`/`ccRecipients` (`{emailAddress.address}`), falls back to `recipients` `{to,cc}` (outlook `{address}`) and `[{email}]` (sugarcrm), lowercases + dedupes. The Graph path is layer (a)'s real source because the flat `recipients` column is NULL for `zapier-info-routing-ingest` rows.
  - `normalizeMessageId(s)` = trim → strip `^<`/`>$` → trim → lowercase; applied to BOTH sides before the layer-(b) match (source carries `<ID@host>`, target column `<id@HOST>` — they match after normalization).
  - `checkDuplicateDelivery({emailRow, targetMailbox, admin, ingestedTargetMailboxes})` → `{ status, matched_layer }`: layer (a) — target ∈ recipients → `{already_addressed, to_cc}`; layer (b) — only for an ingested target, query `email_pipeline.emails` where `mailbox` ILIKE the target ADDRESS and normalized `internet_message_id` (or `conversation_id`) matches the source → `{already_addressed, message_id|conversation}`; non-ingested target → `console.warn` coverage gap + skip (routable); a layer-(b) read error is treated as a coverage gap (never a block); no-target (unrouted) → routable with no DB read.
  - 14 unit tests green: 5 extractor (3 shapes + dedupe + empty), 2 normalizer, 2 layer (a), 3 layer (b) (msg-id, conversation, non-ingested skip), 2 non-duplicate (routable + null-target no-query).
- **Coordinator wiring (Task 2, ROUTE-05):** inside the Plan-03 `routingDestinations.length > 0` block, after the threshold load and before `buildRoutingVerdict`, a new `step.run("check-duplicate-delivery", …)` resolves the target mailbox via `resolveRoutingDestination` (matching the verdict's own resolution), derives `ingestedTargetMailboxes` from the active `routing_destinations` `target_mailbox` set, reads the source email's `recipients`+`raw_json` from `emails`, and calls `checkDuplicateDelivery`. Its result feeds `buildRoutingVerdict(parsed, routingDestinations, threshold, dedup)` so `verdict.dedup` reflects the real two-layer check. An unrouted parse / null target short-circuits to routable with no DB read.

## Task Commits

1. **Task 1 RED: failing two-layer dedup test** — `d6faf72e` (test)
2. **Task 1 GREEN: dedup.ts (3-shape extractor + normalizer + two-layer check)** — `4f5ff56b` (feat)
3. **Task 2: wire dedup into the coordinator routing block** — `9005968b` (feat)

## Files Created/Modified

- `web/lib/automations/info-routing/dedup.ts` — `extractRecipientAddresses` (3-shape) + `normalizeMessageId` + `checkDuplicateDelivery` (layer a/b) + the `DedupAdmin` structural interface
- `web/lib/automations/info-routing/__tests__/routing-dedup.test.ts` — 14 layered assertions
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — `check-duplicate-delivery` step in the routing block (resolve target → derive ingested set → read email → dedup → feed verdict); 2 new imports (`resolveRoutingDestination` added to the registry import; `checkDuplicateDelivery`/`DedupAdmin`/`RoutingDedup` from dedup.ts)

## Decisions Made

- **Trim-first normalizer.** The RESEARCH-verbatim `s.replace(/^<|>$/g,'').trim().toLowerCase()` leaves outer-whitespace-wrapped ids un-stripped (the `^<`/`>$` anchors don't reach through leading/trailing spaces). Trim-first (`s.trim().replace(...).trim().toLowerCase()`) hardens it without changing the spec's no-whitespace behavior. The test asserts `'  <ID@host> '` → `'id@host'`.
- **Registry-derived ingested set + conservative helper gate.** `ingestedTargetMailboxes` is derived from the active `routing_destinations` `target_mailbox` values (deduped, non-null), not a hardcoded list. The helper logs a coverage gap and skips layer (b) for any target that isn't meaningfully ingested (RESEARCH A7: order@ today). This keeps the set registry-driven as more mailboxes are ingested, and a coverage gap never blocks (D-04).
- **Resolve the dedup target once, matching the verdict.** `resolveRoutingDestination` is called in the dedup step to get the target mailbox, then `buildRoutingVerdict` resolves it again internally — both off the same `routingDestinations` rows + the same `parsed.value`, so the dedup target and the verdict's `target_mailbox` are guaranteed identical. No new resolution path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RESEARCH-verbatim normalizeMessageId fails on outer-whitespace-wrapped ids**
- **Found during:** Task 1 (GREEN run — `'  <ID@host> '` returned `'<id@host'`)
- **Issue:** The verbatim normalizer `s.replace(/^<|>$/g,'').trim().toLowerCase()` strips brackets via `^<`/`>$` anchors BEFORE the trim, so outer whitespace defeats the bracket strip (`<` isn't at index 0 when the string starts with a space).
- **Fix:** Trim FIRST: `s.trim().replace(/^<|>$/g,'').trim().toLowerCase()`. No behavior change for already-clean ids; correctly normalizes whitespace-wrapped ones.
- **Files modified:** web/lib/automations/info-routing/dedup.ts
- **Verification:** the 2 normalizer tests + the layer-(b) msg-id normalization test green.
- **Committed in:** `4f5ff56b` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 normalization bug in the research-verbatim snippet). No scope creep — the dedup behavior matches the plan exactly.

## Known Stubs

None. `verdict.dedup` now carries the real two-layer result — the Plan-03 placeholder `{status:'routable', matched_layer:null}` default is superseded by the wired `checkDuplicateDelivery` output (still defaulting to routable only when there is genuinely no target to dedup against, i.e. an unrouted verdict).

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface. The threat register dispositions are all mitigated: T-131D-01 (double-forward → two-layer dedup → already_addressed, honored by Phase 132), T-131D-02 (wrong field path / no normalize → layer (a) reads raw_json not the NULL recipients column; normalizeMessageId both sides; tests assert both), T-131D-03 (layer-b throws on non-ingested target → graceful skip + coverage-gap log, no block, read-error also treated as coverage gap), T-131D-04 (replay re-runs layer-b inconsistently → dedup DB read inside step.run, keyed off the replay-safe run_id), T-131D-SC (no package installs).

## Verification

- `cd web && npx vitest run lib/automations/info-routing/__tests__/routing-dedup.test.ts` → **14 passed**.
- `cd web && npm test` → 327 files / **2804 passed**, 23 files / 41 skipped, 95 todo (full suite; debtor + sales coordinator parity preserved).
- `npx tsc --noEmit` → clean.
- `npm run codegen && git diff --exit-code` → no generated-file drift.
- `grep -q "checkDuplicateDelivery" web/lib/inngest/functions/debtor-email-coordinator.ts` → WIRED; the call is inside `step.run("check-duplicate-delivery", …)`.
- `grep -q "raw_json" web/lib/automations/info-routing/dedup.ts` → succeeds (layer (a) reads raw_json).
- `grep -q "toLowerCase" web/lib/automations/info-routing/dedup.ts` → succeeds (id + address normalization).
- `grep -rn "swarm_type === 'info-routing'" web/lib` (code, comments stripped) → no code literal.

## Next Phase Readiness

**Plan 131-04 COMPLETE — both tasks done; the two-layer dedup guard is live and feeds `verdict.dedup`.**

- **Phase 132 (forward + Bulk Review)** reads `decision_details->routing->'dedup'->>'status'` — when `already_addressed`, the forward is suppressed (do-not-forward). The `matched_layer` (`to_cc`/`message_id`/`conversation`) is available for the audit surface.
- **Layer-(b) coverage** is opportunistic: only ingested target mailboxes (order@ today) get cross-mailbox dedup; ingesting the remaining target mailboxes is a non-blocking follow-up (RESEARCH A7) that needs zero code change — the ingested set is derived from `routing_destinations`.

## Self-Check: PASSED

Both created files (`dedup.ts`, `routing-dedup.test.ts`) + the modified coordinator verified present; all 3 task commits (`d6faf72e`, `4f5ff56b`, `9005968b`) verified in git log. Full suite 2804 green; tsc clean; no codegen drift.

---
*Phase: 131-destination-taxonomy-stage-3-router-v9-7-p1*
*Completed: 2026-06-17 — both tasks done; two-layer dedup guard live + wired (ROUTE-05)*

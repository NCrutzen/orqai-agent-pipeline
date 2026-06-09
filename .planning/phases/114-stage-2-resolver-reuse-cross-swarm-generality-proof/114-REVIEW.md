---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - scripts/no-engine-diff-check.sh
  - supabase/migrations/20260604_generic_resolution_audit.sql
  - supabase/migrations/20260604b_sales_resolution_config.sql
  - web/app/api/automations/sales-email/ingest/route.ts
  - web/lib/agentic-pipeline/resolve/__tests__/body-source-selection.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/conversation-id-forward-rate.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/dispatch.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/port-equivalence.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/resolution-blocklists-seed.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/self-auth-noop.test.ts
  - web/lib/agentic-pipeline/resolve/body-source.ts
  - web/lib/agentic-pipeline/resolve/config.ts
  - web/lib/agentic-pipeline/resolve/engine.ts
  - web/lib/agentic-pipeline/resolve/forward-rate-paths.ts
  - web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
  - web/lib/agentic-pipeline/resolve/steps/sender-match.ts
  - web/lib/agentic-pipeline/resolve/steps/thread-inheritance.ts
  - web/lib/automations/debtor-email/resolve-debtor.ts
  - web/lib/automations/sales-email/__tests__/resolve-customer.test.ts
  - web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts
  - web/lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts
  - web/lib/automations/sales-email/lookups/offerte.ts
  - web/lib/automations/sales-email/lookups/order.ts
  - web/lib/automations/sales-email/lookups/sites.ts
  - web/lib/automations/sales-email/resolve-customer.ts
  - web/lib/inngest/events.ts
  - web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts
  - web/lib/inngest/functions/stage-2-customer-resolver.ts
  - web/lib/outlook/__tests__/fetch-shape.test.ts
  - web/lib/outlook/client.ts
  - web/lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts
  - web/lib/pipeline-gating/dry-run-gate/index.ts
  - web/lib/swarms/dynamic.ts
  - web/lib/swarms/types.ts
  - web/scripts/sales-identifier-mining.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 114: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Status:** issues_found

## Summary

This is a re-review after gap-closure plans 114-06 and 114-07 (commits
`a56cce82`, `88bde9f0`, `d2af4442`, `11f71fef`) addressed every finding from the
prior REVIEW.md. All 11 prior findings are confirmed RESOLVED in the current
code, with new regression tests pinning the CR-01/CR-02/WR-02/WR-03/WR-05 fixes.

The two prior BLOCKERS are genuinely fixed: `effectiveBrandId` now sources the
brand from `resolution_config.scope.brand_scope[0]` on the generic path (CR-01),
so `sender_match`/`factuur_match` are reachable for sales; and `entityBrand` is
normalized to a scalar code for both the string-array and object-array registry
shapes (CR-02), with three new worker tests (Test A/B/C) asserting `brand_id`
reaches `resolveEntity` and `entity_brand` is never `"[object Object]"`.

No new BLOCKERs. Three WARNINGs and three INFO items remain — all are residual
robustness gaps in the heuristic identifier extractors that the fixes narrowed
but did not fully close (acknowledged in code as D-06 fast-follow territory), plus
a small inconsistency in how attempted identifiers are recorded and a `lastIndex`
foot-gun on a shared module-level regex.

## Prior findings resolution

| ID | Prior finding | Status | Evidence |
|----|---------------|--------|----------|
| CR-01 | Sales `brand_id` always null → `sender_match`/`factuur_match` dead | RESOLVED | `stage-2-customer-resolver.ts:152-155` derives `genericBrandId` from `resolution_config.scope.brand_scope[0]`; `effectiveBrandId` passed to `resolveEntity` (`:233`). Worker Test A asserts `args.brand_id === "SB"` (`stage-2-customer-resolver.test.ts:1207-1217`). |
| CR-02 | `entity_brand[0] as string` corrupts audit + Stage 3 hand-off | RESOLVED | `:178-186` normalizes first element: string passthrough, object → `.code`, else null. Worker Tests B/C assert scalar `"SB"` for both shapes, never `"[object Object]"` (`:1219-1249`). |
| WR-01 | `nxt_database` hardcoded `"nxt"` for sales | RESOLVED (partial, see WR-A) | `:163-168` sources `config.source.nxt_database` first, `"nxt"` only as documented fallback. The seed has no `nxt_database` key, so the literal still applies at runtime — acceptable per the documented single-handle justification, but see new WR-A. |
| WR-02 | postcode regex over-matches SKUs/refs → wrong account high-conf | RESOLVED | `sites.ts:27-40` adds `hasAddressContext` gate; postcode hits self-downgrade to `confidence:"medium"` (`:94`). Tests at `resolve-customer.test.ts:188-227`. Residual gap noted as WR-B. |
| WR-03 | `order` regex matches mid-word | RESOLVED | `order.ts:19` now `/\border[a-z]*.../`. Negative test `extractOrderCandidates("herorder 12345","")` → `[]` (`resolve-customer.test.ts:169`). |
| WR-04 | error fallback discards extracted identifiers | RESOLVED | Adapter accumulates `seenIdentifiers` at extraction time and returns them on the unresolved path (`resolve-customer.ts:214,221,228,236,297`). Test `:293-320`. Residual ordering note in WR-C. |
| WR-05 | `extractQuotedSender` picks first body email anywhere | RESOLVED | Rewritten to require a `QUOTED_HEADER_RE` context window (`resolve-customer.ts:84-111`). Tests `:229-291` confirm signature address does not win and no-header → unresolved. |
| IN-01 | Duplicate `lookupIdentifierToAccount` import | RESOLVED | Merged into one import statement (`resolve-customer.ts:42-45`). |
| IN-02 | `pickCustomer` duplicated across 3 lookups | NOT ADDRESSED (still valid) | `offerte.ts:86`, `order.ts:67`, `sites.ts:103` still copy-paste. Re-filed as IN-A. |
| IN-03 | `case_ref` unsupported, no runtime guard | NOT ADDRESSED (still valid) | Engine + adapter still silently skip unknown precedence names. Re-filed as IN-B. |
| IN-04 | `runThreadInheritanceOnly` duplicated | NOT ADDRESSED (accepted) | Still duplicated (`stage-2-customer-resolver.ts:653`), acknowledged in comment. No action this phase. |

## Warnings

### WR-A: Sales `nxt_database` still resolves to the literal `"nxt"` at runtime

**File:** `web/lib/inngest/functions/stage-2-customer-resolver.ts:163-168`; `supabase/migrations/20260604b_sales_resolution_config.sql:46-77`
**Issue:** The WR-01 fix sources `nxt_database` from `config.source.nxt_database`,
but the seeded sales `resolution_config.source` (migration 20260604b) carries only
`kind`/`resolver_tool_id`/`fallback` — there is NO `nxt_database` key. So
`genericNxtDatabase` is `null` and `effectiveNxtDatabase` falls to the literal
`"nxt"` for every sales email, which is exactly the runtime behavior WR-01 flagged.
The code is now structurally correct (config-first), but the data does not exercise
that path, so the hardcoded fallback is still the live value. Note the sales NXT
lookups (`lookupSenderToAccount`, `lookupIdentifierToAccount`) thread this into the
debtor Zapier-SQL cross-DB views; if `"nxt"` is not the correct handle for the SB
brand, those two lookups silently return no matches rather than erroring. The
offerte/order/Sites lookups go through `nxtRequest` and ignore `nxt_database`
entirely, so only the two reused debtor lookups are exposed.
**Fix:** Either add `source.nxt_database` to the sales seed so the value is
explicit and auditable, or add a test asserting the reused debtor lookups receive
the intended database handle for sales. If `"nxt"` is genuinely correct for SB,
add a one-line comment in the migration recording that the omission is deliberate.

### WR-B: Postcode address-context gate is still defeatable; `confidence:"medium"` does not prevent a wrong-account short-circuit

**File:** `web/lib/automations/sales-email/lookups/sites.ts:27-40`, `web/lib/automations/sales-email/resolve-customer.ts:220-225`
**Issue:** The `hasAddressContext` heuristic accepts a postcode-shaped token if a
30-char window contains an address cue (`adres|postcode|straat|...`) OR a
street-number pattern precedes it. A reference like `"locatie 1234AB"` or
`"vestiging 5678CD"` matches the `ADDRESS_CUE` alternation and passes the gate even
when the token is a product/site reference rather than a real NL postcode — the
gate narrows the false-positive surface but does not eliminate it. More importantly,
the `confidence:"medium"` downgrade is cosmetic for routing: the adapter still
returns the FIRST postcode hit and short-circuits the precedence loop
(`resolve-customer.ts:223`), so a spurious-but-context-passing postcode resolves the
email to a (possibly wrong) account and skips `factuur_match`/`order_match`
entirely. The medium label informs an operator but does not gate the auto-route.
Sales Stage 2 is dry-run (`stage_2_resolution=true`) today, so blast radius is
contained until cut-over, but the wrong-account risk re-arms at go-live.
**Fix:** Validate the postcode against a real NL postcode range/list (the proper
fix the code defers to the D-06 todo), and/or treat a medium-confidence
postcode-only hit as non-terminal — let lower-precedence strong identifiers
(factuur/order) still run and win. At minimum add a negative test for the
`"locatie 1234AB"` cue-collision case.

### WR-C: `seenIdentifiers` ordering across steps misrepresents the attempted-identifier trail; `sender_match` not recorded

**File:** `web/lib/automations/sales-email/resolve-customer.ts:158,214-236,297`
**Issue:** The WR-04 fix records identifiers at extraction time, but the trail is
order-sensitive on the FIRST step's extraction, not on what was actually mined from
the email. `seenIdentifiers` is pushed per-step in precedence order, then
`dedupe()`d. If `offerte_match` runs first it pushes offerte numbers; a later
`factuur_match` pushes invoice numbers — so the recorded trail order reflects
precedence order, not document order, which can mislead an operator triaging the
audit row about which identifier was "primary." Separately, when resolution fails
purely because the sender did not match (sender present, no NXT hit, no other
identifiers in the body), the unresolved result carries `matched_identifiers: []`
and `sender_email: effectiveSender` — but there is no record that a sender lookup
was attempted-and-missed, which is the WR-04 evidence-trail concern applied to the
sender path. The audit `trace` does capture step status via `buildResolverTrace`,
so this is a secondary surface, but the `matched_identifiers` field alone understates
what was tried.
**Fix:** Either document that `matched_identifiers` is identifier-kinds-only (and
rely on `trace.steps` for the sender attempt), or include the attempted sender in
the unresolved trail. Consider preserving document order when accumulating
`seenIdentifiers` if operators read order as signal strength.

## Info

### IN-A: `pickCustomer` still duplicated verbatim across three lookup modules

**File:** `web/lib/automations/sales-email/lookups/offerte.ts:86-105`, `order.ts:67-85`, `sites.ts:103-122`
**Issue:** The tolerant response-envelope parser `pickCustomer` is copy-pasted in
all three lookup modules (the prior IN-02, unaddressed). `sites.ts` already diverges
slightly in its leading comment, illustrating the drift risk. The `SalesCustomerMatch`
type is shared from `offerte.ts` but the parser is not.
**Fix:** Extract a shared `pickCustomer` into `lookups/_shared.ts` (alongside the
already-shared `SalesCustomerMatch` type).

### IN-B: Unsupported precedence step names are still silently skipped

**File:** `web/lib/agentic-pipeline/resolve/engine.ts:162-163`, `web/lib/automations/sales-email/resolve-customer.ts:283-284`
**Issue:** Both the engine `for` loop and the sales adapter `switch` fall through
silently on an unknown precedence entry (the prior IN-03, unaddressed). A future
operator who adds `"case_ref"` (or typos `"offerte_macth"`) to the precedence array
gets a config that looks active but does nothing — no log, no error. `case_ref` is
mined at 18% and explicitly documented as intentionally excluded, which makes an
accidental future re-add plausible.
**Fix:** Emit a `console.warn` (or a one-time telemetry breadcrumb) when a precedence
entry matches no known step, so unsupported/typo'd names are observable.

### IN-C: Shared module-level `EMAIL_RE` is `/g` and reused across calls — `lastIndex` foot-gun

**File:** `web/lib/automations/sales-email/resolve-customer.ts:70,98-109`
**Issue:** `EMAIL_RE` is a module-scoped global-flag regex consumed inside
`extractQuotedSender` via `window.matchAll(EMAIL_RE)`. `matchAll` requires the `/g`
flag (correct) and the code resets `EMAIL_RE.lastIndex = 0` before iterating, so the
current call sites are safe. But `isOwnTenant` does not use the regex and a future
refactor that switches any call to `EMAIL_RE.test()` / `EMAIL_RE.exec()` would
inherit stateful `lastIndex` across invocations and produce intermittent
false-negatives (the classic shared-global-regex bug). This is latent, not a live
defect.
**Fix:** Make `EMAIL_RE` a non-global local (or construct it per-call) for the
`matchAll` use, or add a comment pinning the `/g` + `lastIndex=0` invariant so a
future `.test()` user does not get bitten.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

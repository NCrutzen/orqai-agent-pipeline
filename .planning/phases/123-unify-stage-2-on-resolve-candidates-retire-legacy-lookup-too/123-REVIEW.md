---
phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - web/lib/agentic-pipeline/resolve/steps/sender-match.ts
  - web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
  - web/lib/agentic-pipeline/resolve/engine.ts
  - web/lib/automations/sales-email/resolve-customer.ts
  - web/lib/automations/sales-email/lookups/offerte.ts
  - web/lib/automations/debtor-email/nxt-zap-client.ts
  - web/scripts/spike-011b-sales-resolution-lift.ts
  - supabase/migrations/20260617_retire_legacy_lookup_tools.sql
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 123: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 123 successfully unifies Stage-2 entity resolution onto `nxt.resolve_candidates` and
removes the two legacy per-kind wrapper tools. The TypeScript compilation and grep checks
confirm zero dangling references to the retired identifiers in production import chains. The
cardinal fail-closed constraint (ambiguity → never a confident wrong customer) holds correctly
in both the debtor step modules and the sales adapter for the common paths.

Two blockers were found. The first is an active D-03 protocol violation: the generic engine's
corroboration collection loop passes `llmTiebreak` into `runSenderMatch`, which means an
ambiguous sender (≥2 distinct parties) on the live debtor path — which has `corroboration`
enabled — will silently fire the LLM tiebreaker inside what the design contract specifies as
a no-LLM path. The second blocker is a data-loss risk in the migration's fail-open design:
the three DDL steps are in a single transaction, so if the pre-flight count is skipped and
legacy rows exist, the entire migration rolls back and the DELETE (the actually safe step)
is not preserved. Three warnings cover the hardcoded `status: null` in engine.ts
`pushSignal`, an absent `isAutoEligibleStatus` guard in the sales adapter's sender and
factuur paths, and stale documentation strings in two script files that now mislead about
which tool is live.

---

## Critical Issues

### CR-01: LLM tiebreaker fires inside the corroboration "no-LLM" path (D-03 violation)

**File:** `web/lib/agentic-pipeline/resolve/engine.ts:300-311`

**Issue:** The corroboration collection loop (the `if (!config.corroboration)` false-branch,
lines 292-323) passes the `llmTiebreak` closure to `runSenderMatch` and `runIdentifierMatch`
unchanged. `runSenderMatch` calls `llmTiebreak(distinctParties, ...)` whenever ≥2 distinct
in-scope parties are found (sender-match.ts:131-136). When the LLM succeeds, the returned
`ResolveResult` has `method = "llm_tiebreaker"` and a non-null `customer_account_id`;
`pushSignal` does not filter on `method`, so the result is added to `collected[]` with
`identifier_kind = "llm_tiebreaker"` (the `default:` branch of `synthKindFor`).

This violates D-03 ("corroboration path: NO LLM call, score deterministically") which is
stated both in `corroborate.ts:5` and in `engine.ts:259`. The violation is currently
**active**: `debtorP0Config` has `corroboration` enabled (resolve-debtor.ts:86-90) and
`sender_match` in its precedence list (resolve-debtor.ts:76). The debtor corroboration
`min_signals: 2` means a sole `llm_tiebreaker` signal will be treated as a lone-signal and
get capped below AUTO — but it is still (a) a non-deterministic LLM call on a path that
promises determinism, (b) potentially combined with a second agreeing signal to trigger a
boost, and (c) a billable API call that the design explicitly ruled out.

The fix is to pass a no-op tiebreaker to the step functions when in the corroboration path,
or to skip the tiebreaker call inside `runSenderMatch` when the result would be collected
rather than returned as a short-circuit:

```typescript
// engine.ts — corroboration collect loop
// Replace the shared llmTiebreak with a no-op for the collect phase:
const noopTiebreak: LlmTiebreak = async () => ({
  method: "unresolved",
  customer_account_id: null,
  customer_name: null,
  confidence: "none",
  inputs: { kind: "unresolved", sender_email: null, matched_identifiers: [] },
});

// Then in the corroboration loop:
pushSignal(
  await runSenderMatch(
    args,
    noopTiebreak,          // <-- not llmTiebreak
    config.scope ? (config as SelfAuthConfig) : undefined,
  ),
  i,
);
// same change for runIdentifierMatch call
```

---

### CR-02: Migration pre-flight caveat is advisory-only — rollback silently undoes the safe DELETE

**File:** `supabase/migrations/20260617_retire_legacy_lookup_tools.sql:50-76`

**Issue:** Steps (2) and (3) (`DROP CONSTRAINT … ADD CONSTRAINT`) re-validate every existing
row in `debtor.nxt_lookup_requests`. The documented pre-flight check is an advisory SQL
comment — there is no `DO $$ BEGIN IF count > 0 THEN RAISE EXCEPTION … END IF; END $$`
guard inside the migration body itself. If an operator skips the pre-flight and the table
contains even one legacy-tool row, PostgreSQL will raise a check-violation inside the open
`BEGIN … COMMIT` transaction and **roll back the entire transaction including the DELETE in
step (1)**. The effect: the `zapier_tools` rows are NOT deleted, the caller retries, and
the half-applied state is invisible in migration-runner logs because the transaction is
simply aborted. The routing table stays inconsistent with the production code until someone
notices.

The lowest-risk fix is to split the migration into two separate files:

- **File A** (idempotent, always safe): the `DELETE FROM public.zapier_tools` only.
- **File B** (conditional, with an explicit guard): the two `ALTER TABLE` constraint swaps,
  preceded by an inline count check that raises a descriptive error if legacy rows exist:

```sql
-- In File B (20260617b_retire_legacy_lookup_constraints.sql):
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM debtor.nxt_lookup_requests
     WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup')
        OR lookup_kind IN ('sender_to_account','identifier_to_account')
  ) THEN
    RAISE EXCEPTION
      'Pre-flight failed: legacy nxt_lookup_requests rows exist. '
      'Clean up before applying constraint widen-back. See T-123-10.';
  END IF;
END $$;

ALTER TABLE debtor.nxt_lookup_requests
  DROP CONSTRAINT nxt_lookup_requests_tool_id_check,
  ADD CONSTRAINT nxt_lookup_requests_tool_id_check CHECK (tool_id IN (
    'nxt.candidate_details',
    'nxt.resolve_candidates'
  ));
-- (same for lookup_kind)
```

If splitting files is not acceptable, add the `DO $$ RAISE EXCEPTION $$` guard at the top
of the existing migration (before the DELETE) so at least a failure on the constraint step
surfaces as a visible error rather than a silent rollback.

---

## Warnings

### WR-01: `pushSignal` in engine.ts hardcodes `status: null`, bypassing the stopped-account gate for corroboration signals

**File:** `web/lib/agentic-pipeline/resolve/engine.ts:287`

**Issue:** The `pushSignal` helper that feeds the corroboration `collected[]` array sets
`status: null` regardless of the status carried on the `ResolveResult`. Since
`isAutoEligibleStatus(null)` returns `true` (auto-gate.ts:42), a stopped/inactive customer
resolved by `sender_match` or `identifier_match` will pass the boost gate in
`scoreCorroboration` (corroborate.ts:113). This contradicts the intent of T-120-05 ("only
an auto-eligible status reaches the boost tier") and WR-03 ("exclude STOPPED/inactive
customers from AUTO").

The sales adapter correctly carries `status` on `CorroborationSignal` (resolve-customer.ts:
256, 351). The generic engine should mirror it. The `ResolveResult` type does not carry
`status` directly, but `inputs` for sender/identifier steps carries the winning row's
`m.status`; alternatively, the step results could be extended. The pragmatic fix is to
propagate status from the step's raw result through a richer return type, but the minimum
viable fix is to document this gap as an accepted known gap until a richer result carrier
is added. Either way, this should be an explicit decision, not an implicit null.

```typescript
// engine.ts pushSignal — at minimum add a comment:
collected.push({
  customer_account_id: result.customer_account_id,
  identifier_kind: synthKindFor(result.method),
  confidence: result.confidence,
  method: result.method,
  precedence_index: precedenceIndex,
  status: null, // TODO: propagate from result when ResolveResult carries status
  customer_name: result.customer_name,
});
```

---

### WR-02: Sales adapter `sender_match` and `factuur_match` cases do not filter on `isAutoEligibleStatus`

**File:** `web/lib/automations/sales-email/resolve-customer.ts:208-226` (sender) and `:311-319` (factuur)

**Issue:** Both cases filter on `is_unique_in_scope === true` but do not call
`isAutoEligibleStatus(m.status)` before accepting a row. The debtor step modules apply this
filter (sender-match.ts:117, identifier-match.ts:106). Without the status gate, a stopped
or inactive customer with a unique-in-scope email address or invoice number will be
returned as a `confidence: "high"` signal in the sales path. This is inconsistent with
WR-03 and with the debtor path.

```typescript
// sales resolve-customer.ts — sender_match case, line ~210:
const senderRows = sender.matches.filter(
  (m) =>
    (m.identifier_kind === "email_address" ||
      m.identifier_kind === "email_domain") &&
    m.scope_key === SALES_SCOPE_KEY &&
    m.is_unique_in_scope === true &&
    isAutoEligibleStatus(m.status),  // add this
);

// factuur_match case, line ~312:
const invoiceRows = inv.matches.filter(
  (m) =>
    m.identifier_kind === "invoice_no" &&
    m.scope_key === SALES_SCOPE_KEY &&
    m.is_unique_in_scope === true &&
    isAutoEligibleStatus(m.status),  // add this
);
```

Import: `import { isAutoEligibleStatus } from "@/lib/agentic-pipeline/resolve/steps/auto-gate";`

---

### WR-03: Stale documentation strings in script files reference deleted tools as if they are still live

**Files:**
- `web/scripts/eval/resolver-correctness-gate.ts:19`
- `web/scripts/replay-invoice-33050836.ts:4`

**Issue:** `resolver-correctness-gate.ts` line 19 reads *"This harness hits the LIVE
resolve_candidates / contact_lookup Zap substrate."* `contact_lookup` was retired in Phase
123-03 and the migration deletes its `zapier_tools` row. `replay-invoice-33050836.ts`
line 4 reads *"NXT identifier_lookup → tests the Zap"* — again a retired tool. Neither
file is itself broken (they don't import or call the retired tools), but the documentation
implies these tools are still available. An operator following these scripts to set up a
test environment would look for a `nxt.contact_lookup` Zapier hook that no longer exists.

```
// resolver-correctness-gate.ts:19 — change to:
// "This harness hits the LIVE resolve_candidates Zap substrate."

// replay-invoice-33050836.ts:4 — update to reference nxt.resolve_candidates.
```

---

## Info

### IN-01: `winner.party_name` on root-rollup path may be the sub-party name rather than the billing-account name

**Files:**
- `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts:127-128`
- `web/lib/automations/sales-email/resolve-customer.ts:328-329`

**Issue:** When `root_party_id` is non-null (i.e., the matching row is a sub-party whose
billing account is the root), `winner` is selected from `inScope` by
`rootOf(m) === distinctRoots[0]`. The selected winner is a **sub-party row**; its
`party_name` is the sub-party's name, not the root billing account's name.
`customer_account_id` correctly uses `distinctRoots[0]` (the root id), but
`customer_name` uses `winner.party_name` (the sub-party's name). In the audit panel and
resolver trace this would show the sub-entity name against the parent account id — a
cosmetic mismatch. This is a pre-existing condition inherited from the Phase 91 number
back-search design (the substrate does not return the root party's name); Phase 123 did not
introduce it and it does not affect resolution correctness. It is called out here so a
future substrate schema extension (adding `root_party_name` to the proc output) has a clear
justification.

---

### IN-02: `spike-011b` `--with-zapier` flag is now a silent no-op — not reflected in help text or usage examples

**File:** `web/scripts/spike-011b-sales-resolution-lift.ts:56-61, 156`

**Issue:** The `--with-zapier` flag is still parsed and the summary line still prints
`"LIVE NXT + Zapier"` when the flag is set (line 156), despite the flag being a no-op after
the legacy tool retirement. An operator re-running the spike with `--with-zapier` would see
the `+ Zapier` label in output but get only `offerte`, `postcode`, and `order` signals.
The retirement comment (lines 145-152) explains this, but the misleading output string
remains. Low risk (script is marked RETIRED) but worth a one-line fix:

```typescript
// line 156 — remove "+ Zapier" from the label:
`\n=== Spike 011 Phase B — sales resolution LIFT (LIVE NXT, nxtRequest only — --with-zapier retired) ===`
```

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

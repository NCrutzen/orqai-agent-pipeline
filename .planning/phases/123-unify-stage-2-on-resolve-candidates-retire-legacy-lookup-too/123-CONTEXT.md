# Phase 123: Unify Stage-2 on resolve_candidates + retire legacy lookup tools — Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Source:** Operator directive (2026-06-17) + Phase 120-04 live investigation

<domain>
## Phase Boundary

Move the **debtor** Stage-2 resolver (sender + invoice paths) onto the single generic
`nxt.resolve_candidates` resolver (the `resolver_index` SQL substrate, Zap `43uuz1r`),
move the **sales** sender + factuur paths onto it too, and **remove the two legacy
per-kind tools `nxt.contact_lookup` and `nxt.identifier_lookup` entirely — from code AND
the database**. After this phase those tool ids do not exist anywhere.

IN scope: rewire the 5 production call sites; delete the legacy wrappers/types/schemas/
literals from `nxt-zap-client.ts`; update ~11 test files; a prod migration deleting the 2
`zapier_tools` rows + widening-back the `nxt_lookup_requests` CHECK constraints; re-run the
frozen 100-email correctness gate (the carried-over Phase-120 debtor eval).

OUT of scope: corroboration engine changes (done in Phase 120); attachment-borne IDs
(Phase 121); cross-brand scope (Phase 122); any new identifier_kind in `resolver_index`
(the kinds needed already exist live).
</domain>

<decisions>
## Implementation Decisions (LOCKED unless noted)

### Transport
- ONE generic resolver: `nxt.resolve_candidates` (`resolver_index` substrate). The locked
  Stage-2 transport rule (`docs/agentic-pipeline/stage-2-entity.md`) — resolve via SQL,
  never REST, never per-kind Zaps.
- Sender resolution → `resolve_candidates` passing the sender **domain** as an
  `email_domain` identifier (and/or the full address as `email_address`). Data-backed:
  `resolver_index` scope SB has `email_domain` (21,126) + `email_address` (31,138) rows
  (verified live 2026-06-17) — NO backend proc change required.
- Invoice resolution → `resolve_candidates` `invoice_no` kind (175,004 rows live). The
  Phase-91 number back-search already uses `resolve_candidates`; the legacy
  `identifier_lookup` fallback is removed.

### Removal (atomic, both swarms)
- Delete `nxt.contact_lookup` + `nxt.identifier_lookup`: wrappers `lookupSenderToAccount` /
  `lookupIdentifierToAccount`, their `ContactLookupInput`/`IdentifierLookupInput` types,
  `ContactMatchSchema`/`IdentifierMatchSchema`, `ResponseSchemaByTool` + `LookupKindByTool`
  entries, the `NxtToolId` union literals, and the `callNxtTool` overload branches — all in
  `web/lib/automations/debtor-email/nxt-zap-client.ts`.
- Delete the 2 `public.zapier_tools` rows. Widen-back the 2 `debtor.nxt_lookup_requests`
  CHECK constraints that `20260610a` extended (tool_id + lookup_kind). UPDATE/DELETE-only on
  existing RLS tables — no new policy; `check:supabase` must stay 0 ERROR.
- Removal must be ATOMIC across debtor + sales — both swarms import both wrappers today.

### Behavior / correctness
- Sender matching changes from the contact_person→top_level chain to an `email_domain`/
  `email_address` back-search. This is the **dominant error source** (FINDINGS.md: sender/
  domain = 21% accuracy), so it MUST be eval-gated: re-run the frozen 100-email fixture via
  `web/scripts/eval/resolver-correctness-gate.ts` and confirm no regression + corroboration
  now fires over the generic path.
- Fail-closed discipline preserved: ambiguous/non-unique → suggestie, never a confident
  wrong customer (the cardinal failure). Keep `is_unique_in_scope` + distinct-root gating.
- Debtor must actually USE the generic resolver: reconcile with `auto_safe_kinds` (live
  debtor is P0 with `auto_safe_kinds:[]`, which currently disables the resolve_candidates
  number tier — see Phase 120-03 W1). Decide whether the debtor seed gains `auto_safe_kinds`
  or the sender/invoice steps call resolve_candidates unconditionally.

### Claude's Discretion
- Exact mapping of a sender to `email_domain` vs `email_address` precedence within the
  back-search; the shape of the unified sender step; test-mock restructuring.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Inventory + directive (READ FIRST)
- `.planning/todos/pending/2026-06-17-unify-stage2-on-resolve-candidates.md` — the full
  removal/migration inventory (5 code sites, ~11 test files, 2 DB rows, 5 historical
  migrations) + acceptance eval.

### Substrate + transport rule
- `docs/agentic-pipeline/stage-2-entity.md` — LOCKED resolution transport rule (SQL only).
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — `lookupResolveCandidates` + the
  legacy wrappers to delete + `ResolveCandidateMatch` shape.
- `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` — `runNumberBackSearchAuto`
  (the resolve_candidates analog) + the legacy `identifier_lookup` fallback to remove.
- `web/lib/agentic-pipeline/resolve/steps/self-auth-match.ts` — resolve_candidates usage for
  customer_no/site_no (pattern to mirror).

### Eval gate
- `web/scripts/eval/resolver-correctness-gate.ts` — the carried-over correctness harness.
- `.planning/evals/2026-06-16-resolver-customer-eval/{FINDINGS.md,RERUN-FINDINGS.md}` —
  baseline 64% + why the Phase-120 gate was deferred (debtor not yet on resolve_candidates).
- `.planning/phases/120-…/120-HUMAN-UAT.md` — the deferred gate this phase closes.

### Migration patterns
- `supabase/migrations/20260610a_nxt_lookup_requests_resolve_candidates.sql` — the CHECK
  constraint to widen-back.
- `supabase/migrations/_template.sql` — RLS template.
</canonical_refs>

<specifics>
## Specific Ideas

- The 43uuz1r Zap (`resolve_candidates`) is published (v3) and returns live data — verified:
  `SB014098 → quote_no → BX228895 (Bever)`.
- `DEBTOR_FETCH_WEBHOOK_SECRET` (Vercel value, starts `92…`) must be present in any env that
  runs the live eval; the workspace `.env.local` lacked it during Phase 120.
- The intent passed to `resolve_candidates` for debtor is `"unknown"`; sales uses
  `"sales_resolution"` (seeded in `allowed_for_intents` by 20260616b).
</specifics>

<deferred>
## Deferred Ideas

- Cross-brand scope fallback (Phase 122), attachment-borne identifiers (Phase 121).
- Any new `resolver_index` identifier_kind (not needed — email/invoice kinds already live).
</deferred>

---

*Phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too*
*Context gathered: 2026-06-17 via operator directive + Phase 120-04 investigation*

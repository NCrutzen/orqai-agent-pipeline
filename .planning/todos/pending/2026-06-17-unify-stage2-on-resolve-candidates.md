---
created: 2026-06-17
phase_origin: 120
priority: high
area: stage-2-resolver / nxt-zapier
proposed_phase: true
---

# Unify Stage-2 on resolve_candidates + retire nxt.contact_lookup / nxt.identifier_lookup

## Directive (operator, 2026-06-17)

The Customer Resolver must use ONE generic lookup — `nxt.resolve_candidates`
(`resolver_index` SQL substrate, Zap `43uuz1r`). The legacy per-kind tools
`nxt.contact_lookup` (sender) and `nxt.identifier_lookup` (invoice) must be removed
**everywhere — code AND database** — because the dual-tool split only creates confusion.
Debtor must use the same generic resolver as sales (Phase 120 already put sales on it).

## Feasibility — CONFIRMED data-backed

`resolver_index` (scope SB) already contains the kinds sender resolution needs:
`email_address` (31,138 rows) + `email_domain` (21,126 rows), plus `invoice_no` (175,004).
So sender + invoice resolution can both go through `resolve_candidates` with NO backend
proc change — only a code rewire to pass the sender domain as an `email_domain` identifier
and invoices as `invoice_no`.

## Scope (inventory from Phase 120-04, Explore agent)

**Code call sites to rewire (5):**
- `web/lib/agentic-pipeline/resolve/steps/sender-match.ts:47` (debtor) — `lookupSenderToAccount`(contact_lookup) → `resolve_candidates` email_domain/email_address.
- `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts:86` (debtor) — drop the legacy `lookupIdentifierToAccount` fallback; the AUTO pre-pass already uses `resolve_candidates`. Reconcile with `auto_safe_kinds` gating (the number back-search currently no-ops when `auto_safe_kinds` is []).
- `web/lib/automations/sales-email/resolve-customer.ts:171,257` (sales) — sender_match + factuur_match → `resolve_candidates`.
- `web/scripts/spike-011b-sales-resolution-lift.ts:38` (script) — update or retire.

**nxt-zap-client.ts removals:** 2 wrappers (`lookupSenderToAccount`, `lookupIdentifierToAccount`, ~501-505) + `ContactLookupInput`/`IdentifierLookupInput` types (~101-110) + `ContactMatchSchema`/`IdentifierMatchSchema` (~133-155) + `ResponseSchemaByTool` entries (~200-201) + `LookupKindByTool` (~212-213) + `NxtToolId` literals (~94-95) + `callNxtTool` overload branches (~239,241).

**Tests (~11 files):** rewire mocks from the legacy wrappers to `lookupResolveCandidates` —
`resolve/__tests__/{corroboration-collect,port-equivalence,precedence-inversion,rollup-divergence}.test.ts`,
`sales-email/__tests__/{unresolved-fallthrough,self-auth-noop-sales,resolve-customer,corroboration-sales}.test.ts`,
`tests/labeling/nxt-zap-client.test.ts`, `debtor-email/__tests__/nxt-zap-client-allowlist.test.ts`.

**Database (prod migration):** DELETE the 2 `public.zapier_tools` rows
(`nxt.contact_lookup`, `nxt.identifier_lookup`); widen-back the 2 CHECK constraints in
`debtor.nxt_lookup_requests` (`20260610a` added both tool_ids + lookup_kinds). 5 migrations
reference these tools historically (`20260429`, `20260429c`, `20260430e`, `20260601c`,
`20260610a`) — the removal migration supersedes, do not edit history.

## Acceptance / eval (REQUIRED — behavior change)

Sender resolution changes from the contact_person→top_level chain to an `email_domain`/
`email_address` back-search — on the **dominant error source** (FINDINGS.md: sender/domain
match = 21% accuracy). MUST re-score the frozen 100-email fixture via the Phase-120 harness
(`web/scripts/eval/resolver-correctness-gate.ts`) to confirm no regression AND that the
corroboration boost/demote now fires over the generic path. This is the deferred Phase-120
debtor correctness gate (RERUN-FINDINGS.md), now home in this phase.

## Sequencing notes

- Removal must be ATOMIC across debtor + sales (both depend on both wrappers).
- The 43uuz1r Zap is published (v3) and returns live data (verified Phase 120-04).
- Ensure `DEBTOR_FETCH_WEBHOOK_SECRET` (Vercel value, starts `92…`) is in any env that runs
  the live eval; the workspace `.env.local` lacked it during Phase 120.

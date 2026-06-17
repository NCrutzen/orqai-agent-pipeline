# Stage-3 coordinator: fail-soft the intent-agent schema parse (don't throw → drop)

**Created:** 2026-06-16
**Source:** debug session `sales-pipeline-funnel-stall` (handoff-resilience fix PR)

## Problem

The Stage-3 coordinator validates the Orq intent-agent output with a hard
`safeParse` → manual `throw` on mismatch (`web/lib/automations/debtor-email/coordinator/invoke-intent.ts` ~:259-268; the sales twin at `web/lib/automations/sales-email/coordinator/invoke-intent.ts` ~:194-203). Observed in production: the **debtor** intent-agent returned a `ranked[].sub_type` outside the enum `["invoice","credit_note","werkbon","contract","quote"]` →

```
Intent-agent output schema mismatch (version=2026-05-19.v3): ranked[1].sub_type — Invalid option …
```

This is a DETERMINISTIC throw. With the handoff-resilience change it now retries 3× (wasting 3 Orq calls) and then lands in `onFailure` (visible, not silent) — but the email is still never labeled/routed.

## Desired fix

Make the intent-agent parse fail-soft to a visible review lane instead of throwing:
- On schema mismatch, coerce/degrade (e.g. drop the offending optional field such as `sub_type` → null, or fall back to the tolerant V2/V3 union) and route the email to Bulk Review with a flag, rather than throwing.
- Keep the raw output on the record for debugging.
- Preserve the per-swarm schema separation (RFC `docs/agentic-pipeline/stage-3-coordinator.md` §239-254 — `swarm_intents` is the source of truth; don't widen an enum by hand / don't edit `*.generated.ts`). If the agent legitimately emits a value that should be valid, add it to the `swarm_intents` registry + `npm run codegen`, not a hardcoded enum edit.

## Notes
- Separate swarm from the sales-label issue; debtor intent-labeling is currently gated (`swarms.dry_run_config.stage_3_intent_label=true`), so this is not blocking sales, but it IS dropping debtor emails at Stage 3.
- A code comment marking this was left at the coordinator retries config.

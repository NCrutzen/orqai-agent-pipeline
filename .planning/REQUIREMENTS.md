# Requirements

> Requirement IDs referenced by phase plans. Phase 120 (V9.5) corroboration engine.

## Phase 120 — D-06 multi-signal corroboration engine (generic, cross-swarm)

| ID | Requirement | Source |
|----|-------------|--------|
| **CORR-01** | When `corroboration` is configured for a swarm, the engine COLLECTS candidate signals across ALL precedence steps instead of short-circuiting on the first hit; collection is deterministic (no LLM call). When `corroboration` is absent the engine is byte-identical to today's first-hit short-circuit. | CONTEXT D-01/D-03, ROADMAP draft 1/2 |
| **CORR-02** | When ≥`min_signals` **independent** (distinct `identifier_kind`) signals agree on the same `customer_account_id`, confidence is SET to the `boost` tier (`high`) deterministically. When ≥2 independent signals DISAGREE (resolve to different customers), the precedence-winner is returned with confidence capped below AUTO. | CONTEXT D-04/D-05/D-06, ROADMAP draft 2 |
| **CORR-03** | A lone sender/domain signal is capped below AUTO unless corroborated by a second independent signal; a lone strong signal (invoice_no/customer_no) keeps its native `high`. Which kinds are auto-safe-alone is config-driven (extends `auto_safe_kinds`). | CONTEXT D-07 |
| **CORR-04** | Corroboration is swarm-agnostic — zero `if swarm==='…'` branches — opt-in per swarm via `resolution_config.corroboration`. The shared scoring helper is pure over a `CorroborationSignal[]`. Non-opted-in swarms are byte-identical to today (no-engine-diff green). Both the engine loop and the sales adapter's own loop call the same helper. | CONTEXT D-01/D-08, ROADMAP draft 3/4, SWARM-02 |
| **CORR-05** | Both debtor and sales `resolution_config` opt in within Phase 120 (sales requires the REST→SQL transport switch). The no-engine-diff donor is re-baselined to the post-120 commit and re-run → FINAL STAGE2-01 (supersedes the PROVISIONAL V9.0 result). The frozen 100-email fixture is re-scored: the 12 sender-ambiguity rows and the 4 confident-wrong AUTO rows move the right direction. | CONTEXT D-08/D-09/D-10, ROADMAP draft 5 |

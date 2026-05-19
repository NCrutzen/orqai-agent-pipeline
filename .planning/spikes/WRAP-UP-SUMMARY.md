# Spike Wrap-Up Summary

**Date:** 2026-05-19
**Spikes processed:** 4
**Feature areas:** info-routing swarm — Phase 88 implementation
**Skill output:** `./.claude/skills/spike-findings-agent-workforce/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 001 | smeba-info-backfill | standard | ✓ VALIDATED | info-routing swarm — Phase 88 implementation |
| 002 | smeba-info-noise-patterns | standard | ✓ VALIDATED | info-routing swarm — Phase 88 implementation |
| 003 | smeba-vs-debtor-noise-overlap | standard | ✓ VALIDATED | info-routing swarm — Phase 88 implementation |
| 004 | smeba-non-noise-shape | standard | ✓ VALIDATED | info-routing swarm — Phase 88 implementation |

## Key Findings

1. **`[SPAM]` is 54.5% of inbound** — already cross-swarm registered via `swarm_noise_categories.spam` (added in `20260511_swarm_noise_spam_key.sql`). Zero new code needed.
2. **`info@smeba.nl` is a broadcast inbox, not a conversation inbox** — 96.1% single-msg threads, 188 sent emails over 90 days. The future router agent is a forward router, not a draft-reply handler.
3. **56% of debtor-email's production regex transfers cleanly cross-swarm.** `spam`, `payment_admittance`, `auto_reply`, `ooo_temporary`, `ooo_permanent` all fire usefully on the info corpus. **`payment_admittance` fires 62× (1.2%)** — customers misroute payment confirmations to `info@` instead of `debiteuren@`.
4. **`own_domain_loopback` is the architectural standout.** 950 emails (17.9%) are internal workflow CC from `smeba.nl` / `smeba-fire.be` / `moyneroberts.com`. Debtor-email today treats 98.5% of these as `unknown`; Phase 84's `swarms.tenant_domains` column fixes both swarms simultaneously.
5. **The router is small.** Post-noise, ~14 emails/day reach Stage 3 and only ~7/day are real business email. Half the residue is hand-targeted cold B2B outreach that passes M365's spam filter.
6. **Finance is the biggest real router bucket** (20% of post-noise residue, ~3 emails/day). Several patterns overlap with debtor-email's existing noise keys (`invoice_copy_request`, `payment_admittance` shapes).
7. **info-routing is genuinely its own swarm** — Stage 3 dispatches by department, not by debt-collection intent. But Stage 1 is mostly shared, validating the registry-driven architecture.
8. **Hard dependencies on v8.1 phases 78/84/85/86.** Phase 88 cannot start until all four close. Earliest start = V8.2 cycle.

## Phase 88 readiness

The spike series produced a single Phase 88 proposal doc: `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md`. It is deliberately a **proposal, not a plan** — five open questions are kept for `/gsd-discuss-phase 88` once v8.1 closes via `/gsd-audit-milestone v8.1`.

## Operational artifacts left behind

- 5,505 rows of `info@smeba.nl` 90-day corpus in `email_pipeline.emails` (idempotent on `source_id`)
- 6 spike scripts in `web/debtor-email-analyzer/src/spike-00{1,2,3,4}-*.ts` — safe to re-run, useful as templates for future swarm onboarding spikes (sales-email, supplier-onboarding, etc.)
- This skill: `.claude/skills/spike-findings-agent-workforce/` — auto-loads when implementation begins

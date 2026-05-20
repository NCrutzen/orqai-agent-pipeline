---
name: spike-findings-agent-workforce
description: Implementation blueprint from spike experiments on agent-workforce. Phase 88 (info@smeba.nl info-routing swarm) prep — registry-driven Stage 1 noise rules, cross-swarm rule transferability, router workload sizing, and the hard prerequisites on v8.1 phases 78/84/85/86. Auto-loaded when implementing info-routing or any new swarm onboarding.
---

<context>
## Project: agent-workforce (MR Automations Toolkit)

`info@smeba.nl` is a high-volume (61 emails/day inbound, 90 days = 5,316 rows), receive-only, broadcast (96.1% single-msg threads) Smeba info mailbox. v8.1 phases 78/84/85/86 wire up cross-swarm architecture (codegen, tenant_domains, Stage 3 prompt v3, open-set discovery surface); once those land, `info@smeba.nl` can onboard as its own swarm (Phase 88) almost entirely through registry inserts. This spike series is the recon work that defers safely until then — backfill, noise discovery, cross-swarm overlap validation, router workload preview — culminating in a Phase 88 proposal doc.

Spike sessions wrapped: 2026-05-19
</context>

<requirements>
## Requirements

These are non-negotiable design decisions locked during the spike session. Every implementation working in this area MUST honor them:

- **Pure recon only — no runtime code paths touched, no `swarm_*` registry rows, no Stage 1/Stage 3 wiring** during the spike. Phase 88 onboards via registry inserts when prerequisites land.
- **Backfill is bounded** (90 days). Full history can be pulled later if Phase 88 needs it.
- **Intent vocabulary for the router agent is previewed only, never hand-curated.** Per the locked 2026-05-19 principle: the real vocabulary emerges through Phase 86's discovery surface.
- **Reuse the existing `web/debtor-email-analyzer/` tooling** (Zapier SDK, Supabase client, `email_pipeline.emails` table). Do not bootstrap a parallel TS project per spike.
- **info-routing is its own swarm** (`swarm_type='info-routing'`), not a brand variant of debtor-email — Stage 3 dispatches by department, not by debt-collection intent.
- **No new Stage 1 code path** for info-routing onboarding. If any new code is needed in `classify.ts` / classifier workers, that's a cross-swarm architecture bug to fix there.
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| info-routing swarm — Phase 88 implementation | `references/info-routing-swarm-phase-88.md` | 56% of debtor-email regex transfers cleanly cross-swarm; Phase 88 is mostly registry inserts after v8.1 phases 78/84/85/86 close; router workload is small (~7 real emails/day) |

## Source Files

Original spike source files preserved in `sources/`:

- `sources/001-smeba-info-backfill/` — probe, backfill, stats scripts + run output
- `sources/002-smeba-info-noise-patterns/` — first-match-wins cluster classifier + run output
- `sources/003-smeba-vs-debtor-noise-overlap/` — runs production debtor-email classifier against Smeba corpus, dynamic-import escape hatch documented
- `sources/004-smeba-non-noise-shape/` — deterministic seeded sample of post-noise unknown bucket + 30-row hand-pass results

## Companion docs

- **Full Phase 88 proposal:** `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md`
- **Spike manifest + verdicts:** `.planning/spikes/MANIFEST.md`
- **Spike conventions:** `.planning/spikes/CONVENTIONS.md`
- **Architecture canon:** `docs/agentic-pipeline/README.md` + `stage-1-regex.md`
</findings_index>

<metadata>
## Processed Spikes

- 001-smeba-info-backfill
- 002-smeba-info-noise-patterns
- 003-smeba-vs-debtor-noise-overlap
- 004-smeba-non-noise-shape
</metadata>

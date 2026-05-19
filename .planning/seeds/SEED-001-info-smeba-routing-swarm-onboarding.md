---
id: SEED-001
status: dormant
planted: 2026-05-19
planted_during: v8.0 / Phase 83 context gathering
trigger_when: v8.1 milestone audit closes (i.e. /gsd-audit-milestone v8.1 confirms phases 78, 84, 85, 86 all landed)
scope: Medium
---

# SEED-001: info@smeba.nl info-routing swarm onboarding (Phase 999.9)

When v8.1 closes, the four architectural prerequisites for onboarding `info@smeba.nl` as its own swarm are all satisfied simultaneously — and the recon/proposal work is already banked. Surface Phase 999.9 for promotion to the v8.2 milestone.

## Why This Matters

`info@smeba.nl` is the second-largest unhandled inbound stream at Moyne Roberts after debtor-email (61 emails/day inbound, 24,134 inbox all-time). It's currently entirely manual triage. The cross-swarm architecture v8.1 is shipping (`swarms.tenant_domains`, codegen, Stage 3 v3 prompt, open-set discovery) was explicitly designed to let new swarms onboard via registry inserts — info-routing is the cleanest test of that thesis after sales-email (Phase 78). Deferring this further wastes the architectural investment.

Spike series 2026-05-19 (4 spikes, all VALIDATED) already produced:
- 5,505-row 90-day corpus persisted in `email_pipeline.emails` (idempotent on `source_id`, re-runs cheap)
- Cross-tenant Graph access proven via `zapier@moyneroberts.com` connection `56014785`
- Stage 1 noise rules proven against corpus: 76.9% coverage, ~14 emails/day reach Stage 3, ~7/day real business email
- Cross-swarm rule transferability quantified: 56% of debtor-email's regex transfers cleanly
- Full proposal doc with 5 explicit open plan-time questions deliberately unresolved

The implementation itself is small (registry inserts + one Outlook ingest line) — but it can't honestly happen before 78/84/85/86 close. Without the codegen (78), "registry inserts only" silently means hand-editing TS consts. Without `swarms.tenant_domains` (84), 950 internal-workflow-CC emails reach Stage 3 and get force-classified. Without the V3 schema (85), there's nothing to put `intent_proposal` into. Without the discovery surface (86), router vocabulary gets hand-curated — violating the locked 2026-05-19 principle.

## When to Surface

**Trigger:** v8.1 milestone audit closes (`/gsd-audit-milestone v8.1`) confirming phases 78, 84, 85, 86 all landed.

This seed should be presented during `/gsd-new-milestone` (when initiating v8.2 or later) when the milestone scope matches any of:
- "v8.2", "post-v8.1", "next milestone after v8.1"
- "new swarm onboarding", "cross-swarm validation", "second registry-driven swarm"
- "info-routing", "info@smeba.nl", "Smeba info inbox"
- Reference to Phase 999.9 in the backlog

## Scope Estimate

**Medium** — a single phase, ~1-2 weeks of work. The implementation is mostly registry SQL (1 row in `swarms`, 7 rows in `swarm_noise_categories`, 1 row in `swarm_intents`) plus adding `info@smeba.nl` to the Outlook ingest mailbox list. The discuss-phase step resolves 5 deliberately-unresolved plan-time questions. The shadow-mode operating period itself is 2-4 weeks of observation, not active engineering.

## Breadcrumbs

Already-banked artifacts to read at promotion time:

- **Backlog entry:** `.planning/ROADMAP.md` Phase 999.9 (lines added 2026-05-19, commit `0b3a25e`)
- **Full proposal doc:** `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md` (open questions kept deliberately unresolved)
- **Implementation blueprint:** `.claude/skills/spike-findings-agent-workforce/references/info-routing-swarm-phase-88.md` (auto-loads via CLAUDE.md routing line)
- **Spike series + verdicts:** `.planning/spikes/MANIFEST.md` (4 VALIDATED spikes)
- **Spike outputs:** `.planning/spikes/00{1,2,3,4}-*/` with captured stats + cluster + overlap + sample data
- **Spike scripts (idempotent, re-runnable):** `web/debtor-email-analyzer/src/spike-00{1,2,3,4}-*.ts`
- **Architecture canon:** `docs/agentic-pipeline/README.md` + `docs/agentic-pipeline/stage-1-regex.md`
- **Locked principle:** `.planning/ROADMAP.md:571` + memory `feedback_intent_vocab_emerges_from_data` — "Intent vocabulary emerges from data, not Claude"

Prerequisite v8.1 phases (must all be ✓ closed before this seed activates):
- `.planning/phases/78-sales-email-stage-0-to-stage-3-onboarding/` — codegen for `swarm_intents` + `swarm_noise_categories`
- `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/` — `swarms.tenant_domains` + own-domain loopback
- `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/` — Stage 3 v3 + V3 schema
- `.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/` — discovery surface

## Notes

**Why this is a seed, not "just run it now":**
The dependencies are *architectural*, not nice-to-have. Starting Phase 999.9 before any of 78/84/85/86 lands forces shortcuts that silently violate the cross-swarm thesis (hand-edited TS consts, hand-curated router vocabulary, missing tenant_domains handling). The whole point of the architectural investment is to let info-routing be a 1-day phase instead of a 2-week one. Wait.

**Why this is a seed, not a calendar reminder:**
v8.1's close date isn't fixed — it depends on when 87 closes (which depends on 83+84+85+86 all going live). A seed beats a date-based reminder because the trigger is *the milestone audit*, which is the moment the prereqs are provably satisfied.

**One thing that could change between now and trigger:** if Phase 86's discovery surface ships in a shape that doesn't cluster cross-swarm by default, Phase 999.9's "shadow Stage 3 + let vocabulary emerge" approach needs revision. Re-read Phase 86's final design at promotion time and adjust the proposal doc's Stage 3 section if needed. Spike 004's `~14 emails/day arriving / ~7/day real` numbers should still hold (90d corpus is stable).

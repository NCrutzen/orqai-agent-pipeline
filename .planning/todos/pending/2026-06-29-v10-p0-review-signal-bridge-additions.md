# V10.0 P0 — two additions to the Cross-Stage Learning Loop spine

**Created:** 2026-06-29
**Milestone:** V10.0 — Cross-Stage Learning Loop · **Phase 0 (Spine)**
**Source:** live-data verification of the review→learning wiring (2026-06-29). Full analysis + producer→consumer file:line matrix: `docs/designs/2026-06-29-review-signal-learning-bridge.md`. Charter: `docs/v10-cross-stage-learning-loop-proposal.md`. Reqs live on branch `workspace/v10-phase-0` → `.planning/REQUIREMENTS.md` "V10.0 — Cross-Stage Learning Loop · Phase 0" (`SPINE-01..04`, `DIAG`, `POOL`, `GUARD`).

> **Single-writer note:** the V10.0 P0 requirements live in the `workspace/v10-phase-0` worktree (single-writer per `docs/collaboration.md`). These two points are recorded here on `main` as a parking-lot item; **fold them into that worktree's `REQUIREMENTS.md` when V10.0 P0 is (re)planned — do NOT fork the planning file from main.**

The charter is mature and already covers the bulk (its §11 ground-truth validation independently found "ambient dominates 131:1" and "machinery on a dead source — a finish/re-point milestone, not greenfield"). A full re-check (2026-06-29) confirmed: **intent learning is already scoped** (charter §3 + roadmap P4/P5), and the **forward-Wilson volume block (13 < n=20) is out of V10 scope** (a V9.7 routing-gate concern — see `2026-06-17-routing-misforward-feedback-loop-v10.md`). Only the two items below are genuine gaps.

## Add 1 — explicit anti-AI-grading guardrail (governance, charter §6)
**What:** state, as a hard governance rule, that **AI-sourced `correction_event`s (`source='ai_diagnosis'`, and in particular the AI's own open-set `intent_proposals_v1`) may feed DIAGNOSE / proposal generation but must NEVER count as a confirming verdict in the Wilson-CI / efficacy statistics.** Only operator-sourced signals (`ux_review`, `ambient`) are ground truth.

**Why it matters:** the charter lists `ai_diagnosis` as a first-class `correction_event` source (§2.1/§7). The supervisor `APPROVE` gate + shadow-eval (§2.5–2.7) structurally block *auto-promotion*, but nothing yet forbids an AI-sourced event from inflating a rule's agree-count. If AI grades AI, every Wilson-CI gate hollows out — the cardinal failure mode of a self-learning loop. (`intent_proposals_v1` is easy to mistake for operator feedback; it is the classifier's own emits — see the matrix in the design doc.)

**Where it folds in:** charter §6 (Governance) as a one-line invariant; enforce in the CLUSTER/PROPOSE step (filter `source` before any verdict-counting) and ideally a test.

## Add 2 — SPINE-04 must re-point a SECOND dead consumer (+ swarm-asymmetry motivation)
**What:** `SPINE-04` says "re-point the Phase-72 promotion pipeline off the dead bulk-review-override source onto the ambient source." Broaden it: there are **two** dead consumers, not one.
- Charter §11.1 measured the dead source via `pipeline_events.override → promotion_candidates` (empty).
- **Also dead:** the Stage-1 noise promotion reads `classifier_rule_telemetry` → **`agent_runs.human_verdict`**. Live count (2026-06-29): **408 rows, but 100% `debtor-email`; info-routing = 0, sales = 0.**

So `SPINE-04`'s "off the dead source" re-point must cover the `human_verdict`/`classifier_rule_telemetry` consumer too, projecting the relevant `swarm_review_signals` (approve/reclassify on a noise-classified mail) into the verdict source that `classifier-promotion-cron` reads.

**Why it matters (the unblock):** because `human_verdict` is **0 for the swarms doing the work now** (info-routing, sales), Stage-1 noise rules there can *never* promote — not "slowly", but structurally. This is the concrete reason the noise gate hasn't learned, and it's the highest-leverage part of P0 for the live swarms.

**Where it folds in:** extend `SPINE-04`'s acceptance to name both consumers; the migration `supabase/migrations/20260618_crossswarm_noise_shared_scope.sql` already left the seam ("source-agnostic on human_verdict so a future Outlook-delta verdict source feeds it with zero rework"), so the consumer side needs no rework — only a writer that projects ambient signals into it (recommend a dedicated `review_verdicts` source UNION-ed into `classifier_rule_telemetry`, to avoid `human_verdict`'s two-writer agree/disagree ambiguity — see design doc §6.2).

## Done when
Both points are reflected in the V10.0 P0 `REQUIREMENTS.md` (in the `workspace/v10-phase-0` worktree) before P0 implementation closes — Add 1 as a governance invariant + enforcement, Add 2 as broadened SPINE-04 acceptance.

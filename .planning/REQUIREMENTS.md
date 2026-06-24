# Requirements: V9.7 Routing Swarm Go-Live

**Milestone:** V9.7 — Routing Swarm Go-Live (Departmental Routing)
**Defined:** 2026-06-16
**Charter:** `docs/routing-swarm-milestone-charter.md` · **Milestone def:** `MILESTONES.md` (V9.7 section)

Scope: turn `info@` (smeba + fire-control) actionable mail into Stage-3 destination routing + forward, plus verkoop@→order@; staff curate routing rules via natural language. Phase band **130–134** (after V9.5's 120–122).

---

## P0 — info@ Stage-1 noise-recalibration (Phase 130)

The info-routing "unknown" pool is ~50% latent noise Stage 1 doesn't yet catch. P0 closes that leak so the router (P1) gets a clean denominator. Registry-data only — no per-swarm code (SWARM-02).

- **NOISE-01** — New Stage-1 `classifier_rules` candidates are registered for the latent-noise classes leaking into the info@ "unknown" pool: cold-sales/SEO outreach, marketing newsletters, auto-dealer/vehicle spam, unsolicited job applications, and survey/feedback invites. Candidates are registry rows (no per-swarm branch).
- **NOISE-02** — Candidates flow through the **existing Wilson-CI shadow→promote gate** (the same lifecycle as v8.0/v8.1 regex + LLM rules). No blind auto-archive: a candidate only promotes to an acting rule after it clears the confidence threshold on shadow telemetry.
- **NOISE-03** — Instrumented before/after measurement of the info@ "unknown" pool: the share that is actually noise drops from ~50% → **<20%** (the success metric), measured per live mailbox (info@smeba.nl + info@fire-control.nl).
- **NOISE-04** — Precision guard: zero false-archive of actionable mail. A hard actionable-token carve-out (never noise-reclass when an offerte/order/inkooporder/factuur/keuring/storing signal is present) and word-boundary matching prevent the leak-fix from eating routable mail.
- **NOISE-05** — Scope: rules apply across both live info@ mailboxes with brand/mailbox awareness; dormant info@ boxes (smeba-fire.be, berki.nl, sicli-noord/sud.be) are untouched (registry-flip later).

---

## Later phases (requirement groups stubbed; detailed at each phase's plan time)

- **P1 / Phase 131 — Destination taxonomy + Stage-3 router** (`ROUTE-xx`): freeze the 6-7 destination buckets + verified mailboxes; build the `info-routing-coordinator` Orq agent classifying on destination; destination registry; no Stage 2.
- **P2 / Phase 132 — Forward side-effect + Bulk Review** (`FWD-xx`): Stage-4 Outlook-forward (idempotent, dry-run-gated, brand-aware) + category stamp-back; info-routing Bulk Review surface.
- **P3 / Phase 133 — NL routing-config + verkoop→order** (`NLCFG-xx`): staff NL → routing rules (human-approved); verkoop@→order@ routing for `quote_acceptance`/`order_status`.
- **P4 / Phase 134 — Ambient-loop coupling** (`AMBIENT-xx`): clicked-away/moved mail → `correction_event` → V10.0 loop tunes routing rules.

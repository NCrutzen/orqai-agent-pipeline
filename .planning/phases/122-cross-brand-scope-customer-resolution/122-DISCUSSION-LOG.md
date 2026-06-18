# Phase 122: Cross-brand-scope customer resolution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 122-cross-brand-scope-customer-resolution
**Areas discussed:** Search universe, Auto-resolve safety bar, Suggestie + uniqueness, Misroute signal

---

## Search universe

| Option | Description | Selected |
|--------|-------------|----------|
| All BX brands | Trust any candidate returned regardless of brand; rely on uniqueness + strong-kind bar. | |
| Configured allowlist | Per-swarm/mailbox sibling-scope allowlist; more control, more maintenance. | |
| (Other) | "Wat is het meest logische, rekening houdend dat we straks ook de UK- en IE-regio's gaan krijgen?" | ✓ |

**User's choice:** Asked for the most logical option given that UK and IE regions are coming. Resolved to: **all `scope_key`s within the mailbox's own `environment_id`; never across environments.**
**Notes:** UK/IE will be separate `environment_id` values (separate NXT DBs), not new brands in BX. The `environment_id` hard filter is the regional boundary and already enforced; searching "all brands in the environment" scales to UK/IE with zero config change. An allowlist would be stale-prone and could drop valid matches. Confirmed "Yes." (D-01, D-02)

---

## Auto-resolve safety bar

| Option | Description | Selected |
|--------|-------------|----------|
| Strong exact IDs only | Only auto_safe_alone_kinds (invoice/customer/site no) may auto-resolve cross-brand; weak signals → suggestie. | ✓ |
| Same kinds as in-scope | Relax the scope filter for all kinds; higher recall, reintroduces sender-ambiguity false positives. | |

**User's choice:** "Alleen op sterke aanwijzingen." Plus an addition: "ik zou het dan handiger vinden als die op meerdere aanwijzingen tegelijk zoekt, want dan krijg je natuurlijk betere matches."
**Notes:** First attempt was unclear to the user ("Ik snap niet goed wat je hier nu precies wilt weten"); re-explained in plain Dutch (strong vs weak clue reliability, ~95% vs ~21%). User then approved strong-only AND requested multi-clue matching → mapped to the existing Phase 120 corroboration mechanism (≥2 agreeing signals → boost). Final bar confirmed "Ja, akkoord": auto-resolve on one strong-unique kind OR ≥2 corroborating signals; lone weak signal → suggestie. (D-03, D-04, D-05)

---

## Suggestie + uniqueness

| Option | Description | Selected |
|--------|-------------|----------|
| Best guess, pre-filled | One most-likely customer pre-filled; confirm/reject. | |
| Short candidate list | Operator picks from a shortlist. | |
| Both, situation-dependent | One clear candidate → pre-fill; several → shortlist. | |
| (Other) | User distinguished Outlook vs review-queue surfaces; proposed a colored Outlook label. | ✓ |

**User's choice:** Distinguished two surfaces — the **review queue** (UI already prepared, show the matches there) and **Outlook** (show the resolver as a colored label: green = certain, orange = uncertain, red = very uncertain, none = no match).
**Notes:** Resolved into a scope split (confirmed "Ja — label apart"): Phase 122 produces a **4-tier confidence** (🟢🟠🔴⚪) + suggestie + candidate set into the **existing review-queue** (no new queue UI); the **colored Outlook label** is a separate follow-up phase. Uniqueness rule for resolve-vs-suggestie: exactly one distinct `root_party_id` across cross-brand candidates → resolve, else suggestie. (D-06, D-07, D-08)

---

## Misroute signal

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, emit flag | Cross-brand resolve carries "resolved under brand X, mailbox is brand Y"; signal for V9.7 routing. | ✓ |
| No, pure resolution | 122 resolves only; routing phase recomputes the mismatch later. | |

**User's choice:** "Ja, vlag meegeven."
**Notes:** Cheap to emit, re-routes nothing; gives the future Routing Swarm (V9.7) and operator the mis-route signal. Honors the ROADMAP "resolve vs re-route" split — 122 owns resolution + flag; V9.7 acts. (D-09)

---

## Claude's Discretion
- Implementation shape (new precedence step vs. post-pass after in-scope miss).
- Exact JSON shape / field names of the new `resolution_config` cross-scope sub-config (mirror the Phase 120 `corroboration` block).
- Whether sales also opts in this phase vs. a later config-only flip (debtor is the frozen acceptance fixture).
- Exact representation of the "suggestie" tier in the confidence/audit types.

## Deferred Ideas
- Colored Outlook label by confidence tier (🟢/🟠/🔴/⚪) — its own follow-up phase.
- Actual mailbox re-routing of mis-routed mail — Routing Swarm milestone (V9.7).
- Sales opt-in to cross-brand — config-only flip once re-validated.

## Session note
- The Phase 122 git worktree (`workspace/phase-122-cross-brand-scope`) disappeared mid-discussion (worktree dir + branch both gone; cause unknown — not a destructive action in this session). It was recreated from `origin/main` (commit 13cc134f, identical base) and CONTEXT.md/DISCUSSION-LOG.md were written into the restored worktree. No discussion decisions were lost.

# Phase 131: Destination taxonomy + Stage-3 router — Specification

**Created:** 2026-06-17
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

Stand up the Stage-3 routing layer for the info-routing swarm: freeze a fixed destination taxonomy (~6–7 buckets × verified mailboxes) as a brand-aware destination registry, and build an `info-routing-coordinator` Orq agent that classifies each Stage-1-cleared actionable info@ email onto a destination and persists a rich destination verdict — **with no Outlook forward and no Stage 2** (the verdict is the deliverable; Phase 132 acts on it).

## Background

info-routing is a registered swarm on the canonical funnel with Stage 0/1 live, but its Stage-3 shell is empty: `swarms.stage3_coordinator_agent_key = null` and `stage2_entity_resolver = null` (charter §2). After Phase 130's noise recalibration, the info@ "unknown" pool is a clean denominator (~50%→<20% noise). The ~663/30d actionable "unknown" emails are still triaged 100% by hand. The Stage-3 coordinator pattern already exists and is registry-driven — `coordinator-orchestrator.ts` + `debtor-email-coordinator.ts` read the agent key from `swarms.stage3_coordinator_agent_key` and dispatch via the `swarm_intents` registry. **No destination/routing registry table exists yet** — this phase creates one (a `swarm_intents`-style destination registry). Verified target mailboxes exist and actively send (charter §2, 2026-06-16): order@/verkoop@/planning@/storing.smeba@/opleidingen@/hrm@ across smeba + fire-control + berki brands.

## Requirements

1. **Destination taxonomy frozen as registry data (ROUTE-01)**: A fixed set of ~6–7 high-confidence destination buckets is registered, not hardcoded.
   - Current: No destination registry exists; buckets live only as prose in the charter table.
   - Target: A destination registry holds the frozen buckets — order-entry/PO, verkoop/offerte, inspecties/keuringen (planning@), storingen, opleidingen/BHV, sollicitaties (hrm@), + an `algemeen/contactformulier` rest-bucket. Debiteuren/crediteuren/aanbestedingen are intentionally deferred (added later via registry INSERT).
   - Acceptance: The registry contains exactly the frozen bucket set as rows; adding a future bucket is a row INSERT with no code change (grep proves no `if swarm_type==='info-routing'` and no hardcoded bucket list in TS).

2. **Brand-aware (bucket × brand) → mailbox mapping (ROUTE-02)**: The registry resolves a (bucket, brand) pair to a concrete verified target mailbox.
   - Current: No mapping exists; brand awareness lives only in `scope_key`/`env_id='BX'` filtering.
   - Target: Each registry destination maps (bucket × brand ∈ {smeba, fire-control, berki}) to a verified mailbox (e.g. inspecties×fire-control → fire-control planning mailbox), so info@smeba can route fire-control mail to fire-control mailboxes.
   - Acceptance: For a known fire-control-inspection email received at info@smeba, the resolved mailbox is the fire-control destination, not smeba; `env_id='BX'` remains a hard filter.

3. **Stage-3 destination coordinator agent (ROUTE-03)**: An `info-routing-coordinator` Orq agent classifies destination AND brand together from email content, against the closed registry list.
   - Current: `swarms.stage3_coordinator_agent_key` is null for info-routing; no destination agent exists.
   - Target: The coordinator agent (registry-referenced via `stage3_coordinator_agent_key`) takes a Stage-1-cleared actionable email and returns a destination bucket + brand from the closed registry set, with a confidence score, via strict `response_format` json_schema (`anyOf` for nullable).
   - Acceptance: Given a labelled email, the agent returns a bucket+brand drawn only from the registry closed list (never a free-text destination); invalid/empty input yields the unrouted outcome, not a crash.

4. **Rich persisted destination verdict — the Phase 132 contract (ROUTE-04)**: Each routed email gets one persisted Stage-3 verdict carrying everything Phase 132 needs to forward safely.
   - Current: No Stage-3 verdict is written for info-routing.
   - Target: A persisted verdict per email containing: chosen bucket, derived brand, resolved target mailbox, confidence score, dedup status (already_addressed + which layer matched), and the unrouted flag.
   - Acceptance: For a sample email, a verdict row exists with all six fields populated; the verdict is the sole 131 output (Phase 132 reads it; 131 writes nothing to Outlook).

5. **Duplicate-delivery guard — both layers (ROUTE-05)**: Before assigning a destination, detect whether the same email already reached that destination mailbox, so 132 never double-forwards.
   - Current: No dedup logic; customers blast the same message to info@ + order@ + verkoop@ simultaneously.
   - Target: Two-layer check — (a) cheap: the target mailbox address is already in the email's To/CC; (b) robust: the target mailbox already received the same message (internet message-id / thread) in ingested data (order@ is already ingested). On match, the verdict's dedup status is `already_addressed` (with the matching layer) and is flagged not-to-forward.
   - Acceptance: A test email CC'ing the target mailbox yields `already_addressed` via layer (a); a test email whose message-id already exists in the target mailbox's ingested data yields `already_addressed` via layer (b); a non-duplicate yields `routable`.

6. **Unrouted bucket for low-confidence / no-match (ROUTE-06)**: When no confident destination is found, the email gets an explicit unrouted outcome routed to human triage — never a blind guess.
   - Current: No-destination emails sit in the manual "unknown" pool.
   - Target: Below the confidence threshold or with no registry match, the verdict carries an `unrouted` destination (distinct, human-triage) rather than a low-confidence bucket.
   - Acceptance: A deliberately ambiguous email produces an `unrouted` verdict (not a forced bucket); unrouted verdicts are queryable as a distinct set.

7. **Verdict-only scope — no forward, no Stage 2 (ROUTE-07)**: Phase 131 produces and persists the destination verdict and nothing more.
   - Current: info-routing has no Stage-3/4 behavior at all.
   - Target: 131 invokes Stage 3 only; it does NOT call Stage 2 (customer resolution) and does NOT trigger any Outlook forward or side-effect.
   - Acceptance: No Outlook Graph forward/move call is reachable from 131 code paths (grep/test); no Stage-2 resolver is invoked for info-routing; the funnel ends at the persisted verdict.

8. **Shadow precision measurement vs human-actual destination (ROUTE-08)**: Router accuracy is measured against what staff actually do, observed passively.
   - Current: No routing measurement exists; baseline routing accuracy = 0% (no router).
   - Target: On a sample, staff apply an Outlook category (intended destination) and/or actually forward the email; delta-sync (extended to the info@ mailboxes — a hard prerequisite, see Constraints) observes the human's real destination/category; incorrect labels are cleaned; the router's shadow verdict is graded against the human-actual destination. Gate: **≥85%** of (high-confidence) verdicts match the human-actual destination.
   - Acceptance: A measurement run reports per-bucket and overall match-rate of router verdict vs human-applied Outlook category/forward on the sample; overall ≥85% to pass. (Shadow — no forward fires during measurement.)

## Boundaries

**In scope:**
- The frozen destination taxonomy as a brand-aware destination registry (bucket × brand → verified mailbox).
- The `info-routing-coordinator` Stage-3 Orq agent (destination + brand classification on the closed registry list).
- A persisted, rich destination verdict per email (bucket, brand, mailbox, confidence, dedup status, unrouted flag).
- The two-layer duplicate-delivery guard (To/CC match → message-id/thread cross-mailbox match).
- The explicit `unrouted` outcome → human triage.
- A shadow measurement harness comparing router verdicts to human-actual destination (Outlook category/forward).

**Out of scope:**
- The Outlook **forward** side-effect / Stage-4 dispatch — Phase 132 (131 stops at the verdict; clean reversible boundary).
- The info-routing **Bulk Review** surface — Phase 132.
- The **natural-language routing-config UI** — Phase 133.
- **verkoop@ → order@** cross-mailbox routing — Phase 133.
- **Stage 2 / customer resolution** — routing needs no customer resolution (charter §4).
- The **4 dormant info@ mailboxes** (smeba-fire.be, berki.nl, sicli-noord/sud.be) — registry-flip later once smeba+fire-control are proven.
- The **multi-mailbox delta-sync extension to info@ + Outlook-category capture** — a hard prerequisite delivered OUTSIDE 131 (connects to the existing 112.5 delta-sync work); 131 assumes it is in place for measurement.
- **Draft-reply generation** — separate track after this milestone.

## Constraints

- **Registry-driven, SWARM-02-conform**: zero `if swarm_type==='info-routing'` branches; destinations + routing rules are registry data; a new mailbox/destination is an INSERT.
- **Brand filter**: `env_id='BX'` remains a hard filter; brand resolution reuses/extends the existing `scope_key`/brand logic but the agent decides brand+bucket jointly.
- **Orq agent conventions** (CLAUDE.md): strict `response_format` json_schema with `anyOf` for nullable fields; validate model IDs via `list_models` before create/update; Zod-validate output; closed-list destinations only.
- **No Stage 2**; no Outlook write/forward in this phase (shadow only).
- **Hard prerequisite (outside 131)**: delta-sync must run on the info@ mailboxes and capture the Outlook category, otherwise the ROUTE-08 measurement cannot run. SPEC treats this as a dependency, not a 131 deliverable.
- **Reuses** the existing Stage-3 coordinator pattern (`coordinator-orchestrator.ts`, `swarms.stage3_coordinator_agent_key`, `swarm_intents`-style registry) — destination registry is the `swarm_intents` analog for routing.

## Acceptance Criteria

- [ ] Destination registry holds exactly the frozen 6–7 bucket set; a new bucket is an INSERT (no code change) — grep proves no hardcoded bucket list / no swarm_type branch.
- [ ] (bucket × brand) → verified mailbox mapping resolves correctly, incl. the fire-control-mail-in-info@smeba cross-brand case; `env_id='BX'` hard filter intact.
- [ ] `info-routing-coordinator` agent returns bucket+brand+confidence from the closed registry list only; invalid input → unrouted (no crash).
- [ ] Each routed email persists a verdict with all six fields (bucket, brand, mailbox, confidence, dedup status, unrouted flag).
- [ ] Dedup layer (a) To/CC match and layer (b) message-id/thread cross-mailbox match each produce `already_addressed`; non-duplicate → `routable`.
- [ ] Ambiguous email → explicit `unrouted` verdict (not a forced bucket); unrouted set is queryable.
- [ ] No Outlook forward/move call and no Stage-2 invocation reachable from 131 code paths (grep/test).
- [ ] Measurement run reports overall + per-bucket match-rate of verdict vs human-actual destination (Outlook category/forward via delta-sync); overall ≥85% to pass.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | Router+registry+verdict scope frozen; 6-7 buckets fixed      |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | 131 stops at verdict; forward/NL-config/verkoop-order = 132/133 |
| Constraint Clarity | 0.82  | 0.65 | ✓      | Registry-driven, no Stage 2, dedup both-layers, brand-by-agent; delta-sync prereq |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | ≥85% verdict-vs-human-actual via Outlook category/delta-sync |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      |                                                              |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective     | Question summary                              | Decision locked                                                                 |
|-------|-----------------|-----------------------------------------------|---------------------------------------------------------------------------------|
| 1     | Researcher      | Which destination buckets to freeze?          | Focused 6-7 high-confidence set (order/verkoop/inspecties/storingen/opleidingen/sollicitaties + algemeen rest); debiteuren/crediteuren/aanbestedingen later via registry |
| 1     | Researcher      | 131↔132 boundary?                             | 131 stops at the persisted destination verdict; forward = 132                   |
| 1     | Boundary Keeper | No-destination handling? (+ user addition)    | Explicit `unrouted` bucket → human; PLUS new requirement: duplicate-delivery guard (customers blast to many mailboxes at once) |
| 2     | Simplifier      | Success metric?                               | Outlook Category label as ground truth; delta-sync (on info@) compares human-actual forward/category to verdict |
| 2     | Researcher      | Dedup detection mechanism?                    | Both layers — To/CC recipient match, then message-id/thread cross-mailbox match |
| 2     | Researcher      | Brand-mailbox resolution?                     | Agent classifies brand AND bucket together; registry maps (bucket × brand) → mailbox |
| 3     | Boundary Keeper | Delta-sync-on-info@ dependency positioning?   | Hard prerequisite OUTSIDE 131 (connects to 112.5 delta-sync work); SPEC notes as dependency |
| 3     | Boundary Keeper | What must the verdict contain?                | Rich: bucket + brand + mailbox + confidence + dedup status + unrouted flag      |
| 3     | Failure Analyst | Precision gate? (+ measurement clarification) | ≥85% (shadow); ground truth = human-actual destination (staff label/forward), delta checks human-forward-vs-label, cleans incorrect labels, draws conclusions |

---

*Phase: 131-destination-taxonomy-stage-3-router-v9-7-p1*
*Spec created: 2026-06-17*
*Next step: /gsd:discuss-phase 131 — implementation decisions (how to build what's specified above)*

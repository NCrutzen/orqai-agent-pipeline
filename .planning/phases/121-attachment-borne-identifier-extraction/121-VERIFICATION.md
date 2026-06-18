---
phase: 121-attachment-borne-identifier-extraction
verified: 2026-06-17T22:00:00Z
status: human_needed
score: 5/5
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Confirm ROADMAP completion marker aligns with intent — Phase 121 is marked [x] (completed 2026-06-17) in ROADMAP.md, but Plans 121-02 and 121-03 do not yet exist and the build goal (#24 xlsx extraction + one-mail→many guard) has not been coded. Decide: is the ROADMAP marker accurate (discovery wave = full phase scope) or should it be rolled back to show 121 as in-progress with 121-02/03 planned?"
    expected: "Either (a) ROADMAP comment clarifies that 121 = discovery-only and 121-02/03 are planned as separate planning cycles, OR (b) the [x] marker is revised and 121-02 is planned before the V9.5 milestone closes."
    why_human: "The ROADMAP checkmark carries milestone-level meaning. Whether the discovery wave alone satisfies the phase's build goal ('parse identifiers out of attachment content and feed into Stage 2') is an architectural/product decision, not a code-traceability question."
  - test: "Decide whether the ATID-01..04 traceability gap is acceptable. REQUIREMENTS.md contains only Phase 120 (CORR-01..05) requirements — no ATID-* rows exist anywhere in the file. The plan claims ATID-01/03/04 as completed requirements, but there is no requirements registry to validate against."
    expected: "Either (a) ATID-01..04 are added to REQUIREMENTS.md so the completed claims are traceable, OR (b) the team explicitly accepts that Phase 121 requirements are defined only in ROADMAP.md draft shape and not in REQUIREMENTS.md."
    why_human: "Adding or accepting-absence of requirement IDs is a documentation policy decision, not automatable."
---

# Phase 121: Attachment-borne Identifier Extraction — Verification Report

**Phase Goal (ROADMAP):** Parse identifiers out of attachment content (PDF text first) and feed them into Stage 2 resolution as first-class identifiers; adapter-side body-source, engine byte-identical (STAGE2-01-safe); registry-gated per swarm (`attachment_config`), no per-swarm code (SWARM-02).
**Verified:** 2026-06-17T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Framing: Two Levels of Verification

Per the verification brief, this report addresses both:

**Level 1 — Did Plan 121-01 achieve its stated goal?** (PASS)
**Level 2 — Is the PHASE's build goal achieved?** (HUMAN DECISION REQUIRED)

---

## Level 1: Plan 121-01 Goal Achievement

Plan 121-01 is a discovery/findings plan. Its deliverable is `121-GAP-MANIFEST.md`. All five must-haves are verified.

### Observable Truths (Plan 121-01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sales-email's current `attachment_config` (capture/extract switches) is recorded as fact, not assumed. | VERIFIED | Manifest Section 1a: live read-only query + migration source (`20260605b_swarms_attachment_switches.sql`, `20260615c_activate_debtor_attachment_lever.sql`). Both `sales-email` and `debtor-email` recorded as `capture=true, extract=true`. |
| 2 | For each of the 7 bucket-A + 3 bucket-D fixture rows, the actual state is recorded: attachment captured? extraction_status? extracted_text present? gold identifier reaches folded resolver body? resolver currently resolves correctly? | VERIFIED | Manifest Section 1c (Task 1 table, 9 unique rows covering all 10 fixture slots — #86 appears in both buckets, classified once with explicit acknowledgment at line 159) + Section 2b (Task 2 table with resolution outcome per row). |
| 3 | Each fixture row is classified into exactly one gap class. | VERIFIED | Manifest Section Task 3 classification table: 9 unique rows, each with exactly one primary class. The manifest's own coverage check (line 158) states: "all 9 enumerated rows classified into exactly one primary class (the 10th 'row', #86, appears in both Bucket A and Bucket D of the eval but is a single fixture row, classified once)." |
| 4 | The gap manifest sizes Plans 121-02+ — only EXTRACTION-GAP and MANY-CUSTOMER classes become build work; ALREADY-RESOLVES rows become regression-guard, not build. | VERIFIED | Manifest Section "Plans 121-02+ scope (derived ONLY from EXTRACTION-GAP + MANY-CUSTOMER)": exactly one buildable-now class (#24 MANY-CUSTOMER with xlsx EXTRACTION-GAP as prerequisite sub-task). Class tally confirms ALREADY-RESOLVES rows (#16/#19/#28/#29/#86) are regression-guard, not build. |
| 5 | Task-2 live-lookup gate honored — no outward NXT/Zapier call; no engine/config/steps edits. | VERIFIED | Manifest Section 2a documents the gate in full: no `DEBTOR_FETCH_WEBHOOK_SECRET` in workspace, `debtorP0Config.auto_safe_kinds=[]` means debtor falls to legacy Zaps, no outward call made. All 121 commits (`30df61c1`, `20630041`, `1fede0f0`, `a21c8b5d`) touch ONLY `.planning/` files — zero `web/` production files modified. Confirmed via `git show --name-only`. |

**Score: 5/5**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/121-attachment-borne-identifier-extraction/121-GAP-MANIFEST.md` | Per-row fixture baseline + gap classification that sizes Plans 121-02+ | VERIFIED | File exists (17,293 bytes, created 2026-06-17). Contains all three task sections, Task 1+2 tables, Task 3 classification table with class tally, Plans 121-02+ scope section, and stale-assumptions list. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `stage-2-customer-resolver.ts:84-138` | engine identifier extraction over combined body | `body_text` mutation with UNTRUSTED fence | VERIFIED | `grep` confirms the fold exists at the referenced location: `email_attachments` queried, `extracted_text` appended to `body_text` inside `--- ATTACHMENTS (UNTRUSTED DATA ---` fence. The engine sees the combined body without any engine-file changes (STAGE2-01-safe). |
| `extract.ts` | xlsx extraction | xlsx branch | VERIFIED (gap confirmed) | `extract.ts:161-162` returns `{ status: "unsupported", text: "" }` for docx/xlsx. Manifest correctly identifies this as the EXTRACTION-GAP for #24. Live evidence: 0/20 `.xlsx` attachments ever extracted. |

### Behavioral Spot-Checks

Step 7b: SKIPPED — Plan 121-01 is a read-only findings plan. No runnable code was produced or modified. The only output is a markdown document.

### Probe Execution

Step 7c: SKIPPED — No probes declared in PLAN frontmatter or SUMMARY. No `scripts/*/tests/probe-*.sh` files exist for this phase (discovery-only plan, no production code).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `121-GAP-MANIFEST.md` | 51 | Says "10 fixture rows" in heading but classifies 9 unique rows | Info | The manifest itself resolves this at line 158-159: "#86 appears in both Bucket A and Bucket D of the eval but is a single fixture row, classified once." No false count — the heading refers to the 10 fixture slots (7 bucket-A + 3 bucket-D), not unique row IDs. Not a blocker. |

No TBD/FIXME/XXX debt markers found in any Phase 121 files.

---

## Level 2: Phase Build Goal Assessment

This is the harder question the verification brief specifically asks about.

### What the ROADMAP goal requires

The ROADMAP Phase 121 description reads: *"Parse identifiers out of attachment content (PDF text first) and feed them into Stage 2 resolution as first-class identifiers."* The draft shape items include:

1. Same extraction regexes/kinds as body (no attachment-specific logic)
2. Adapter-side entry into Stage 2, engine byte-unchanged
3. Registry-gated per swarm via `attachment_config`
4. Sales onboards first
5. Factuur in subject extracted + factuur-match outranks sender-match

### What the manifest found

The manifest's central finding is that items 1-5 above are **substantially already shipped**:

- Items 1-3: the `stage-2-customer-resolver.ts:84-138` fold (Phase 116-05/D-11) already folds `extracted_text` into `body_text`, adapter-side, engine byte-identical. Confirmed live in codebase.
- Item 3 (registry gate): both `sales-email` and `debtor-email` already have `capture=true, extract=true` per live query + migration source. ATID-03/04 effectively met.
- Item 5: `identifier-match.ts:84` already extracts factuur from the subject line.

The **one residual build item** is `#24`: xlsx format support in `extract.ts` + the one-mail→many-customers guard in the corroboration layer. This is described in detail in the manifest's "Plans 121-02+ scope" section, but **no 121-02 PLAN file exists yet**.

### Current state

| Requirement Item | Status |
|-----------------|--------|
| Attachment-text fold (adapter-side, engine byte-identical) | ALREADY SHIPPED (116-05/D-11) — verified in codebase |
| Registry gate (`attachment_config` opt-in) | ALREADY SHIPPED + opted-in for both swarms — verified live |
| Same extraction regexes as body (ATID-01) | ALREADY MET by fold mechanism — extraction runs over combined body using existing engine |
| Sales onboards first (ATID-04) | ALREADY MET — `sales-email capture=true, extract=true` |
| Factuur in subject extracted | ALREADY MET — `identifier-match.ts:84` confirmed |
| xlsx extraction for #24 (EXTRACTION-GAP) | NOT DONE — `extract.ts` returns `unsupported`; Plan 121-02 not yet planned |
| One-mail→many-customers guard for #24 (MANY-CUSTOMER) | NOT DONE — Plan 121-02 not yet planned |
| Eval-grounded acceptance over fixture (121-03) | NOT DONE — blocked on Phase 123 (debtor → resolve_candidates); Plan 121-03 not yet planned |

### ROADMAP completion marker discrepancy

ROADMAP.md line 528 marks Phase 121 as `[x]` completed. However:
- Plans 121-02 and 121-03 do not exist
- The `[x]` appears to reflect the *discovery wave only* — the manifest authors note that the marking intent was to close the planning/discovery portion
- Whether the build residual (#24) should keep Phase 121 open, or whether it gets folded into a separately-named planning cycle, is a product/milestone tracking decision

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ATID-01 | 121-01-PLAN.md | Identifiers via same extraction regexes as body | NEEDS HUMAN | Effectively met by fold mechanism (already shipped), but no REQUIREMENTS.md entry to close against. |
| ATID-03 | 121-01-PLAN.md | Registry-gated per swarm via `attachment_config` | NEEDS HUMAN | Live confirmed both swarms opted-in; but no REQUIREMENTS.md entry. |
| ATID-04 | 121-01-PLAN.md | Sales onboards first | NEEDS HUMAN | Sales `capture=true, extract=true` confirmed; but no REQUIREMENTS.md entry. |
| ATID-02 | (referenced in plan body) | Engine byte-unchanged | NOT IN PLAN frontmatter | The no-engine-diff constraint is respected (all commits docs-only), but ATID-02 is not in the plan's `requirements` frontmatter field. |

**Traceability gap confirmed:** REQUIREMENTS.md contains only Phase 120 requirements (CORR-01..05). There are zero ATID-* rows. The executor's SUMMARY claims `requirements-completed: [ATID-01, ATID-03, ATID-04]` — these completions cannot be cross-referenced against any requirements registry entry. This was flagged in the verification brief and is confirmed here.

---

## Human Verification Required

### 1. ROADMAP Completion Marker vs. Actual Build State

**Test:** Review ROADMAP.md line 528 — Phase 121 is marked `[x] (completed 2026-06-17)`. Confirm the intent: does this marker mean (a) only Plan 121-01 discovery is done and 121-02/03 will be planned as follow-on, or (b) the whole phase is considered closed because the build goal was already substantially met by prior phases?

**Expected:** A clear decision documented in ROADMAP.md (or a comment/note) so the V9.5 milestone audit reflects whether the #24 xlsx build work is tracked as open or deferred to a separate phase.

**Why human:** Whether "discovery wave complete = phase complete" is a valid milestone interpretation depends on the team's definition of Phase 121's scope. If the build residual (#24) is considered V9.5 scope, the `[x]` marker is premature. If the team decides #24 is out-of-V9.5-scope or tracked elsewhere, the marker is fine. This is a product tracking decision.

### 2. ATID-* Requirements Traceability Gap

**Test:** Navigate to `.planning/REQUIREMENTS.md`. Observe that no ATID-* rows exist — the only entries are Phase 120 CORR-01..05. The plan frontmatter declares `requirements: [ATID-01, ATID-03, ATID-04]` and the summary claims `requirements-completed: [ATID-01, ATID-03, ATID-04]`, but there is nothing to close against.

**Expected:** Either ATID-01..04 rows are added to REQUIREMENTS.md (matching the ROADMAP's draft shape items 1-5), or the team explicitly accepts that Phase 121 requirements live only in the ROADMAP and the REQUIREMENTS.md mechanism is not used for this phase.

**Why human:** Adding requirement IDs to REQUIREMENTS.md is a documentation policy decision. The executor reported "mark-complete returned not_found" for all ATID-* IDs — this is confirmed. Whether to fix the registry or accept the gap is not a code decision.

---

## Gaps Summary

No blockers found in Plan 121-01's execution. All five must-haves are satisfied for the discovery wave.

The `human_needed` status reflects two open items that require a product/tracking decision before the V9.5 milestone can be audited cleanly:

1. The ROADMAP `[x]` marker signals Phase 121 as complete, but Plans 121-02 (xlsx build + many-customer guard) and 121-03 (eval acceptance, gated on Phase 123) have not been planned. The manifest provides the scope for 121-02 in detail. The question is whether those plans are expected within V9.5 or are being tracked elsewhere.

2. The ATID-01..04 requirement IDs referenced in the plan have no entries in REQUIREMENTS.md. This is a traceability gap but not a functionality gap — the underlying behaviors (fold, opt-in, adapter-side) are confirmed shipped by prior phases.

---

_Verified: 2026-06-17T22:00:00Z_
_Verifier: Claude (gsd-verifier)_

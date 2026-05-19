---
phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
plan: 06b
subsystem: classifier / Stage 1 (regex + LLM 2nd-pass)
tags: [stage-1, classifier-screen-worker, body-ingestion, dual-write, phase-83]
dependency-graph:
  requires:
    - "83-01 (body_full_text + body_unique_text columns on email_pipeline.emails)"
    - "83-03 (ingest writers persist body_full_text; Stage 0 payload's body_text already carries full thread per D-01)"
  provides:
    - "Stage 1 regex engine + LLM 2nd-pass classify on the FULL thread for forwards/replies"
    - "D-10 reader-side dual-write: classifier-screen-worker prefers body_full_text, falls back to body_text"
  affects:
    - "Phase 83-07 (verification surface — Stage 1 verdict distribution sanity on FW:/Re: subjects)"
    - "Phase 84 (rule promotion — wider regex input may surface body-only matches in quoted history; gated via Wilson-CI shadow)"
tech-stack:
  added: []
  patterns:
    - "Reader-side dual-write fallback (body_full_text ?? body_text ?? '') — symmetric to the writer-side dual-write in 83-03"
key-files:
  created:
    - .planning/phases/83-body-ingestion-capture-full-thread-on-forwards-and-replies/83-06b-SUMMARY.md
  modified:
    - web/lib/inngest/functions/classifier-screen-worker.ts
    - web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts
decisions:
  - "D-06 (Stage 1 portion) honored: Stage 1 regex engine sees body_full_text"
  - "D-10 honored: body_text fallback retained so upstream emitters that haven't yet propagated body_full_text don't regress"
  - "RFC compliance: Stage 1 closed list (noise keys + 'unknown') unchanged; swarm_noise_categories writes untouched; hard separation rule preserved"
metrics:
  duration_minutes: 12
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 2
  completed_date: 2026-05-19
---

# Phase 83 Plan 06b: Stage 1 Body Full-Text Reader Summary

Switched the Stage 1 regex screen worker
(`web/lib/inngest/functions/classifier-screen-worker.ts`) to consume
`body_full_text` from the `classifier/screen.requested` event with a
`body_text` fallback. The registry-keyed regex engine
(`STAGE1_REGEX_MODULES[swarm.stage1_regex_module].classify`) and the
Stage 1 LLM 2nd-pass on `regex='unknown'`
(`invokeOrqAgent("stage-1-category-classifier", ...)`) both now see the
full thread on forwards and replies — closing the D-06 gap for Stage 1.

## What Shipped

### Task 1 — Switch Stage 1 to body_full_text with fallback (commit `bf44ab8`)

`web/lib/inngest/functions/classifier-screen-worker.ts`:

- Event destructure extended with `body_full_text?: string | null`.
- `bodySnippet` derivation changed from `(body_text ?? "").slice(0, 2000)`
  to `(body_full_text ?? body_text ?? "").slice(0, 2000)`.
- LLM 2nd-pass `body_text` forward changed from `body_text ?? ""` to
  `body_full_text ?? body_text ?? ""`.
- Three explanatory comments added inline tying the changes back to
  Phase 83 D-06 / D-10.
- No prompt change, no schema change, no `swarm_noise_categories` write
  touched. Stage 1 closed list (noise keys + `unknown`) preserved per
  `docs/agentic-pipeline/stage-1-regex.md`.

`web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts`:

- `baseEvent()` factory now accepts a `body_full_text` override; the
  payload always carries a `body_full_text` field (null by default to
  exercise the fallback path on the existing 18 tests).
- One new test "Phase 83 Plan 06b D-06 / regex bodySnippet prefers
  body_full_text over body_text (wider-input substitution)" sets
  `body_full_text="FULL THREAD"` and `body_text="NEW ONLY"` and asserts:
  - `classify` is called with `bodySnippet: "FULL THREAD"` (regex engine
    sees the wider input).
  - `invokeOrqAgent("stage-1-category-classifier", ...)` receives
    `body_text: "FULL THREAD"` on the LLM 2nd-pass (D-10 portion).

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` | 19/19 pass (was 18; +1 new wider-input assertion) |
| `npx tsc --noEmit` (full web tree) | 0 errors |
| `grep -c "body_full_text" web/lib/inngest/functions/classifier-screen-worker.ts` | 7 (event destructure + type + bodySnippet + LLM forward + 3 explanatory comments — well above the ≥3 floor) |

## Plan Interpretation Note

The plan's `<action>` block under A says "extend Supabase select to
include body_full_text alongside body_text". The Stage 1 screen worker
has no direct SELECT on `email_pipeline.emails` — `body_text` arrives
via the inngest event payload emitted by `stage-0-safety-worker`. The
plan's intent (give Stage 1 the wider input) is honored by extending the
**event-data destructure** to read `body_full_text` from the event with
a `body_text` fallback. Acceptance criteria reference three reader
sites (select + bodySnippet + LLM 2nd-pass forward); those map cleanly
to (event destructure + bodySnippet + LLM forward) in the actual file
shape. The numeric grep floor (≥3) is exceeded by a comfortable margin.

The upstream emit-site change (Stage 0 forwarding `body_full_text` to
the Stage 1 event) is not part of this plan; the fallback to `body_text`
preserves today's behavior because per 83-03 D-01 the Stage 0 payload's
`body_text` field already carries `msg.bodyText` (the full thread). The
fallback is the defensive layer that lets a future Stage 0 emit-site
change land cleanly without coordinating two commits.

## Deviations from Plan

None for Rules 1-4. Plan executed as written; the line-number guidance
in `<action>` is illustrative — the actual file structure differs
slightly (no DB select; event destructure instead) but the semantic
intent and acceptance criteria are fully honored.

## Threat Flags

None. T-83-24 (LLM 2nd-pass PII surface on wider input) and T-83-25
(regex false-positive in quoted history) are both pre-existing
dispositions in the plan's threat register; no new surface introduced.

## Self-Check: PASSED

- FOUND: web/lib/inngest/functions/classifier-screen-worker.ts (modified)
- FOUND: web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts (modified)
- FOUND commit: bf44ab8 (feat(83-06b): Stage 1 reads body_full_text with body_text fallback)
- vitest screen-worker suite: 19/19 green
- tsc --noEmit: clean
- grep -c body_full_text in screen worker: 7 (≥3 floor)

---
phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
plan: 06b
type: execute
wave: 6
depends_on: [83-03, 83-05]
files_modified:
  - web/lib/inngest/functions/classifier-screen-worker.ts
  - web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "Stage 1 regex screen worker reads body_full_text with fallback to body_text (D-06 Stage 1 portion, D-10)"
    - "Stage 1 vs Stage 3 hard separation rule unchanged — swarm_noise_categories writes untouched"
    - "bodySnippet fed into regex evaluation prefers body_full_text when present"
    - "LLM 2nd-pass classifier input also uses body_full_text with body_text fallback (D-10)"
  artifacts:
    - path: web/lib/inngest/functions/classifier-screen-worker.ts
      provides: "Stage 1 screen worker reading body_full_text with body_text fallback"
      contains: "body_full_text"
  key_links:
    - from: "classifier-screen-worker (Stage 1)"
      to: "email_pipeline.emails.body_full_text"
      via: "Supabase select column extension + bodySnippet coalesce"
      pattern: "body_full_text"
---

<objective>
Switch the Stage 1 regex screen worker to read body_full_text with body_text fallback,
so the regex engine (and the LLM 2nd-pass on `unknown` per Phase 74) sees the full
thread on forwards and replies.

Purpose: D-06 (Stage 1 portion). Sibling plan 83-06 handles the Stage 3 coordinator
path; both can run in parallel within wave 6 because they touch disjoint files.

RFC compliance: Stage 1 vs Stage 3 hard separation rule UNCHANGED. Only the INPUT
column swaps from body_text to body_full_text. Registry writes
(swarm_noise_categories) and the noise-key-or-unknown closed list are untouched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/83-body-ingestion-capture-full-thread-on-forwards-and-replies/83-CONTEXT.md
@docs/agentic-pipeline/stage-1-regex.md
@web/lib/inngest/functions/classifier-screen-worker.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Switch Stage 1 regex screen worker to body_full_text with fallback</name>
  <files>web/lib/inngest/functions/classifier-screen-worker.ts, web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts</files>
  <read_first>
    - web/lib/inngest/functions/classifier-screen-worker.ts (lines 100-260 — every body_text read site)
    - docs/agentic-pipeline/stage-1-regex.md (confirm registry shape unchanged)
  </read_first>
  <action>
A. Around line 123 — extend Supabase select to include body_full_text alongside body_text. Preserve every other field.

B. Around line 198 — change bodySnippet derivation: (body_full_text ?? body_text ?? "").slice(0, 2000).

C. Around line 236 — body_text forwarded to LLM 2nd-pass classifier becomes (body_full_text ?? body_text ?? "").

D. Do NOT modify the LLM 2nd-pass prompt or schema. Do NOT alter swarm_noise_categories writes. Stage 1 still emits the noise-key-or-unknown closed list per docs/agentic-pipeline/stage-1-regex.md.

E. Update __tests__/classifier-screen-worker.test.ts: add ONE new test asserting that when an email row carries body_full_text="FULL THREAD" and body_text="NEW ONLY", the bodySnippet fed to the regex engine equals "FULL THREAD". Update any existing assertion that pins the SELECT string to include the new column.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts — green; grep -c "body_full_text" web/lib/inngest/functions/classifier-screen-worker.ts is at least 3; cd web && npx tsc --noEmit — clean</automated>
  </verify>
  <acceptance_criteria>
    - grep -c "body_full_text" web/lib/inngest/functions/classifier-screen-worker.ts is at least 3 (select + bodySnippet + LLM 2nd-pass forward)
    - New test asserts the wider-input substitution
    - Existing screen-worker tests still pass
    - tsc --noEmit clean
  </acceptance_criteria>
  <done>Stage 1 regex evaluation sees the full thread; downstream registry behavior unchanged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| email_pipeline.emails → Stage 1 regex + LLM 2nd-pass | Wider regex/LLM input (full thread) on noise screening; same trust posture as today, just more content per call. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-24 | Information disclosure | LLM 2nd-pass on `unknown` now sees full thread (more PII surface) | accept | Same Orq.ai EU residency as Stage 3; the LLM was already invoked on this corpus, just with a narrower input. R-03 spot-check in 83-07 covers behavior delta. |
| T-83-25 | Tampering (regex false-positive) | wider input causes regex to match noise patterns in quoted history that should have been ignored | mitigate | Existing regex rules anchor on sender/subject/header conditions; body-only rules are reviewed pre-promotion via Wilson-CI shadow (Phase 84). Phase 83 ships the reader swap only — no regex-rule changes here. |
</threat_model>

<verification>
- screen-worker vitest suite green including the new wider-input assertion.
- tsc --noEmit clean.
- Post-deploy: Stage 1 verdict distribution monitored via existing dashboards; any noise-key spike on FW:/Re: subjects surfaces in Phase 83-07 V4 (PII expansion sanity) or Phase 84 promotion gates.
</verification>

<success_criteria>
- Stage 1 reads body_full_text with fallback.
- No registry behavior changed (Stage 1 closed list preserved).
- Tests prove the reader swap is honored end-to-end.
</success_criteria>

<output>
After completion, create `.planning/phases/83-body-ingestion-capture-full-thread-on-forwards-and-replies/83-06b-SUMMARY.md`
</output>

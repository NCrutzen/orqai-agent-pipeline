---
phase: 87
plan: 05
type: execute
wave: 4
depends_on: [04]
files_modified:
  - .planning/phases/87-retro-classification-and-intent-volume-baseline/87-BASELINE-REPORT.md
autonomous: false
requirements: [REQ-87-04, REQ-87-05]
tags: [phase-87, closure-report, operator-authored, hand-grading]
must_haves:
  truths:
    - "Full 5000-email retro run completed on production with zero step failures"
    - "87-BASELINE-REPORT.md exists with all 4 sections from D-04: distribution shift, open-set proposal summary, hand-graded diff sample (20 rows), hypotheses confirmed/refuted"
    - "Distribution shift table footnote calls out the Phase 84 Stage 1 noise-survivor filter applied to pre-v8.1 sample (Pitfall 1)"
    - "Hand-graded 20-row precision ≥ 70% (SC-4) OR explicit narrative on why it didn't meet threshold"
    - "Total token usage per run_id reported (D-03)"
  artifacts:
    - path: .planning/phases/87-retro-classification-and-intent-volume-baseline/87-BASELINE-REPORT.md
      provides: "Phase 87 closure report — the falsifiable v8.1 evidence"
      contains: "Distribution shift"
  key_links:
    - from: .planning/phases/87-retro-classification-and-intent-volume-baseline/87-BASELINE-REPORT.md
      to: stage_3_retro_runs
      via: "SQL outputs pasted by operator"
      pattern: "run_id"
    - from: .planning/phases/87-retro-classification-and-intent-volume-baseline/87-BASELINE-REPORT.md
      to: intent_proposal_clusters
      via: "section 2 reads Phase 86 cluster surface"
      pattern: "intent_proposal_clusters"
---

<objective>
Operator-authored closure deliverable. Plan 04's 50-email smoke is green; this plan runs the full 5000-email retro pass, then the operator hand-writes `87-BASELINE-REPORT.md` from SQL outputs and grades the 20-row diff sample.

D-04 (locked) shape:
1. **Distribution shift table** — closed-list intent counts pre-v8.1 vs post-v8.1, delta, %delta, with the Phase 84 noise-survivor filter applied to the pre-v8.1 sample (Pitfall 1 footnote).
2. **Open-set proposal summary** — top-N clusters from `intent_proposal_clusters`, centroid + sample count.
3. **Per-email diff sample** — 20 random rows where `original_top_intent ≠ new_top_intent`, hand-graded "correct/incorrect/ambiguous".
4. **Hypotheses confirmed/refuted** — checklist vs SC-1, SC-2, SC-3, SC-4 from CONTEXT.md.

Output: a single Markdown file. SQL queries the operator runs are listed inline below as artefacts so the next operator can reproduce.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-CONTEXT.md
@.planning/phases/87-retro-classification-and-intent-volume-baseline/87-RESEARCH.md
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: [BLOCKING] Run full 5000-email retro pass on production</name>
  <what-built>Plan 04 50-email smoke is green. Inngest function + CLI deployed.</what-built>
  <how-to-verify>
    Operator runs (from `web/`):

    ```
    cd web && npx tsx scripts/run-retro-classify.ts --since 2026-04-20 --until 2026-05-20 --yes
    ```

    (Default window = trailing 30 days, no `--sample-limit` → capped at 5000 by `selectCandidates`.)

    Expected:
    1. Banner prints PRODUCTION, count of stage=3 events to be processed (must be ≤5000; if more, narrow the window and re-run).
    2. Inngest dashboard run completes within ~6 hours (sequential, ~4s/email).
    3. No step failures; `retries: 3` may absorb transient Orq 5xx — that's fine, just no terminal failures.
    4. Capture the `run_id` from the Inngest function return value (visible in dashboard "Output" panel).
    5. Side-channel sanity SQL (same as Plan 04 Task 4 step 7): zero new `agent_runs.status='predicted'` rows attributable to the retro window.

    Record: run_id, processed count, total_tokens, run duration, Inngest run URL.
  </how-to-verify>
  <resume-signal>Type "full run done: run_id=<uuid> processed=<n> total_tokens=<n>" when complete.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] Hand-grade 20-row diff sample</name>
  <what-built>Full retro run committed to `stage_3_retro_runs`.</what-built>
  <how-to-verify>
    Operator runs via Supabase MCP `execute_sql` (substitute `<RUN_ID>`):

    ```sql
    SELECT
      r.email_id,
      e.subject,
      e.sender_email,
      r.original_top_intent,
      r.new_top_intent,
      r.original_confidence,
      r.new_confidence,
      (r.ranked_intents->0->>'reasoning') AS new_top_reasoning
    FROM public.stage_3_retro_runs r
    JOIN email_pipeline.emails e ON e.id = r.email_id
    WHERE r.run_id = '<RUN_ID>'
      AND r.original_top_intent IS DISTINCT FROM r.new_top_intent
    ORDER BY random()
    LIMIT 20;
    ```

    For each row, operator records one of: `correctly_reclassified`, `incorrectly_reclassified`, `ambiguous`. Notes column for tricky calls. Save as a table in section 3 of the report (next task).

    Acceptance: ≥14/20 rows = `correctly_reclassified` → meets SC-4 (≥70%).
  </how-to-verify>
  <resume-signal>Type "grading done: correct=<n>, incorrect=<n>, ambiguous=<n>" when complete.</resume-signal>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: [BLOCKING] Author 87-BASELINE-REPORT.md</name>
  <what-built>Full retro run + 20-row hand-grading complete.</what-built>
  <how-to-verify>
    Operator writes `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-BASELINE-REPORT.md` with the four D-04 sections. Use the SQL templates below to populate each section.

    ### Section 1 — Distribution shift table

    Post-v8.1 (this run):
    ```sql
    SELECT new_top_intent, count(*) AS post_v8_1
    FROM public.stage_3_retro_runs
    WHERE run_id = '<RUN_ID>'
    GROUP BY new_top_intent ORDER BY count(*) DESC;
    ```

    Pre-v8.1 (live distribution, with Phase 84 noise-survivor filter applied — Pitfall 1):
    ```sql
    SELECT decision AS pre_v8_1_intent, count(*) AS pre_v8_1
    FROM pipeline_events
    WHERE swarm_type = 'debtor-email'
      AND stage = 3
      AND created_at >= '<since>'::timestamptz
      AND created_at <  '<until>'::timestamptz
      -- Pitfall 1: exclude rows that would have hit Phase 84 Stage 1 noise rules today
      AND email_id NOT IN (
        SELECT email_id FROM public.swarm_noise_decisions
        WHERE swarm_type = 'debtor-email' AND category_key IN (
          'coupa-po', 'auto-reply', 'own-domain-loopback',
          'iss-ptp-autoreply', 'm365-quarantine', 'frieslandcampina-portal',
          'farmplus-bank-change', 'phishing-notice', 'fyi-broadcast'
        )
      )
    GROUP BY decision ORDER BY count(*) DESC;
    ```

    Build a markdown table:
    | intent | pre_v8_1 | post_v8_1 | Δ | %Δ |

    Footnote: "Pre-v8.1 counts filtered to the Phase 84 Stage 1 noise-survivor predicate to keep the comparison apples-to-apples."

    ### Section 2 — Open-set proposal summary

    ```sql
    SELECT centroid_label, member_count, sample_email_ids
    FROM public.intent_proposal_clusters
    WHERE swarm_type = 'debtor-email'
      AND window_end::date BETWEEN '<since>'::date AND '<until>'::date
    ORDER BY member_count DESC
    LIMIT 10;
    ```

    Render as a markdown table. Note SC-3: ≥5 clusters required.

    ### Section 3 — 20-row hand-graded diff sample

    Paste the 20 rows from Task 2 as a markdown table with columns: email_id (short hash), subject (truncated 60 chars), sender_email, original_top_intent, new_top_intent, grade, notes.

    Below the table, summarise:
    - Correctly reclassified: N/20
    - Incorrectly reclassified: N/20
    - Ambiguous: N/20
    - Precision = correct / (correct + incorrect) — SC-4 threshold ≥ 70%.

    ### Section 4 — Hypotheses confirmed/refuted

    Checklist:
    - [ ] **SC-1 (Phase 83 D-07): ≥50% catch-all rows reclassify away from `general_inquiry`/`other`.** Query:
      ```sql
      SELECT
        count(*) FILTER (WHERE original_top_intent IN ('general_inquiry','other')
                          AND new_top_intent NOT IN ('general_inquiry','other'))::float
        / NULLIF(count(*) FILTER (WHERE original_top_intent IN ('general_inquiry','other')), 0)
        AS catch_all_reclass_share
      FROM public.stage_3_retro_runs WHERE run_id = '<RUN_ID>';
      ```
      Record share. Pass if ≥0.50.
    - [ ] **SC-2: Coupa-PO + auto-reply + own-domain-loopback absent from Stage 3.** Query:
      ```sql
      SELECT count(*) FROM public.stage_3_retro_runs r
      JOIN email_pipeline.emails e ON e.id = r.email_id
      WHERE r.run_id = '<RUN_ID>'
        AND (e.sender_email ILIKE '%@coupahost.com%'
             OR e.sender_email ILIKE 'noreply@%'
             OR split_part(e.sender_email, '@', 2) IN (SELECT unnest(tenant_domains) FROM public.swarms WHERE swarm_type='debtor-email'));
      ```
      Pass if count = 0 (or near-0 with operator-acceptable explanation).
    - [ ] **SC-3: ≥5 proposal clusters captured in the window.** From section 2.
    - [ ] **SC-4: Hand-graded precision ≥ 70%.** From section 3.

    Close with a one-paragraph narrative: did v8.1's thesis ("observe → understand → THEN automate") hold up? Pass or fail per phase. If any SC missed, explicit follow-up phase recommendation (e.g. "prompt v3.1 needed for credit_request boundary" or "Phase 84 missed one auto-reply pattern: <X>").

    Append: total_tokens (D-03), total Orq cost estimate (rough — use Sonnet 4.5 pricing × total_tokens).
  </how-to-verify>
  <resume-signal>Type "report ready for review" once `87-BASELINE-REPORT.md` exists with all 4 sections populated.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Report content | Operator-authored Markdown; no executable code paths |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-87-Report | I (Info Disclosure) | Sender email addresses in section 3 hand-graded table | accept | Internal repo, .planning/ tree; same trust scope as other phase docs (which already reference operator/sender emails). |
</threat_model>

<verification>
`87-BASELINE-REPORT.md` exists with all 4 sections; SC checklist filled; total_tokens recorded.
</verification>

<success_criteria>
- [ ] Full 5000-email retro run completed; run_id recorded
- [ ] Hand-grading completed (20 rows)
- [ ] `87-BASELINE-REPORT.md` exists with sections 1-4
- [ ] SC-1 / SC-2 / SC-3 / SC-4 checklist filled with pass/fail and supporting numbers
- [ ] Pitfall 1 footnote present (noise-survivor filter applied to pre-v8.1 sample)
- [ ] Total token usage reported (D-03)
</success_criteria>

<output>
Create `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-05-SUMMARY.md` referencing the BASELINE-REPORT.md. v8.1 milestone closure runs `/gsd-audit-milestone v8.1` AFTER this plan closes (SC-6 — out of scope here).
</output>

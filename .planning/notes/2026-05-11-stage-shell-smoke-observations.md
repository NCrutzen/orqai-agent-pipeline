# Stage shell smoke observations — 2026-05-11

**Context:** Post Phase 82.1 + the `8ee2cce` follow-up commit (detail-pane → 460px, row strip → fixed CSS grid).

**Scope:** Click through `/stage-0` … `/stage-4` and note anything that looks off. **Do not debug here** — this is a dumping ground. Triage later into (a) real bugs → new debug phase, (b) design tweaks → next polish phase, (c) intentional differences → close out.

---

## Open question already raised

- **Stage 3 "approve" placement:** appears below the list, unlike Stage 2 — is that intentional or a layout bug?

---

## Stage 0 — Safety

- **Stage 0 is currently empty.** Every incoming email passes through Stage 0,
  so the list should show *all* incoming emails — not only halted ones.
- Suggested model: halted/blocked emails prioritized at the top, but the full
  inbox is visible underneath so the user can manually flag emails that
  contain prompt-injection but slipped through.
- **DISCUSS:** does "Stage 0 shows everything that hit the pipe" conflict
  with the v8.0 funnel model (where each stage owns its own rows)? RFC says
  hard-separation between `swarm_noise_categories` (Stage 1) and
  `swarm_intents` (Stage 3); Stage 0 isn't bound to either registry. Could
  be a *view* layer that windows over all `email_pipeline.emails` rows for
  the swarm, with safety verdicts overlaid.

## Stage 1 — Category (Noise)

- Currently shows 231 rows total (All), 11 payment_admittance, 18 auto_reply,
  0 OOO temp / OOO perm, 116 skip-label-only, plus pending promotion bucket.
- **Open question:** does Stage 1 list *all* emails or only the
  non-auto-handled ones? If auto-handled emails are hidden, user wants them
  visible too — possibly as a new `auto_handled` label so they can be
  reviewed for false positives.
- **DISCUSS:** add `auto_handled` as a chip / label on Stage 1?
- **Data quality flag:** many rows show sender = "Planning" and subject =
  "Automatisch antwoord" with no email address visible. Either:
  - sender_name is being populated with the calendar name "Planning"
    instead of a real sender (display bug), or
  - the ingest is mislabeling these rows (data bug).
  → Confirm against `email_pipeline.emails` raw row (`sender_name`,
  `from_email`, `source_id`) before deciding which layer to fix.

## Stage 2 — Customer

- Currently empty (user not sure if anything ran or if rows are filtered out).
- **Same principle as Stage 0:** want to see *all* incoming records, not
  only the ones at the Stage 2 boundary. Per-row UX should show:
  - which customer the record got mapped to
  - feedback on the mapping (confidence, why)
  - the iController screenshots taken when the customer account was
    resolved/set
- **DISCUSS:** Stage 2 backend wiring status — page.tsx comment says
  "awaits backend wiring in a follow-up phase" (Phase 77 per CONTEXT.md).
  Is this expected-empty until then?

## Stage 3 — Intent

- Approve action appears below the list (not beside, like Stage 2) —
  verify intentional?
- Most rows show `(unknown sender)` / `(no subject)` — same data quality
  flag as Stage 1 "Planning" rows. Confirm whether row mapper is dropping
  `from_name` / `subject` somewhere or whether these are genuinely
  missing-metadata emails.

## Stage 4 — Handler
<!-- dump observations here -->

---

## Backend / pipeline observations (added 2026-05-12)

- **Stage 2 `triggered_by` label leakage** — 5 rows seen on 2026-05-11/12 with `triggered_by='stage-0/safety-worker'` but `result` shape clearly belongs to Stage 2 customer-mapping (`method`, `customer_name`, `customer_account_id`, `dry_run: true`). Some Stage 2 writer is using the wrong `triggered_by` literal. Surfaced during Stage 0 placeholder-fix verify (commit `cf317b4`); pre-existing, not caused by the fix. Sample id: `8b3e26f1-8057-4cd0-8ce8-53a65cfea2d0`.

## Cross-stage / shell-level

### Per-stage details popup with screenshots (FEATURE REQUEST)

For emails that got auto-handled, user wants to be able to drill into the
details of what each stage did — including screenshots taken by the browser
automation. Proposed UX: click any cell of the 5-cell PipelineFlow in the
detail pane → popup with that stage's full reasoning + any screenshots
captured (e.g., iController deletion screenshots).

Concrete examples:
- Stage 1: which regex matched, LLM 2nd-pass JSON output, decision trace.
- Stage 2: customer-mapping screenshots from iController (account lookup,
  account set).
- Stage 4 (handlers): label-resolver browserless screenshots, invoice-copy
  S3 fetch screenshots.

Currently: screenshots are written to
`web/lib/automations/{name}/screenshots/` per CLAUDE.md, but there's no UI
surface that exposes them per-row.

### "All emails" cross-stage view

Pattern emerging: Stages 0, 1, 2 all benefit from a view that lists
*every* incoming email in the swarm window, with the stage-specific
verdicts overlaid as columns/badges — rather than narrow per-stage
buckets. Worth discussing whether the v8.0 5-tab UI should be augmented
by a "Pipeline timeline" master view that operators can switch to.

---

## Triage (fill in later)

| # | Observation | Type (bug / design / intentional) | Action |
|---|---|---|---|
|   |             |                                   |        |

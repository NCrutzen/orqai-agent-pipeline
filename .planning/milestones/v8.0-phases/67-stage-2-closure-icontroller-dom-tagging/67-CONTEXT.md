# Phase 67: Stage 2 closure (iController DOM tagging) — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** `--auto` (Claude selected recommended option for each gray area; user can revise before plan-phase)

<domain>
## Phase Boundary

When the Stage 2 label-resolver matches a customer **in live mode** (`labeling_settings.dry_run = false`), automatically tag the email under that customer account in iController via Browserless DOM automation. The tagging step runs **non-blocking** alongside the canonical `debtor-email/coordinator.requested` emit so Stage 3+4 are unaffected by tagging latency or failure.

In scope (TAG-01..03):

1. **TAG-01:** Live-mode matched-customer email automatically receives an iController account tag with no operator action.
2. **TAG-02:** Tagging failures surface as a deferred run flag on `email_labels` and do NOT break Stage 3 + Stage 4 execution for that email.
3. **TAG-03:** Operator can audit tagging actions in `email_labels` (existing) plus before/after screenshots stored on the row.

Out of scope (explicitly deferred):

- **Stage 1 worker** (`classifier/screen.requested`) — unwired in `route.ts` per Phase 66 deferred follow-up. Phase 67 still works synthetic-emit-style (label-resolver fires its events independently of Stage 1 wiring).
- **`swarm_intents` registry generalisation** — Phase 68 (SWRM-*).
- **Cross-swarm canonical handler input shape** — Phase 69 (CANO-*).
- **`pipeline_events` runtime telemetry** — Phase 70 (TELE-*).
- **Bulk Review override UX for tagging decisions** — Phase 71 (LERN-*) handles override surfaces.
- **iController API integration** — there is no iController API per `probe-label-ui.ts` notes; Browserless DOM is the only path. Not deferred — permanently out of scope.
- **Generalising the iController side-effect into `swarms.side_effects[]` jsonb** — Phase 68 absorbs that pattern. Phase 67 hard-codes the tagging dispatch in the label-resolver; Phase 68 makes it data-driven.

</domain>

<decisions>
## Implementation Decisions

### Side-effect dispatch topology (TAG-01, TAG-02)

- **D-01: New Inngest event `debtor-email/icontroller-tag.requested`** emitted by `classifier-label-resolver.ts` immediately after the `email_labels` INSERT, in parallel with the `debtor-email/coordinator.requested` emit (Phase 66 D-03). [auto: recommended]
  - Emitter: `classifier-label-resolver` only; gated on `result.customer_account_id !== null` AND `settingsRow.dry_run === false`.
  - Subscriber: NEW `debtor-email-icontroller-tagger` Inngest function in `web/lib/inngest/functions/`.
  - Reason: Inngest fan-out gives true non-blocking semantics — the coordinator emit and the tagger emit happen in the same `step.run("emit-coordinator", ...)` parent context but execute as independent function runs. A tagger failure surfaces as a failed Inngest run on the new function id; it cannot back-pressure the coordinator. Matches the same fan-out shape Phase 65 used for orchestrator handlers.
  - Reason against piggybacking on `debtor-email/coordinator.requested`: would force the coordinator to either run the browserless step inline (blocking) or re-fan-out a second event (extra hop, harder to reason about). Cleaner to dispatch from the only function that knows the resolver outcome.
  - Reason against an inline `step.run` inside label-resolver: ties the label-resolver function's success to Browserless availability; a Browserless outage would mark every label-resolver run as failed even though Stage 3 ran fine. Separate function = independent failure domain.

- **D-02: Event data shape (add to `web/lib/inngest/events.ts`):**
  ```ts
  "debtor-email/icontroller-tag.requested": {
    data: {
      email_label_id: string;          // PK on debtor.email_labels — the row to update
      email_id: string;                // for cross-reference + dedup
      customer_account_id: string;     // resolver output
      customer_name: string | null;
      source_mailbox: string;
      icontroller_message_url: string; // pre-resolved by label-resolver (see D-04)
      icontroller_company: string | null; // from labeling_settings
      automation_run_id: string;       // observability link
    };
  }
  ```

- **D-03: New Inngest function `debtorEmailIcontrollerTagger`** at `web/lib/inngest/functions/debtor-email-icontroller-tagger.ts`:
  - Subscribes to `debtor-email/icontroller-tag.requested`.
  - `retries: 1` (Browserless is flaky; one retry is the right balance — too many means a stuck-on-the-page run amplifies cost).
  - `concurrency: { key: "event.data.source_mailbox", limit: 2 }` — prevents thundering-herd on iController for any single mailbox while allowing parallelism across mailboxes.
  - Inside `step.run("invoke-tagger")`: call `labelEmailInIcontroller({ icontroller_message_url, customer_account_id, customer_name, source_mailbox })` (existing module — `web/lib/automations/debtor-email/label-email-in-icontroller.ts`).
  - On success: UPDATE `debtor.email_labels` row (matched by `email_label_id`) with `screenshot_before_url`, `screenshot_after_url`, `labeled_at = now()`, `status` left as-is (already 'completed' per Phase 66 — see D-09 for why).
  - On failure: UPDATE the same row with `error = '<message>'`, `status = 'failed'` (TAG-02 deferred run flag — see D-08), screenshots if any.
  - Replay-safe `inngest.send` pattern from CLAUDE.md (no destructure).

### Pre-resolved URL construction (D-04)

- **D-04: Construct `icontroller_message_url` in `classifier-label-resolver.ts`** at the moment of dispatch, NOT inside the tagger.
  - Reason: `labeling_settings.icontroller_company` is the iController tenant; `email.internet_message_id` (or a derived id) addresses the message. The URL pattern is `/messages/show?msg=<id>` per probe-label-ui.ts comments. The label-resolver already loads both the email row and the settings row — it has all the data. Forcing the tagger to re-load this would cost two extra Supabase queries per tag.
  - Plan task: a small `buildIcontrollerMessageUrl(settingsRow, emailRow)` helper in `web/lib/automations/icontroller/url.ts`. Tested in isolation. If `icontroller_company` is null, the dispatch is skipped (logged as `tagging_unconfigured` on the email_labels row).

### Selectors / probe artifact completion (Phase 56-00 carryover)

- **D-05: Run the probe + commit selectors as Wave 0 of Phase 67.** Operator runs `ICONTROLLER_ENV=acceptance pnpm tsx web/lib/automations/debtor-email/probe-label-ui.ts` against the acceptance iController (per CLAUDE.md test-first pattern), captures `.planning/briefs/artifacts/debtor-email-label-probe/selectors.json`, then commits the selectors directly into `label-email-in-icontroller.ts` (replacing the `TODO(probe-artifact)` blocks).
  - Acceptance environment first; production verification via the same run after the acceptance pass.
  - Reason: blocks all downstream tagger work. Without selectors, `labelEmailInIcontroller` throws (per the existing module's TODO contract). Wave 0 is the right home — sequential, blocking gate.
  - The probe is read-only by design (typeahead reverts before close per probe-label-ui.ts header). No production side effects.

### Failure surface / TAG-02 deferred run flag

- **D-06: Browserless errors do NOT bubble out of the tagger** — the tagger catches every error inside `step.run`, captures the error message + a failure screenshot if possible, UPDATEs `email_labels.status='failed'` + `error='<message>'`, and returns `ok: true`. The Inngest run shows green; the deferred state lives entirely in the data row.
  - Reason: Inngest retry logic for browserless is poorly behaved (a stuck page can chew through all retries before the actual fix lands). Catching at the application layer + surfacing via `email_labels.status` puts the recovery path in operator hands (Bulk Review re-trigger), not Inngest's retry queue. Matches the pattern Phase 56 already uses for the cleanup-shard-worker.
  - Exception: if `step.run` itself throws (Inngest infrastructure error), the function does enter retry. Set `retries: 1` to bound it.

- **D-07: New `email_labels.icontroller_tag_status` column** to distinguish "label-resolver succeeded" from "iController tagging succeeded" — both currently share `status`.
  - Values: `'pending' | 'tagged' | 'skipped_dry_run' | 'skipped_unconfigured' | 'failed'`.
  - Default: `'pending'` on the initial label-resolver INSERT.
  - The tagger UPDATEs to `'tagged'` or `'failed'` on completion.
  - **Migration required.** `supabase/migrations/20260504_email_labels_tagging_columns.sql`: add column + index on `icontroller_tag_status`.
  - Reason: re-using `email_labels.status` for two orthogonal states (resolver outcome + tagging outcome) muddies the Bulk Review UI and makes the deferred-run query ("show me everything that needs operator attention") ambiguous. Separate column = separate concern.

- **D-08: Bulk Review surfaces `icontroller_tag_status='failed'` as a deferred-run badge.** The existing Bulk Review query already filters by `email_labels.status` — extend the query in `web/app/(dashboard)/automations/debtor-email/bulk-review/...` to JOIN/UNION on `icontroller_tag_status` so failed tags show up alongside resolver-failed runs. Plan task: identify the exact query file and add the predicate.

### Live-mode gate (TAG-01)

- **D-09: The live-mode trigger is `labeling_settings.dry_run === false`.** Already loaded by `classifier-label-resolver.ts` line 64. The tag dispatch reuses this exact flag — no new mode toggle.
  - Reason: there is exactly one source of truth for mode (`labeling_settings`). Adding a parallel toggle (e.g., `labeling_settings.tag_in_icontroller`) is technically more granular but operationally confusing — operators flip dry_run when they want side effects to run; that's the right gate.
  - Per-mailbox: yes, dry_run is per-mailbox already, so smeba can be live while berki stays dry-run.

- **D-10: Status mapping after tagging dispatch:**
  - matched + dry_run → `email_labels.status='predicted'`, `icontroller_tag_status='skipped_dry_run'` (no tag dispatched)
  - matched + live + tag dispatched → `status='completed'`, `icontroller_tag_status='pending'` initially → tagger updates to `'tagged'` on success or `'failed'` on browserless error
  - matched + live + `icontroller_company` null → `status='completed'`, `icontroller_tag_status='skipped_unconfigured'`
  - unresolved → `status='predicted'`, `icontroller_tag_status` stays default `'pending'` (irrelevant — no tag because no customer match)

### Idempotency (TAG-01 spillover)

- **D-11: `labelEmailInIcontroller` already implements idempotency via `readCurrentLabel(page)` (line ~58-65). Phase 67 inherits this.** If the page already shows the target customer_account_id, the function returns `'already_labeled'` without writing. The tagger maps `'already_labeled'` to `icontroller_tag_status='tagged'` (terminal happy state, indistinguishable from a fresh tag).
  - Plan note: re-trigger from Bulk Review must use this idempotency check — operators should be able to retry a `failed` tag without worrying about double-tagging.

### Screenshot storage (TAG-03)

- **D-12: Screenshots use the existing `captureScreenshot` helper** which already returns a public Supabase Storage URL (per Phase 56 pattern). The tagger writes both `screenshot_before_url` and `screenshot_after_url` to `email_labels` (columns already exist — verified in earlier grep).
  - Bucket: same as Phase 56's labeling bucket — keep one bucket per swarm.
  - Retention: same as existing — no change.
  - Failure path: if the browserless session can't even reach the page (e.g., iController auth dies), `screenshot_before_url` may be null; `screenshot_after_url` likely also null. Tagger logs the error but does not block on screenshot capture.

### Cutover sequencing

- **D-13: Single PR; behind a per-mailbox `dry_run` flag the operator already controls.** No global feature flag. Acceptance verification covers the dispatch + tagger logic; production verification happens when the operator flips `labeling_settings.dry_run=false` for the first mailbox.
  - First production mailbox: smeba (primary debtor mailbox per CLAUDE.md). Test on a few real matched-customer emails before rolling to other entities.
  - Rollback: flip `dry_run` back to true. The dispatch gate stops firing. No code revert needed.

### Claude's Discretion

- Helper module path for `buildIcontrollerMessageUrl` (`web/lib/automations/icontroller/url.ts` vs colocated under `debtor-email/`): planner picks; my recommendation is the cross-cutting `icontroller/` location since it'll be reused by the cleanup workers.
- Exact Bulk Review SQL/query change to surface `icontroller_tag_status='failed'`: planner picks based on the existing query shape.
- Tagger Inngest function id naming: `automations/debtor-email-icontroller-tagger` (recommended for consistency with `debtor-email-icontroller-cleanup-*`).
- Whether to add a typed `IcontrollerTagStatus` to `web/lib/inngest/events.ts` types or inline the string union: planner picks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 67 architecture inputs
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel; defines Stage 2 boundary.
- `docs/agentic-pipeline/stage-2-entity.md` — Stage 2 contract; tagging is a Stage 2 *side-effect*, not a new stage.
- `docs/agentic-pipeline/graduated-automation.md` — graduated-automation hook model (relevant: tagging is the side-effect that flips on when an entity goes live).
- `docs/debtor-email-pipeline-architecture.md` — debtor-email implementation map; iController tagging slots into Stage 2's `categorize_archive` flow generalisation.
- `docs/browserless-patterns.md` — Browserless conventions (shadow DOM, no networkidle, screenshot-before-close).

### Phase 56 carryover (foundation modules — partially built)
- `web/lib/automations/debtor-email/label-email-in-icontroller.ts` — Browserless module skeleton with TODO selectors. Phase 67 fills these in (D-05).
- `web/lib/automations/debtor-email/probe-label-ui.ts` — read-only DOM probe; run as Wave 0.
- `web/lib/automations/icontroller/session.ts` — shared Browserless session helper.
- `.planning/briefs/artifacts/debtor-email-label-probe/` — probe output landing zone (selectors.json, candidates.json).

### Phase 66 outputs (Phase 67's direct upstream)
- `.planning/phases/66-pipeline-consolidation-retire-triage-path/66-CONTEXT.md` — D-03 Option A wiring; the `debtor-email/coordinator.requested` event is the sibling event Phase 67's `debtor-email/icontroller-tag.requested` runs alongside.
- `.planning/phases/66-pipeline-consolidation-retire-triage-path/66-RESEARCH.md` § Trigger Wiring Recommendation — same data shape conventions Phase 67 follows.
- `web/lib/inngest/functions/classifier-label-resolver.ts` — the function Phase 67 modifies to add the second emit. Phase 66 added the coordinator emit at line ~184; Phase 67 adds the tagger emit alongside.
- `web/lib/inngest/events.ts` — the event catalogue; Phase 67 adds `debtor-email/icontroller-tag.requested`.

### Inngest patterns (CLAUDE.md learnings)
- `step.run` wrapping for non-deterministic ids — Phase 65 commit `dd2583a`.
- No destructured `inngest.send` — Phase 65 commit `dae6276`.
- Concurrency keys per-event-data field (e.g., `entity`, `source_mailbox`).

### Project-level invariants
- `CLAUDE.md` — Browserless via `playwright-core` (NOT `playwright`); shadow-DOM via `.evaluate()`; SPA navigation `waitUntil: 'domcontentloaded'`; screenshots before `browser.close()`; 2FA pattern (not relevant for iController).
- `.planning/REQUIREMENTS.md` §TAG-01..03 — the three acceptance bullets.
- `.planning/ROADMAP.md` Phase 67 entry (line 746).

### Files Phase 67 will modify (research input)
- `web/lib/inngest/events.ts` — add `debtor-email/icontroller-tag.requested` event.
- `web/lib/inngest/functions/classifier-label-resolver.ts` — add the second `step.run("emit-tagger", ...)` after the existing coordinator emit.
- `web/lib/inngest/functions/debtor-email-icontroller-tagger.ts` — NEW Inngest function.
- `web/lib/automations/debtor-email/label-email-in-icontroller.ts` — fill in TODO selectors from probe artifact.
- `web/lib/automations/icontroller/url.ts` — NEW helper.
- `web/app/api/inngest/route.ts` — register the new tagger function.
- `supabase/migrations/20260504_email_labels_tagging_columns.sql` — NEW migration.
- `web/app/(dashboard)/automations/debtor-email/bulk-review/...` — extend deferred-run query (planner identifies the file).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`labelEmailInIcontroller`** (`label-email-in-icontroller.ts`) — Browserless module already implements: `LabelEmailStatus` union, idempotency via `readCurrentLabel`, screenshot capture, ENV-aware (`acceptance` vs `production`). Phase 67 fills selector TODOs and wires it from a new Inngest function.
- **`openIControllerSession` / `closeIControllerSession`** (`web/lib/automations/icontroller/session.ts`) — shared session helper used by cleanup workers + label module. Reuse — do not create a new session per call.
- **`captureScreenshot`** (`@/lib/browser`) — uploads to Supabase Storage and returns a public URL. Same helper Phase 56 uses.
- **`labeling_settings` table** — already has `dry_run`, `nxt_database`, `brand_id`, `entity`, `icontroller_company`. No schema change needed for the live-mode gate.
- **`debtor.email_labels`** — already has `screenshot_before_url`, `screenshot_after_url`, `labeled_at`, `status`, `error`, `customer_account_id`, `customer_name`. Only one new column needed (`icontroller_tag_status`).

### Established Patterns
- **Inngest function naming**: `automations/<name>` id, file `<name>.ts`, exported const `<camelName>` — Phase 67's tagger follows this exactly.
- **Event naming**: `debtor-email/<intent>.requested` for handler invocations, `debtor-email/<noun>.<verb>` for side-effect dispatches. The `icontroller-tag.requested` form matches the latter.
- **Browserless via `playwright-core`** — never `playwright`. The label module already imports correctly.
- **Replay-safe non-deterministic ids** — wrap `crypto.randomUUID()`, `Date.now()`, etc. in `step.run` (Phase 65 dd2583a).
- **Screenshot-before-close** — never close the page before capturing the artifact (CLAUDE.md, repeated in Phase 56 patterns).

### Integration Points
- `classifier-label-resolver.ts` line ~184 (Phase 66's emit-coordinator step) — Phase 67 adds a sibling `step.run("emit-icontroller-tag", ...)` immediately before/after.
- `web/app/api/inngest/route.ts` — single registration site; one new line for the tagger.
- `email_labels` row update — same admin client + same row addressed by primary key.
- Bulk Review query — TBD location; planner identifies and extends.

</code_context>

<specifics>
## Specific Ideas

- **Acceptance environment first.** Run the probe + selectors against acceptance iController, verify the full dispatch → tag → screenshot loop end-to-end on an acceptance email, THEN flip a single mailbox (smeba) to production live mode and re-verify on real production data. Same pattern Phase 56 used.
- **No new feature flag.** `labeling_settings.dry_run` already controls side-effect dispatch per mailbox; Phase 67 piggybacks on it.
- **Screenshots are observability, not gates.** A run with `icontroller_tag_status='tagged'` but null `screenshot_after_url` (e.g., the page closed before capture) is still a successful tag. Operators view the screenshots when investigating; the absence of one is logged but not blocking.
- **No retry on operator-trigger.** Bulk Review's "retry tagging" button (if added — Claude's Discretion / Phase 71 scope) re-emits `debtor-email/icontroller-tag.requested` for the same `email_label_id`. Idempotency handles double-fires.

</specifics>

<deferred>
## Deferred Ideas

- **Stage 1 worker for `classifier/screen.requested`** → already deferred by Phase 66; not Phase 67's concern.
- **`swarms.side_effects[]` jsonb generalisation** → Phase 68 (SWRM-*) — converts the hard-coded tag dispatch into a registry-driven pattern.
- **Cross-swarm canonical handler input shape** → Phase 69 (CANO-*).
- **`pipeline_events` runtime telemetry** → Phase 70 (TELE-*) — adds the cross-stage trace ledger.
- **Bulk Review "retry tagging" button** → Phase 71 (LERN-*) — operator override surfaces.
- **iController API integration** — permanently out of scope; no such API exists.
- **Screenshot retention policy** — current bucket-default retention applies; revisit if storage cost becomes material.

</deferred>

---

*Phase: 67-stage-2-closure-icontroller-dom-tagging*
*Context gathered: 2026-05-04 (auto mode)*

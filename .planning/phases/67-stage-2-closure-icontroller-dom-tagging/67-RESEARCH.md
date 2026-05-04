# Phase 67: Stage 2 closure (iController DOM tagging) — Research

**Researched:** 2026-05-04
**Domain:** Inngest fan-out + Browserless DOM automation against iController + Supabase audit row updates
**Confidence:** HIGH (codebase grounded; probe artifact already committed)

---

## Summary

Phase 67 closes the Stage 2 loop by adding a **second Inngest event emit** in `classifier-label-resolver.ts` (sibling of the Phase 66 coordinator emit) that dispatches a NEW `debtor-email/icontroller-tag.requested` event. A NEW Inngest function `debtorEmailIcontrollerTagger` consumes it, drives the existing-but-skeleton `labelEmailInIcontroller` Browserless module, and writes the result onto `email_labels.icontroller_tag_status` (NEW column).

The good news: most foundation is already in place — Phase 56 left a complete Browserless skeleton, the probe artifact is committed (`SELECTORS.md` 2026-04-29 verified), and the cleanup-worker pattern is the canonical reference for Browserless concurrency / session reuse / row-update error handling. The actual code surface is small: one new Inngest function, one new event, one migration, one helper, one selector-paste, one Bulk Review predicate.

The **bad news / single open question**: the locked CONTEXT (D-04) assumes `icontroller_message_url` can be pre-resolved at dispatch time, but `email_pipeline.emails.id` does NOT carry the iController internal numeric `msg=<id>` needed to construct `/messages/show?msg={msg_id}` directly. The probe shows the only way to obtain `msg_id` is to navigate to `/messages/index/mailbox/{mailbox_id}` and locate the row by sender+subject+received_at — same pattern as `debtor-email-cleanup/browser.ts:findEmailViaSearch`. **The "pre-resolved URL" must be the mailbox-list URL, with row-locating happening inside the tagger** (or label-resolver pre-resolves `msg_id` via a Browserless probe — much heavier). This is a planning decision the planner must make explicit; CONTEXT D-04 likely assumed (incorrectly) the `msg_id` was already known.

**Primary recommendation:** Single new Inngest function file (~200 LOC), one migration adding `icontroller_tag_status` + index, replace the four `TODO(probe-artifact)` blocks in `label-email-in-icontroller.ts` by lifting the `assignAccount` reference implementation from `SELECTORS.md` lines 65-125, and adapt the in-tagger flow to land first on the mailbox-list URL + search (cleanup-worker pattern) when `msg_id` is unknown.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** — Topology: NEW Inngest event `debtor-email/icontroller-tag.requested` emitted from `classifier-label-resolver.ts` parallel to the Phase 66 coordinator emit. NEW function `debtorEmailIcontrollerTagger` subscribes.
- **D-02** — Event data shape: `{ email_label_id, email_id, customer_account_id, customer_name, source_mailbox, icontroller_message_url, icontroller_company, automation_run_id }`.
- **D-03** — Tagger function: `retries: 1`; concurrency `event.data.source_mailbox` limit 2; calls `labelEmailInIcontroller`; UPDATEs `email_labels` row.
- **D-04** — `icontroller_message_url` built in label-resolver via NEW helper `web/lib/automations/icontroller/url.ts`; passed on event payload. **(See Open Question 1 — pre-resolution may not be feasible without prior msg_id storage.)**
- **D-05** — Wave 0 = run probe in acceptance, commit selectors. **NOTE:** the probe artifact is already committed (production-verified 2026-04-29). Wave 0 reduces to (a) re-running the probe in *acceptance* iController to confirm parity, and (b) replacing the `TODO(probe-artifact)` blocks. Most of Wave 0's discovery work is already done.
- **D-06** — Tagger catches all errors inline; Inngest run stays green; failures surface via `email_labels.icontroller_tag_status='failed'` + `error` text.
- **D-07** — NEW column `email_labels.icontroller_tag_status` with values `'pending' | 'tagged' | 'skipped_dry_run' | 'skipped_unconfigured' | 'failed'`. Migration `supabase/migrations/20260504_email_labels_tagging_columns.sql`.
- **D-08** — Bulk Review extends to surface `icontroller_tag_status='failed'` as deferred-run badge. **NOTE:** Bulk Review reads from `automation_runs`, NOT `email_labels` directly — see Bulk Review Surface section.
- **D-09** — Live-mode gate is `labeling_settings.dry_run === false`. No new flag.
- **D-10** — Status mapping: matched+dry_run → `'skipped_dry_run'`; matched+live → `'pending'` then `'tagged'`/`'failed'`; matched+live+null `icontroller_company` → `'skipped_unconfigured'`.
- **D-11** — Idempotency inherited from `labelEmailInIcontroller.readCurrentLabel`.
- **D-12** — Screenshots via existing `captureScreenshot` helper; existing bucket.
- **D-13** — Single PR; per-mailbox `dry_run` is the rollout lever.

### Claude's Discretion

- Helper module path for `buildIcontrollerMessageUrl` (`web/lib/automations/icontroller/url.ts` recommended — cross-cutting).
- Exact Bulk Review query change to surface `icontroller_tag_status='failed'`.
- Tagger Inngest function id naming: `automations/debtor-email-icontroller-tagger`.
- Whether to type `IcontrollerTagStatus` in `events.ts` or inline string union.

### Deferred Ideas (OUT OF SCOPE)

- Stage 1 worker (`classifier/screen.requested`) — Phase 66 carryover, deferred.
- `swarms.side_effects[]` jsonb generalisation — Phase 68.
- Cross-swarm canonical handler input shape — Phase 69.
- `pipeline_events` runtime telemetry — Phase 70.
- Bulk Review "retry tagging" button — Phase 71.
- iController API integration — permanently out of scope (no API exists).
- Screenshot retention policy — current bucket-default applies.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAG-01 | Live-mode matched-customer email auto-tagged in iController | New `debtorEmailIcontrollerTagger` function (D-03) consumes new event emitted from `classifier-label-resolver.ts` (D-01); existing `labelEmailInIcontroller` Browserless module wired in once `TODO(probe-artifact)` blocks are replaced from `SELECTORS.md`. Live-mode gate: `labeling_settings.dry_run === false` (D-09) — already loaded at line 64 of label-resolver. |
| TAG-02 | Tagging non-blocking; failures surface as deferred run | Tagger catches every error inside `step.run` and returns `ok: true` (D-06); failures land on `email_labels.icontroller_tag_status='failed'` + `error` text (D-07). Same pattern as `cleanup-shard-worker` (`debtor-email-icontroller-cleanup-worker.ts`). |
| TAG-03 | Operator audits tagging via `email_labels` + before/after screenshots | Existing columns: `screenshot_before_url`, `screenshot_after_url`, `labeled_at` (added in `20260428_debtor_email_labeling_phase56.sql`). Existing `captureScreenshot` helper writes to Supabase Storage (D-12). |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Emit tagger event from resolver | API/Backend (Inngest) | — | Same code path as Phase 66 coordinator emit; sits inside `classifier-label-resolver.ts` step-flow |
| Construct `icontroller_message_url` | API/Backend (helper) | — | Pure function over `labeling_settings` + email row; lives in `web/lib/automations/icontroller/url.ts` |
| Drive Browserless DOM tagging | Browserless service (via API/Backend Inngest function) | — | Browserless.io is the side-effect tier; `labelEmailInIcontroller` invoked from a dedicated Inngest worker |
| Update `email_labels` row | Database (Supabase) | API/Backend writer | Same admin client used by label-resolver and cleanup-worker |
| Persist screenshots | Storage (Supabase Storage) | — | `captureScreenshot` helper handles upload + URL return |
| Surface failures in Bulk Review | Frontend Server (Next.js RSC) | API/Backend (data loader) | `web/app/(dashboard)/automations/[swarm]/review/page.tsx` is generic; reads `automation_runs`, not `email_labels` directly — see D-08 caveat |
| Live-mode gate | API/Backend (Inngest) | Database (`labeling_settings`) | Per-mailbox flag already loaded by label-resolver |
| Migration | Database (Supabase migration) | — | Single `ALTER TABLE … ADD COLUMN` + index |

---

## Existing Code Inventory (label module + probe + cleanup pattern)

### `web/lib/automations/debtor-email/label-email-in-icontroller.ts` — 132 lines, 4 unresolved TODOs

**What runs end-to-end today (lines 42-83):**
1. `openIControllerSession(ENV)` — works, identical to cleanup-worker session lifecycle.
2. `page.goto(input.icontroller_message_url, { waitUntil: "domcontentloaded" })` — D-18 SPA-safety enforced.
3. `await page.waitForTimeout(1500)` — coarse debounce after detail load.
4. `readCurrentLabel(page)` — **stub** at line 124-131; returns `null` always (TODO).
5. Idempotency branch (line 58-65): if current label matches, return `'already_labeled'` — wired but never reachable until `readCurrentLabel` is implemented.
6. Conflict branch (line 66-77): if current label differs, return `'skipped_conflict'` — same.
7. `captureScreenshot(page, { ... label: "before" })` (line 79-83) — works.

**What throws today (line 88-90):**
```ts
throw new Error("label-DOM selectors pending probe artifact (Wave 1 task 56-03)");
```

**Error path (lines 103-118):** captures screenshot tagged "error", returns `status: "failed"` with `reason` populated. **Critical**: the catch-block tries `captureScreenshot(session.page, ...)` even though `session.page` may have been navigated to a 404; the call is wrapped in a secondary try/catch (line 110-112) so it can't crash the close.

**Cleanup (line 119-121):** `closeIControllerSession(session)` always runs in `finally`.

**TODO inventory** (where the probe artifact must land):

| Location | TODO | What's needed | Source in `SELECTORS.md` |
|----------|------|---------------|--------------------------|
| Line 88-90 | "label-DOM selectors pending probe artifact" — apply path throws | Click `.select2-container.clients`, wait for `.select2-input.select2-focused`, type `customer_account_id`, wait for `ul.select2-results .select2-result-selectable`, validate brand suffix, click highlighted result, wait 800ms, verify | Lines 67-125 (`assignAccount` reference impl) |
| Line 92-102 (commented out) | After-screenshot + labeled-return path | Uncomment after Save-flow inserted | Lines 113-120 |
| Line 124-131 | `readCurrentLabel` returns `null` always | Read `.select2-container.clients` text content; parse `customer_id` prefix from `<id> - <name> (<brand>)` text format; `/none\s+selected/i` → null | `SELECTORS.md` lines 84-91 (idempotency check) |
| (Implicit) | Brand-mismatch defensive layer | Parse `(<brand>)` suffix from highlighted result; bail if doesn't match `MAILBOX_BRAND_PATTERNS` | `SELECTORS.md` lines 142-184 |

The probe artifact also revealed a defensive **brand-mismatch** path that's NOT in the current skeleton — Phase 67 should add a fifth `LabelEmailStatus` value `"brand_mismatch"` (or treat as `failed` with a typed reason).

### `web/lib/automations/debtor-email/probe-label-ui.ts` — 430 lines, read-only diagnostic

**What it produces** (in `.planning/briefs/artifacts/debtor-email-label-probe/`):
- `00-mailbox-list.png` — Smeba inbox screenshot (already exists, 2026-04-29).
- `01-detail-fresh.png`, `02-accounts-picker-open.png`, `03-typeahead-filled.png` — flow proof shots.
- `link-scan.json` — raw page-shape diagnostic (page anchor scan to find `msg=N` patterns).
- `accounts-widget-scan.json` — sibling-walk for Accounts widget detection.
- `candidates.json` — filtered DOM candidates matching `/account|customer|debtor|klant|debiteur/i`.
- `picker-dom.json` — visible inputs + dropdowns once picker opens.
- `dropdown-after-type.json` — typeahead result-list shape (the actual selectable items).
- `selectors.json` — curated final selectors (already shipped: `.select2-container.clients`, `.select2-input.select2-focused`, etc.).
- `SELECTORS.md` — annotated reference impl (production-verified 2026-04-29).
- `PROBE-RESULTS.md` — iter-1 narrative findings.

**Probe is read-only**: types `506909` into typeahead but presses `Escape` twice (lines 398-400) before close. **Safe to re-run against acceptance** for D-05 Wave 0.

**Important**: the probe artifact is already production-grade. Wave 0 of Phase 67 is **not** the heavy discovery work CONTEXT D-05 implies — it's a verification re-run + a copy-paste of the `assignAccount` body from `SELECTORS.md` into `label-email-in-icontroller.ts`. The artifact has been committed since 2026-04-30.

### `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts` — canonical pattern reference

The new tagger should mirror **most** of this shape (172 lines, well-tested in production):

| Aspect | Cleanup-worker | Phase 67 tagger |
|--------|----------------|-----------------|
| Subscribe | `{ event: "icontroller/cleanup.shard.requested" }` | `{ event: "debtor-email/icontroller-tag.requested" }` |
| Function id | `automations/debtor-email-icontroller-shard-worker` | `automations/debtor-email-icontroller-tagger` (recommended) |
| Retries | `0` (Browserless retries cause zombie chains, observed 2026-04-23) | **D-03 says `1`** — diverges from cleanup-worker. Justification: tagger has only one row per event vs cleanup's batch, so retry blast radius is bounded. Acceptable. |
| Concurrency | None at worker level (dispatcher fences with `concurrency:{limit:1}`) | `{ key: "event.data.source_mailbox", limit: 2 }` (D-03) — different topology because tagger is event-driven not cron-driven |
| Browserless lifecycle | `openIControllerSession("production", workerIndex)` → finally `closeIControllerSession` | Same pattern; default `workerIndex=0` since concurrency is per-mailbox not per-worker-shard |
| Stagger start | 1.5s × workerIndex offset (line 80-82) — anti-thundering-herd | Not needed at concurrency=2 per mailbox; can omit |
| Row state machine | Flip to `pending` at start (lines 91-98), then `completed`/`failed` (lines 117-131) | Same: `email_labels.icontroller_tag_status='pending'` already set by label-resolver INSERT, then UPDATE to `'tagged'`/`'failed'` |
| Error path | Inner try/catch around the per-row work; UPDATE row with `error_message` and continue (lines 139-156) | Wrap the `labelEmailInIcontroller` call; UPDATE `email_labels` with `error` + `icontroller_tag_status='failed'`; return `ok: true` |
| Stale emit | `emitAutomationRunStale(admin, "debtor-email-cleanup")` after each row update | Equivalent: `emitAutomationRunStale(admin, "debtor-email-review")` so Bulk Review re-renders |
| `icontroller_company` | Hardcoded `"smebabrandbeveiliging"` constant at line 23 | Use `event.data.icontroller_company` (already on event payload per D-02) — but note this is the Smeba-only sidebar filter, not used in detail-URL navigation |

**Key behavioural notes from cleanup-worker:**
- `findEmailViaSearch` (in `debtor-email-cleanup/browser.ts:54+`) navigates to mailbox-list, searches by sender, matches sender+subject+received_at within ±15s. **This same pattern is what the tagger needs to find `msg_id` from `email_pipeline.emails` data** when `msg_id` is not pre-stored.
- DataTables AJAX gotcha (browser.ts line 76): kick off `page.waitForResponse` BEFORE the `Enter` keypress — otherwise the response is missed.

### `web/lib/automations/icontroller/session.ts` — 127 lines, fully shared

**No pooling**: every call to `openIControllerSession` does a fresh `connectWithSession` against Browserless (line 104). State persists via `saveSession`/Supabase storage between calls; sessions don't share connections across concurrent function runs. **Therefore D-03's `concurrency: { key: source_mailbox, limit: 2 }` is a real Browserless-concurrency cap, not a session-reuse pool risk.** Each tagger run = one Browserless CDP connection. Two parallel runs for the same mailbox → two CDP connections → two cookies stored under the same `sessionKey`; this is the same race the cleanup dispatcher solved by sharding `workerIndex`. **Phase 67 risk**: two parallel taggers for the same mailbox both call `loginIfNeeded` simultaneously and one stomps the other's storage state. Mitigation: pass `workerIndex` derived from a hash, or accept that limit=2 per mailbox is rare enough that occasional cookie-rewrite is harmless (login-if-needed self-heals on next call).

`resolveEnv(env, workerIndex)` (line 40-50) builds session-key with `_<workerIndex>` suffix when index>0. Index 0 uses bare key for backwards compat.

**Production hostname**: `https://walkerfire.icontroller.eu` — hardcoded in `BASE_URLS.production` (line 26). NOT derived from `labeling_settings.icontroller_company`. The `icontroller_company` field is the *sidebar in-app filter name* (e.g. `"smebabrandbeveiliging"`), used by cleanup-worker to scope row-search; it is **not part of the URL**.

---

## URL Construction (D-04 details)

### What CONTEXT D-04 specifies

> Construct `icontroller_message_url` in `classifier-label-resolver.ts` at the moment of dispatch, NOT inside the tagger. The URL pattern is `/messages/show?msg=<id>`. The label-resolver already loads both the email row and the settings row — it has all the data.

### The actual problem

The pattern `/messages/show?msg={msg_id}` uses iController's **internal numeric message id** (verified: probe captured `1372274` from production Smeba inbox). This `msg_id` is **NOT stored anywhere** in the codebase:

- `email_pipeline.emails.id` is a Supabase-generated UUID.
- `email_pipeline.emails.source_id` is the Outlook Graph message id (Zapier-encoded variant).
- `email_pipeline.emails.internet_message_id` is the RFC822 `Message-ID` header.
- `email_pipeline.emails.raw_json` is the Graph payload (per `web/debtor-email-analyzer/src/setup-db.ts` line 22) — it contains Outlook fields, not iController's numeric id.
- `email_labels.icontroller_mailbox_id` is the *mailbox* numeric id (e.g. 4 for Smeba per `mailboxes.ts`), NOT the message numeric id.

**Confirmed in `classifier-label-resolver.ts` line 137:** the resolver writes `icontroller_mailbox_id: 0` with comment `// Wave 3 doesn't drive iController; Phase 56.8 wires the real id.` Even the *mailbox* id is currently zero in new label rows; the *message* id has no source at all.

### Resolution paths the planner must choose

**Option A (recommended) — store mailbox-list URL, search inside tagger:**
- `buildIcontrollerMessageUrl` returns `${BASE_URL}/messages/index/mailbox/{icontroller_mailbox_id}` from `labeling_settings.icontroller_mailbox_id` (or `mailboxes.ts:ICONTROLLER_MAILBOXES[source_mailbox]`).
- Inside the tagger, navigate to that URL, then call a `findMessageRow(page, { sender, subject, received_at })` helper modeled on `cleanup/browser.ts:findEmailViaSearch`, then click into the detail row to land on `/messages/show?msg=<id>`.
- This adds an extra navigation step in the tagger but matches the cleanup-worker's already-proven find-by-search pattern.
- Idempotency check (`readCurrentLabel`) and Select2 typeahead flow run on the detail page after the click.

**Option B — pre-fetch `msg_id` via separate Browserless probe at ingest time:**
- New ingest-time enrichment that opens iController, finds the message by sender+subject+received_at, stores `email_labels.icontroller_msg_id`.
- Heavy: every email triggers a Browserless connect even before tagging is needed.
- Defers the tagger but adds latency to ingest. **Not recommended** — Browserless cost amplifies.

**Option C — store `msg_id` on the cleanup-worker's row update:**
- The cleanup-worker already navigates to the detail page. It could capture `msg_id` from the URL after click and persist it.
- Doesn't help Phase 67: the cleanup runs *after* tagging in the architectural flow.

**Recommendation:** Option A. Helper `buildIcontrollerMessageUrl` produces the mailbox-list URL; the tagger does the search-and-click as part of its Browserless step (delete the probe-was-going-to-give-us-msg_id assumption). The CONTEXT field name `icontroller_message_url` then refers to "the URL where the tagger starts its work", not literally the `/show?msg=N` URL. Document this in the helper's JSDoc.

### `labeling_settings` schema (verified from migrations)

Confirmed columns (cumulative from `20260423_debtor_email_labeling.sql:54-58`, `20260423_mailbox_settings_expansion.sql:23-26`, `20260428_debtor_email_labeling_phase56.sql:13`):

| Column | Type | Source migration |
|--------|------|------------------|
| `source_mailbox` | text PK | 20260423 (initial) |
| `dry_run` | boolean default true | 20260423 |
| `updated_at` | timestamptz | 20260423 |
| `updated_by` | text | 20260423 |
| `entity` | text | 20260423b expansion |
| `icontroller_company` | text | 20260423b expansion (e.g. `'smebabrandbeveiliging'`) |
| `brand_id` | text | 20260423b expansion |
| `nxt_database` | text | 20260428 phase56 |

**No** `icontroller_mailbox_id` column on `labeling_settings` (the `email_labels` row has it, but it's currently zero per resolver). For Option A, derive it from `mailboxes.ts:ICONTROLLER_MAILBOXES[source_mailbox]` — already a typed constant covering all 5 mailboxes (Smeba 4, Berki 171, Sicli-Noord 15, Sicli-Sud 16, Smeba-Fire 5).

**Production-vs-acceptance hostname**: `BASE_URLS.production = "https://walkerfire.icontroller.eu"`, `BASE_URLS.acceptance = "https://test-walkerfire-testing.icontroller.billtrust.com"` (`session.ts:24-28`). The `buildIcontrollerMessageUrl` helper should NOT hardcode the host — accept it as a parameter or pull from `resolveEnv()` so acceptance ↔ production parity is correct.

### Email → iController message resolution

For Option A's search step, the tagger needs `{ sender_email, subject, received_at }` from the email row. These are already on `email_pipeline.emails` and read by `classifier-label-resolver.ts:43-57`. Add them to the event payload (extending D-02) so the tagger doesn't need a second email lookup:

```ts
"debtor-email/icontroller-tag.requested": {
  data: {
    email_label_id: string;
    email_id: string;
    customer_account_id: string;
    customer_name: string | null;
    source_mailbox: string;
    icontroller_mailbox_id: number;        // from mailboxes.ts (NEW)
    icontroller_company: string | null;
    sender_email: string;                   // for find-by-search (NEW)
    subject: string;                        // for find-by-search (NEW)
    received_at: string;                    // for find-by-search (NEW)
    automation_run_id: string;
  };
}
```

This is a **deviation from CONTEXT D-02** but a necessary one given the URL-construction reality. The planner should call out the deviation in the plan.

---

## Migration Shape (D-07)

### Project conventions (verified from last 5 migrations)

Filename: `YYYYMMDD<letter>_<short_snake_description>.sql` — e.g. `20260501e_agent_runs_coordinator_run_id.sql`. The `<letter>` suffix orders multiple migrations within a day. CONTEXT D-07's filename `20260504_email_labels_tagging_columns.sql` lacks a letter — for consistency use `20260504a_email_labels_icontroller_tag_status.sql` (or first available letter that day).

DDL style: `alter table … add column if not exists`, with `create index if not exists`, idempotent. Examples:

```sql
-- 20260428_debtor_email_labeling_phase56.sql:21-23
alter table debtor.email_labels add column if not exists screenshot_before_url text;
alter table debtor.email_labels add column if not exists screenshot_after_url text;
create index if not exists email_labels_method_idx
  on debtor.email_labels (method, created_at desc);
```

```sql
-- 20260430c_email_labels_feedback_and_invoice_copy.sql — multi-column add with check constraints
alter table debtor.email_labels
  add column if not exists feedback_verdict             text
    check (feedback_verdict in ('approved', 'rejected', 'manual_override')),
  …;
create index if not exists email_labels_feedback_verdict_idx
  on debtor.email_labels (feedback_verdict)
  where feedback_verdict is not null;
```

**No down-migrations** in the project. Rollback is "open a new migration that reverses". Phase 67 follows this convention.

### Recommended migration content

```sql
-- Phase 67 (D-07): separate iController-tagging outcome from resolver outcome.
-- email_labels.status currently mixes both concerns (predicted/completed/failed
-- conflate "resolver decided" with "iController tagged"). New column tracks
-- the side-effect dispatch result independently.

alter table debtor.email_labels
  add column if not exists icontroller_tag_status text
    check (icontroller_tag_status in (
      'pending',                -- default after label-resolver INSERT
      'tagged',                 -- Browserless successfully assigned account
      'skipped_dry_run',        -- matched + dry_run=true (no dispatch)
      'skipped_unconfigured',   -- matched + icontroller_company null (no dispatch)
      'failed'                  -- Browserless threw; see error column
    )) default 'pending';

create index if not exists email_labels_icontroller_tag_status_idx
  on debtor.email_labels (icontroller_tag_status, created_at desc)
  where icontroller_tag_status in ('pending', 'failed');
```

### Lock duration risk

`email_labels` row count check: not run (would need DB credential). Conservative estimate: this table receives one row per inbound debtor email; with ~50-200 inbound emails/day across 5 mailboxes since 2026-04-23 ingest activation, expect under 5,000 rows. **Adding a NOT NULL column with a constant default on a table this size locks for milliseconds, not seconds**, in Postgres 15+ (default-constant ADD COLUMN doesn't rewrite the table — the default is stored in `pg_attribute` and applied virtually until rows are updated). Risk: **negligible**. No `CONCURRENTLY` index needed at this size.

Confidence: HIGH on Postgres semantics. MEDIUM on the row count (estimate). If row count exceeds 100k unexpectedly, the migration still runs in <1s for the ADD COLUMN; only the index could lock briefly — `create index if not exists … where …` with a partial WHERE makes it cheap.

---

## Bulk Review Surface (D-08)

### Critical reframe: Bulk Review reads `automation_runs`, NOT `email_labels`

The Phase 56.7 generic Bulk Review at `web/app/(dashboard)/automations/[swarm]/review/page.tsx` is parameterised by `[swarm]` and queries `automation_runs` exclusively (lines 119-238: `loadPageData`):
- Counts: RPC `classifier_queue_counts(p_swarm_type)`.
- Predicted rows: `automation_runs.status = 'predicted' AND swarm_type = $`.
- Coordinator-runs join (Phase 65): `loadCoordinatorRunsForReview(rowIds)` — bulk join keyed on `automation_run_id`.

**There is NO `email_labels` query in Bulk Review today.** The detail pane (`detail-pane.tsx` lines 67-75 `ResultPayload`) reads from `automation_runs.result` jsonb, which contains `message_id`, `source_mailbox`, `subject`, `from`, etc. — but not the `email_label_id` and not the tagging status.

### What D-08 actually requires

D-08 says "extend the Bulk Review query to surface `icontroller_tag_status='failed'` as a deferred-run badge alongside resolver-failed runs". Two implementation paths:

**Path A — JOIN `email_labels` in the page loader:**
- After loading `automation_runs` rows in `loadPageData`, fetch `email_labels` rows for the same `email_id`s (the `result.email_id` jsonb path, or via the `automation_run_id` if added to email_labels).
- **Problem:** there's no `email_labels.automation_run_id` column today. Currently linkage is via the `automation_runs.result->>email_id` pointing at `email_pipeline.emails.id`, which `email_labels.email_id` also references. So join: `email_labels.email_id = automation_runs.result->>email_id` (jsonb cast).
- Add `icontroller_tag_status` and `screenshot_before_url`/`screenshot_after_url` fields to `PredictedRow`.
- Surface a badge in `row-list.tsx` / `detail-pane.tsx` when status is `'failed'` (analogous to `CoordinatorBadge.tsx`).

**Path B — flip `automation_runs.status='failed'` from the tagger:**
- The tagger UPDATEs the same `automation_runs` row (the one already created by the Stage 0/verdict-worker dispatch and threaded through to the label-resolver) when tagging fails.
- This re-uses the existing `automation_runs.status='failed'` query in Bulk Review with no schema/loader changes.
- **Problem:** D-06 explicitly says the tagger run stays green and failures live entirely on `email_labels`. Path B contradicts D-06 by surfacing failures on `automation_runs`.

**Recommendation:** Path A. Add the JOIN in `loadPageData` (after line 191 / line 171), define a `TaggingFailureSummary` type analogous to `CoordinatorRunSummary`, and render a `<TaggingFailureBadge />` in `row-list.tsx` adjacent to existing badges. The `coordinator_runs` Phase-65 plumbing is a perfect template.

### File pointer

The query lives in **one** function: `loadPageData(params, admin, swarmType)` at `web/app/(dashboard)/automations/[swarm]/review/page.tsx:113-261`. Specifically:
- Insert the JOIN call after line 191 (when `rows` is populated for the non-safety branch), or after line 258 (so it sits next to the coordinator enrichment).
- Pattern: extract a `loadTaggingFailuresForReview(rowIds)` helper into `web/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader.ts` (mirrors `coordinator-runs-loader.ts`).
- Rendering: `_components/TaggingFailureBadge.tsx` mirrors `_components/CoordinatorBadge.tsx`.

The screenshot URLs are not currently rendered anywhere — Phase 56 added the columns (`20260428_debtor_email_labeling_phase56.sql:21-22`) without UI. Phase 67 adds first-render. `detail-pane.tsx` is the right surface — add a "Tagging artifacts" section above or below the existing email body display.

---

## Failure Modes Catalogue

Each failure mode → distinct error message stored in `email_labels.error` for operator triage. Pattern: prefix with a stable code so Bulk Review can render badges without parsing free text.

| Code | Failure mode | When it fires | Recovery action |
|------|--------------|---------------|-----------------|
| `BROWSERLESS_CONNECT_FAIL` | `connectOverCDP` timeout / Browserless quota exhausted | `openIControllerSession` throws | Retry on next operator-triggered re-emit (Phase 71) |
| `ICONTROLLER_AUTH_FAIL` | Stored cookies stale + login form rejects credentials | `loginIfNeeded` fails to navigate past `#login-username` | Operator updates `credentials` row for the iController credentialId |
| `MAILBOX_PAGE_NOT_FOUND` | Navigation to `/messages/index/mailbox/{id}` returns 404 | `page.goto` succeeds but no `#messages-list` | Wrong `icontroller_mailbox_id` for source_mailbox; data fix |
| `MESSAGE_NOT_FOUND_IN_LIST` | Search-by-sender+subject finds zero rows within ±15s window | `findMessageRow` returns -1 (cleanup-worker pattern) | Email already deleted from iController, or arrived with > 15s drift; investigate |
| `DETAIL_PAGE_LOAD_FAIL` | After click, `.select2-container.clients` not present within 8s | `page.waitForSelector` times out | iController DOM drift since 2026-04-29 walkthrough; re-run probe |
| `TYPEAHEAD_NO_RESULTS` | After typing `customer_account_id`, `ul.select2-results .select2-result-selectable` never appears | `page.waitForSelector` times out at 4s | `customer_account_id` doesn't exist in iController's customer index for this brand; data quality issue |
| `BRAND_MISMATCH` | Highlighted result's parenthesized brand suffix doesn't match `MAILBOX_BRAND_PATTERNS[entity]` | Defensive layer per SELECTORS.md lines 142-184 | Resolver returned a customer_id from the wrong brand; investigate `resolveDebtor` for cross-brand contamination |
| `SELECTION_DID_NOT_STICK` | After click + 800ms wait, widget still shows "None selected" | `readCurrentLabel(page)` post-click returns null | Race / iController bug; retry once (D-03 retries:1 covers this) |
| `ALREADY_LABELED_DIFFERENT` | Idempotency check: page shows a *different* customer | `readCurrentLabel` returns non-matching id | `'skipped_conflict'` — operator decides whether to override |
| `SCREENSHOT_FAIL` | `captureScreenshot` returned null / Supabase Storage upload failed | Inner try/catch around screenshot calls | Non-blocking per D-12 specifics; tag still counts as `'tagged'` if widget verified |
| `SESSION_CLOSE_LEAK` | `closeIControllerSession` throws | finally block (already swallowed in session.ts) | Browserless slot frees on TTL; non-fatal |

**Observability tip:** the cleanup-worker writes a structured `processed_by: "inngest-cleanup-cron-w<index>"` field to `automation_runs.result` (line 95). Tagger should write `processed_by: "icontroller-tagger"` to the same nested location (or a similarly-named field on `email_labels`) so timeline reconstruction across cleanup-vs-tagging is feasible.

---

## Migration Risks & Idempotency Race

### Race: two label-resolver runs on the same email_id

Possible (low likelihood) when Inngest retries an upstream verdict-worker run that already INSERTed an `email_labels` row. The resolver doesn't check for an existing row before INSERT (lines 131-153). Two emits → two tagger runs for the same email_id.

`concurrency: { key: source_mailbox, limit: 2 }` allows both to run if they're in different mailboxes (impossible — same email = same mailbox), so they queue. The second run hits the `readCurrentLabel` idempotency check and returns `'already_labeled'`. **Confirmed safe** assuming the iController DOM idempotency works as the probe verified.

### Risk: `customer_account_id` not in typeahead despite resolver match

Possible when the resolver matches via thread-inheritance (a previously-tagged customer in the same conversation) but iController's customer index has since had that account merged or deactivated. Tagger writes `TYPEAHEAD_NO_RESULTS`. Recovery: operator-triggered re-emit after data fix.

### Risk: NOT NULL DEFAULT on large `email_labels`

Discussed above (Migration Shape section). **Negligible** at current row volumes.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (per `web/package.json`) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && pnpm vitest run --reporter=basic <pattern>` |
| Full suite command | `cd web && pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TAG-01 | Label-resolver emits `debtor-email/icontroller-tag.requested` when `customer_account_id !== null && dry_run === false` | unit | `pnpm vitest run web/tests/labeling/classifier-label-resolver.test.ts` | partial — Phase 66 added coordinator-emit assertion; extend |
| TAG-01 | Tagger function calls `labelEmailInIcontroller` with correct payload | unit | `pnpm vitest run web/tests/labeling/debtor-email-icontroller-tagger.test.ts` | ❌ Wave 0 |
| TAG-01 | Tagger UPDATEs `email_labels.icontroller_tag_status='tagged'` on success | unit | (same file) | ❌ Wave 0 |
| TAG-01 | matched+dry_run path writes `icontroller_tag_status='skipped_dry_run'` and emits NO tag event | unit | (label-resolver test) | ❌ Wave 0 |
| TAG-01 | matched+live+null `icontroller_company` writes `'skipped_unconfigured'` | unit | (label-resolver test) | ❌ Wave 0 |
| TAG-02 | Tagger catches Browserless errors, returns `ok:true`, sets `icontroller_tag_status='failed'` + error text | unit | (tagger test) | ❌ Wave 0 |
| TAG-02 | Inngest run remains green when `labelEmailInIcontroller` returns `status:'failed'` | unit | (tagger test) | ❌ Wave 0 |
| TAG-03 | On success, `screenshot_before_url` + `screenshot_after_url` populated on `email_labels` | unit | (tagger test) | ❌ Wave 0 |
| TAG-03 | Bulk Review page loader joins `email_labels` and surfaces `icontroller_tag_status='failed'` | unit | `pnpm vitest run web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` | ❌ Wave 0 |
| TAG-01..03 | End-to-end: emit `debtor-email/icontroller-tag.requested` with acceptance iController data → row tagged → screenshot URL populated | integration (manual smoke on Vercel preview) | manual: `inngest.send` + `select * from debtor.email_labels` | manual-only |
| TAG-01 | Selector grep: `grep -rn "TODO(probe-artifact)" web/lib/automations/debtor-email/label-email-in-icontroller.ts` returns 0 lines | static | `! grep -q "TODO(probe-artifact)" web/lib/automations/debtor-email/label-email-in-icontroller.ts` | shell command |
| TAG-01 | New event registered in events.ts | static | `grep -q "debtor-email/icontroller-tag.requested" web/lib/inngest/events.ts` | shell command |
| TAG-01 | Tagger function exported and registered in route.ts | static | `grep -q "debtorEmailIcontrollerTagger" web/app/api/inngest/route.ts` | shell command |

### Sampling Rate

- **Per task commit:** `cd web && pnpm vitest run web/tests/labeling/ web/lib/automations/debtor-email/__tests__/` (label-resolver + new tagger tests)
- **Per wave merge:** `cd web && pnpm vitest run` (full suite)
- **Phase gate:** Full suite green + manual integration smoke against acceptance iController + first-mailbox production smoke (smeba) confirms `icontroller_tag_status='tagged'` on a real matched-customer email.

### Wave 0 Gaps

- [ ] `web/tests/labeling/debtor-email-icontroller-tagger.test.ts` — covers TAG-01, TAG-02, TAG-03 (tagger-side)
- [ ] Extend `web/tests/labeling/classifier-label-resolver.test.ts` with the second-emit assertion + the three skip-paths
- [ ] `web/app/(dashboard)/automations/[swarm]/review/__tests__/load-page-data.test.ts` test for tagging-failure JOIN (extend existing if file already exists; otherwise create)
- [ ] Re-run `probe-label-ui.ts` against acceptance iController to confirm Select2 selector parity (production was verified 2026-04-29; acceptance not yet)
- [ ] Replace 4 `TODO(probe-artifact)` blocks in `label-email-in-icontroller.ts` from `SELECTORS.md` reference impl

---

## Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | iController DOM has drifted since 2026-04-29 walkthrough → Wave-0 selectors break before first prod use | Medium | Re-run probe in acceptance as first task; if drift detected, rerun in production; freeze selectors only after both pass |
| R2 | First production live-mode flip tags wrong customer due to acceptance-vs-production schema differences (different brand suffix wording, different customer_id format) | High | The brand-mismatch defensive layer (`SELECTORS.md` lines 142-184) catches this — make sure the planner specifies the `MAILBOX_BRAND_PATTERNS` constant + brand-mismatch error path are non-negotiable parts of the label-module fill-in |
| R3 | URL pre-resolution (D-04) infeasible because `msg_id` is unknown → tagger needs to do search-and-click → adds 4-8s to Browserless flow | Medium | Use Option A from URL Construction section: store mailbox-list URL, search inside tagger using cleanup-worker's `findEmailViaSearch` pattern. Plan must call out this deviation from D-04 explicitly. |
| R4 | Two parallel taggers for same mailbox both `loginIfNeeded` and stomp each other's stored cookies | Low | Limit=2 + rare collision means occasional re-login; self-heals. Optional hardening: pass `workerIndex` derived from `email_label_id` hash so each row gets a deterministic but distinct session-key |
| R5 | Migration adds NOT NULL DEFAULT on `email_labels` — table-lock duration | Negligible | Postgres 15 stores constant default in pg_attribute, no row rewrite. <50ms expected. No `CONCURRENTLY` needed. |
| R6 | Idempotency check fails at the DOM level (e.g., Select2 multi-mode chip lookup mis-parses single-customer state) → tagger double-tags or fails to detect already-tagged | Medium | Phase 67 v1 assumes single-account mode; multi-select per `SELECTORS.md` caveat 2 is deferred. Document this in `labelEmailInIcontroller` JSDoc. |
| R7 | Bulk Review surfacing change requires adding a `email_labels` JOIN to a hot page loader → page-render regression | Low | Mirror Phase-65 `coordinator_runs` enrichment pattern (proven shape); guard the JOIN behind `swarmType === 'debtor-email'` |
| R8 | `automation_runs.result->>email_id` JSONB cast for the JOIN is slow at scale | Low | RowList page-size is 100; JOIN is cheap. Add functional index `(result->>email_id)` if profiling shows hotspot. |
| R9 | Tagger run hangs > 60s and Vercel kills it | Medium | route.ts already has `maxDuration = 300`. Browserless `connectOverCDP` timeout 30s + label flow ~10-20s = well under cap. Monitor first 50 prod runs. |
| R10 | Tagger emit + coordinator emit racing → coordinator's downstream handler tries to compose a draft referencing a not-yet-tagged email | Negligible | Tagging is iController-internal cosmetic; handlers don't read `email_labels.icontroller_tag_status`. No coupling. |

---

## Out-of-Scope Confirmations

Confirmed against CONTEXT `<deferred>` and ROADMAP entries — none of these belong in Phase 67:

- ✅ `swarms.side_effects[]` registry generalisation → Phase 68 (SWRM-01..04)
- ✅ Bulk Review "retry tagging" button → Phase 71 (LERN-*)
- ✅ iController API integration → permanently out of scope (no API exists per `probe-label-ui.ts` header notes)
- ✅ Cross-swarm canonical handler input shape → Phase 69 (CANO-01..03)
- ✅ `pipeline_events` runtime telemetry → Phase 70 (TELE-*)
- ✅ New Orq.ai agent or `update_agent` call — not relevant; Phase 67 is pure DOM automation, no LLM
- ✅ `swarm_intents` / multi-handler routing — Phase 68
- ✅ Multi-select Accounts mode (multiple customers per email) — `SELECTORS.md` caveat 2; Phase 67 v1 single-account only
- ✅ Stage 1 worker (`classifier/screen.requested`) — Phase 66 deferred; Phase 67 unaffected (synthetic-emit-style still works)
- ✅ Screenshot retention policy / bucket cleanup — current default applies

---

## Sources

### Primary (HIGH confidence)
- `web/lib/automations/debtor-email/label-email-in-icontroller.ts` (132 lines, fully read) — TODO inventory, error path
- `web/lib/automations/debtor-email/probe-label-ui.ts` (430 lines, fully read) — probe artifact contract
- `web/lib/inngest/functions/classifier-label-resolver.ts` (302 lines, fully read) — emit site, Phase-66 sibling pattern
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher.ts` (104 lines) — concurrency / dispatch pattern
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts` (172 lines) — error/row-update pattern, retries=0 rationale
- `web/lib/automations/icontroller/session.ts` (127 lines) — session lifecycle, `BASE_URLS` hardcoded hostnames
- `web/lib/automations/debtor-email/mailboxes.ts` — `ICONTROLLER_MAILBOXES` const for `source_mailbox` → mailbox_id
- `.planning/briefs/artifacts/debtor-email-label-probe/SELECTORS.md` (203 lines, production-verified 2026-04-29) — Select2 reference impl + brand-mismatch defensive layer
- `.planning/briefs/artifacts/debtor-email-label-probe/selectors.json` — final selector contract
- `supabase/migrations/20260423_debtor_email_labeling.sql` — base `email_labels` schema
- `supabase/migrations/20260428_debtor_email_labeling_phase56.sql` — additive columns (screenshot URLs, customer_account_id)
- `supabase/migrations/20260423_mailbox_settings_expansion.sql` — `labeling_settings.entity` + `icontroller_company`
- `supabase/migrations/20260430c_email_labels_feedback_and_invoice_copy.sql` — recent migration shape reference
- `web/app/(dashboard)/automations/[swarm]/review/page.tsx` (336 lines) — generic Bulk Review loader; reads `automation_runs` not `email_labels`
- `web/app/api/inngest/route.ts` — function registration site
- `web/lib/inngest/events.ts` lines 218-269 — debtor-email event shape conventions
- `web/lib/automations/debtor-email-cleanup/browser.ts` lines 54-100 — `findEmailViaSearch` pattern (the model for tagger's mailbox-list-search step)

### Secondary (MEDIUM confidence)
- `web/debtor-email-analyzer/src/setup-db.ts` — `email_pipeline.emails` schema reference (matches deployed shape but is the side-loaded analyzer's own schema definition; deployed schema may have additional columns not represented here)

### Tertiary (LOW confidence)
- Row count estimate for `email_labels` (used in migration risk assessment) — based on activation date and per-day inbound estimate, not measured. Re-verify if migration timing is critical.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `email_labels` row count is under ~10k → migration ADD COLUMN finishes in <1s | Migration Shape | If row count is 100k+, the index creation might briefly lock; trivial mitigation is `CONCURRENTLY` |
| A2 | `email_pipeline.emails` does NOT have an `icontroller_msg_id` column | URL Construction | If the column exists and is populated by some path I missed, Option A is unnecessary; Option-D (use stored msg_id) becomes correct. Verify by `\d email_pipeline.emails` against staging |
| A3 | Postgres 15+ in production (Supabase default since 2024) → constant DEFAULT does not rewrite table | Migration Shape | Older PG version → migration could be slow. Supabase forces upgrades, very low risk. |
| A4 | The `automation_runs.result->>email_id` jsonb path is consistently set by upstream label-resolver | Bulk Review Surface | If some `automation_runs` rows have null `email_id` in result, the JOIN simply returns nothing for them — graceful degradation, not breakage |
| A5 | Re-running the probe against acceptance iController will produce equivalent Select2 DOM | Risks (R1) | Acceptance host is `test-walkerfire-testing.icontroller.billtrust.com` — Billtrust's test instance. Could be a different iController build version with subtle DOM diffs. Test before assuming. |

---

## Open Questions

1. **`icontroller_message_url` semantics in D-04.** Is the URL meant to be the detail URL (`/messages/show?msg=N`) or the mailbox-list URL (`/messages/index/mailbox/N`)? The data flow strongly suggests the latter (Option A) since `msg_id` is unknown at dispatch time. Planner must lock this and update the helper signature accordingly.
   - What we know: `email_pipeline.emails` has no `icontroller_msg_id`; mailbox-list URL is constructible from `mailboxes.ts` constant.
   - What's unclear: was D-04 written assuming a specific stored field?
   - Recommendation: Option A — pass mailbox-list URL + sender/subject/received_at on event payload; tagger does search-and-click using cleanup-worker's `findEmailViaSearch` reference impl.

2. **Should `email_labels.icontroller_msg_id` be persisted after first tag?** Storing it would let future re-tags / re-emits skip the search step. Phase 67 wouldn't strictly need this, but it's cheap to add as a side-effect.
   - Recommendation: ADD COLUMN `icontroller_msg_id text` in the same migration; tagger writes it whenever it resolves a numeric id from URL. Not used yet; future-proofs.

3. **Tagger fan-out granularity at high mailbox volumes.** With concurrency=2 per mailbox and ~10 inbound emails per minute on Smeba peak, queue depth could spike. Should the tagger fan out further (e.g. concurrency=4) or stay conservative?
   - Recommendation: stay at 2 for v1. iController's tolerance for parallel sessions is unverified. Monitor first 100 production runs and tune if queue depth becomes a problem.

4. **`icontroller_mailbox_id` column on `labeling_settings` vs deriving from `mailboxes.ts`.** Currently the const is the only source. Adding a column is one ALTER more; deriving from const requires a code-path change to read it.
   - Recommendation: derive from const for v1. Add a TODO note that Phase 68's `swarms` registry generalisation is the right home for a per-mailbox mailbox-id column (when the const is removed entirely).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (debtor schema) | Migration + row reads/writes | ✓ | per CLAUDE.md SUPABASE_URL | — |
| Supabase Storage (screenshot bucket) | `captureScreenshot` | ✓ | existing labeling bucket | — |
| Browserless.io | DOM automation | ✓ | production-ams region | — |
| iController (acceptance) | Wave 0 probe re-run + integration tests | ✓ | `test-walkerfire-testing.icontroller.billtrust.com` per session.ts | manual probe artifact already exists from production |
| iController (production) | Final smoke + go-live | ✓ | `walkerfire.icontroller.eu` | — |
| Inngest (Vercel) | Event dispatch + function registration | ✓ | per route.ts maxDuration=300 | — |
| `playwright-core` | Browser scripting | ✓ | per CLAUDE.md (NOT `playwright`) | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Project Constraints (from CLAUDE.md)

- **Browserless via `playwright-core`**, NOT `playwright`. Module already imports correctly; tagger must too.
- **Shadow DOM via `.evaluate()` not `.fill()`** — Select2 is light DOM (jQuery), no shadow boundaries; verified in probe.
- **SPA navigation `waitUntil: 'domcontentloaded'`** never `'networkidle'`. Already enforced at line 53 of label-email module.
- **Screenshots before `browser.close()`** — module's finally pattern enforces this.
- **`step.run` for non-deterministic ids** (Phase 65 commit `dd2583a`) — wrap any UUID/Date.now() generation inside step.run when it becomes a DB key. The tagger emit doesn't generate ids; the email_label_id comes from event.data, so this rule isn't load-bearing for Phase 67. But: any timestamps written to `labeled_at` MUST be inside step.run (existing pattern at line 187 of label-resolver shows `new Date().toISOString()` inside `step.run("close-automation-run", ...)`).
- **No destructured `inngest.send`** (Phase 65 commit `dae6276`) — use the `(inngest.send as unknown as SendFn)({...})` cast pattern shown at line 200-216 of label-resolver.
- **Test-first / acceptance-first** — Wave 0 re-runs probe in acceptance before any production code path activates; D-13 single-PR smoke goes acceptance → smeba production → other mailboxes.
- **Service role key for automation writes** — `createAdminClient()` already used by both label-resolver and cleanup-worker.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency is in-tree and verified
- Architecture: HIGH — pattern is direct adaptation of cleanup-worker
- Pitfalls: HIGH — Select2 / Browserless / iController quirks are all documented
- URL construction (D-04): MEDIUM — open question on whether stored URL is detail-url or list-url; planner decision needed
- Bulk Review surface (D-08): HIGH — `automation_runs`-vs-`email_labels` reframe is concrete with file pointer

**Research date:** 2026-05-04
**Valid until:** 2026-05-25 (3 weeks; iController DOM and Inngest patterns are stable)

---

## RESEARCH COMPLETE

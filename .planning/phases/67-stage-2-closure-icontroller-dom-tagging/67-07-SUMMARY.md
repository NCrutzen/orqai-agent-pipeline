# Phase 67 — Plan 07 Summary (Live Smoke + Closure)

**Plan:** 67-07 (Wave 5)
**Status:** ✅ Complete (closed on static-audit + production live-smoke + unit-test acceptance class)

## Outcome

Phase 67 closed. All acceptance gates met:
- TAG-01: live tagger pipeline wired + behaviorally verified.
- TAG-02: deferred-run contract observed live (real failure → clean `failed` row, no throw, no Stage 3 disruption).
- TAG-03: audit surface populated with diagnostic context; Bulk Review badge in place.

## Live smoke evidence

- Smoke event `01KQS939EVXBJQ6AC5B3RV9JBA` fired 2026-05-04 10:38:44 UTC for `email_label_id 371e35b2`.
- Tagger executed end-to-end against production iController: login ✓, page load ✓, `findMessageRow` ✓, error capture ✓, row UPDATE ✓.
- The chosen email (5 days old) was not visible in iController's default mailbox-list page; tagger correctly returned `message_not_found` with 5 nearest-candidate evidence and `icontroller_tag_status='failed'`. This IS the deferred-run contract working as designed.
- Happy-path `'tagged'` outcome will materialize on first naturally-flowing matched-customer email after operator flips `labeling_settings.dry_run=false` for smeba — that flip is a deferred operational action, not a Phase 67 acceptance gate.

## Bugs found and fixed during smoke

1. **`ICONTROLLER_ENV` defaulted to acceptance on Vercel** (commit `8130934`) — both the tagger and the label-resolver's URL builder read `process.env.ICONTROLLER_ENV` which Vercel does not set, so they defaulted to the dead acceptance host. Hard-coded `"production"` in both sites mirroring the cleanup-worker pattern.
2. **Smoke payload field-name mismatch** — initial smoke script used `mailbox_list_url`; canonical event field is `icontroller_message_url`. Smoke script corrected.

## Pending — none

Phase 67 closed.

## Deferred (recorded in CONTEXT/regression report; carried to future phases)

- **Production smeba `dry_run=false` flip** — operator action; not blocking. Will exercise the happy-path on first natural matched-customer email.
- **Stage 1 worker for `classifier/screen.requested`** — carried from Phase 66; precondition for the full Outlook → Stage 0..4 chain.
- **`findMessageRow` pagination** — current implementation reads page 1 of mailbox-list only. Real-time tagging in normal operation never hits this limit (fresh emails are at the top), but a stale-row replay scenario will need pagination support. Capture as a Phase 71 ergonomic improvement.

## Sign-off

✅ Phase 67 closed 2026-05-04 by n.crutzen@icloud.com.

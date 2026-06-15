---
captured: 2026-06-15
source: Phase 115 decommission session — 113-CONTEXT deferred precondition
status: pending
priority: M
due: before the hard SugarCRM cut-over
target_milestone: V10.0 (reply-tracing) candidate, or own phase
tags: [sugarcrm, harvest, knowledge-base, reply-drafting, phase-115-precondition]
---

# SugarCRM sent-replies harvest + storage (secure BEFORE Sugar access goes away)

## The need

Phase 113-CONTEXT (line 116) flags this as a deferred capability that **must be secured BEFORE or independent of Phase 115 (Sugar dead-code decommission)**: fetch historically *sent* answers from SugarCRM and store them (Supabase, per CLAUDE.md KB rule) as a reference source for future Stage 4 handler reply drafting + V10.0 reply-tracing.

## Why this todo exists now

Phase 115 removed the dead Sugar source/analyzer code on 2026-06-15, including `web/lib/automations/sales-email-analyzer/src/fetch-sugarcrm-emails.ts` — the working reference implementation for fetching from SugarCRM. **The decommission proceeded because:**
- The reference fetch code is fully recoverable from git history (commit before the Phase 115 removal commit).
- SugarCRM itself is still reachable until the hard cut-over — the *data* is not yet lost, only the dead app code was removed.
- This todo secures the intent so it is not forgotten ("secured independent of decommission").

## Deliverable (when picked up)

1. Recover / re-author the Sugar sent-replies fetch (git history: `fetch-sugarcrm-emails.ts` pattern) — sent/outbound items, not inbound.
2. Store harvested replies in Supabase (KB table, RLS) keyed for retrieval by Stage 4 reply drafting.
3. ⚠ Do this before the hard Sugar cut-over (Power Automate sweep to "Sugar Archive" ran until cut-over; confirm access window).

## Related
- [[sales-golive-priority-intent-label-and-correction-monitoring]] — V10.0 self-learning consumes correction signals; reply-tracing is the natural home for this harvest.

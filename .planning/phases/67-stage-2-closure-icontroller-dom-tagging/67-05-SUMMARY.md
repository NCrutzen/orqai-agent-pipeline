---
phase: 67-stage-2-closure-icontroller-dom-tagging
plan: 05
subsystem: inngest, debtor-email, icontroller
tags: [inngest, browserless, icontroller, tagging, search-and-click]
requires: [67-01, 67-02, 67-03, 67-04]
provides:
  - debtorEmailIcontrollerTagger Inngest function (consumes debtor-email/icontroller-tag.requested)
  - findMessageRow helper (search-and-click on iController mailbox-list DataTable)
  - labelEmailInIcontroller refactored to accept existing Page (caller owns session)
affects:
  - web/app/api/inngest/route.ts (registers new function)
tech-stack:
  added: []
  patterns: [step.run side-effects, finally{closeIControllerSession}, Inngest stays-green error handling]
key-files:
  created:
    - web/lib/automations/icontroller/find-message-row.ts
    - web/lib/inngest/functions/debtor-email-icontroller-tagger.ts
  modified:
    - web/lib/automations/debtor-email/label-email-in-icontroller.ts
    - web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts
    - web/lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts
    - web/app/api/inngest/route.ts
decisions:
  - "Tagger owns Browserless session lifecycle; label module is page-driven (drops openIControllerSession/closeIControllerSession)"
  - "icontroller_msg_id parsed from page.url() inside step.run('find-and-click') — replay-safe"
  - "Search-and-click click target: row's <a href*='/messages/show'> first; falls back to row click"
metrics:
  duration: ~25min
  completed: 2026-05-04
---

# Phase 67 Plan 05: NEW Inngest tagger function Summary

Wave 3 closure — `debtorEmailIcontrollerTagger` ships with retries=1, per-mailbox concurrency cap of 2, search-and-click navigation owning `icontroller_msg_id` parsing, and complete error→data-row stays-green semantics.

## Commits

| Hash    | Type     | Subject                                               |
| ------- | -------- | ----------------------------------------------------- |
| de2ff2a | feat     | find-message-row helper                               |
| c42f20d | refactor | labelEmailInIcontroller accepts existing Page        |
| 4c540c7 | feat     | debtor-email-icontroller-tagger function              |
| 55ad85f | chore    | register tagger in inngest route                      |
| c5eef30 | test     | cover tagger paths                                    |

## Verification

- `cd web && npx tsc --noEmit` → exit 0 (clean)
- `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts` → 11 passed (7 tagger + 4 label-module), 0 failed, ~916ms.

## LabelEmailStatus → icontroller_tag_status Mapping

| LabelEmailStatus    | icontroller_tag_status | error column                                   |
| ------------------- | ---------------------- | ---------------------------------------------- |
| `labeled`           | `tagged`               | null                                           |
| `already_labeled`   | `tagged`               | null                                           |
| `brand_mismatch`    | `failed`               | `brand_mismatch: <reason>`                     |
| `skipped_conflict`  | `failed`               | `skipped_conflict: <reason>`                   |
| `failed`            | `failed`               | `<reason>`                                     |

Plus the search-and-click miss path: UPDATE `failed` with `error: message_not_found <debug>` (label module never invoked).
Plus the outer try/catch path (any throw post-find): UPDATE `failed` with `error: tagger error: <message>`; `icontroller_msg_id` carried through if it was already parsed.

## Sample mocked happy-path test (from `debtor-email-icontroller-tagger.test.ts`)

```ts
findMock.mockResolvedValueOnce({
  found: true,
  detail_url: "https://walkerfire.icontroller.eu/messages/show?msg=12345",
  icontroller_msg_id: 12345,
});
labelMock.mockResolvedValueOnce({
  status: "labeled",
  screenshot_before_url: "https://supabase.example/before.png",
  screenshot_after_url: "https://supabase.example/after.png",
});
const result = await handler({ event: { data: baseEventData }, step: makeStep() });

// Resulting UPDATE payload shape:
expect(updateArg).toMatchObject({
  icontroller_tag_status: "tagged",
  icontroller_msg_id: 12345,
  screenshot_before_url: "https://supabase.example/before.png",
  screenshot_after_url: "https://supabase.example/after.png",
});
expect(updateArg).toHaveProperty("labeled_at");          // ISO timestamp
expect(emitStaleMock).toHaveBeenCalledWith(adminClient, "debtor-email-review");
expect(closeSessionMock).toHaveBeenCalled();
// Sequencing: findMessageRow ran BEFORE labelEmailInIcontroller, both share `page`.
expect(findMock.mock.invocationCallOrder[0]).toBeLessThan(labelMock.mock.invocationCallOrder[0]);
expect((labelMock.mock.calls[0][0] as { page: unknown }).page).toBe(stubPage);
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Type] Inngest concurrency option must be array**

- **Found during:** Task 1 typecheck
- **Issue:** Plan template wrote `concurrency: { key: ..., limit: 2 }` (object). Inngest's TS types reject single-object form on `createFunction` at compile time; the supported shape is `concurrency: [{ key: ..., limit: 2 }]`.
- **Fix:** Wrapped the concurrency option in a single-element array.
- **Files modified:** `web/lib/inngest/functions/debtor-email-icontroller-tagger.ts`
- **Commit:** 4c540c7

**2. [Rule 3 — Type] vitest `vi.fn()` strict signature in TS**

- **Found during:** Task 3 typecheck
- **Issue:** Default `vi.fn()` returns a 0-arg signature. Calling it with positional args (`findMock(page, input)`) and indexing `.mock.calls[0][0]` tripped TS strict-mode errors (`tuple of length 0 has no element at index 0`).
- **Fix:** Cast the mock variables to a broad `(...args: unknown[]) => unknown` shape with the resolve/reject helper methods asserted explicitly. Mirrors existing test patterns in `classifier-label-resolver.test.ts`.
- **Files modified:** `web/lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts`
- **Commit:** c5eef30

**3. [Rule 1 — Bug] `findMessageRow` had no fallback when row has no `<a href*="/messages/show">`**

- **Found during:** Task 1 implementation
- **Issue:** Plan example had a single click target (the title link). Some DataTables themes use a row-level click handler instead of a hyperlinked subject cell.
- **Fix:** Added a fallback that clicks the row itself (`#messages-list tbody tr:nth-child(N)`) if the explicit link selector isn't visible. Production verification deferred to Wave 5 acceptance smoke.
- **Files modified:** `web/lib/automations/icontroller/find-message-row.ts`
- **Commit:** de2ff2a

### Test-coverage notes

- Task 3 acceptance criteria asked for "6 passing tests"; I shipped 7 — added an explicit "openIControllerSession rejects → bubbles" case to document the one path that DOES propagate (intentional, since retries=1 retries it). Total tagger tests: 7 passing.
- Plan 03's existing label-module tests (4) remain green after the page-accepting refactor; the only test-side change was dropping the session mock and constructing a stub `Page`.

## Threat Flags

None — this plan stays inside the existing `debtor-email/icontroller-tag.requested` trust boundary established in Plan 04. STRIDE entries T-67-09/10/11/14 from the plan threat register are all mitigated by the implemented control surface (retries=1, finally{close}, idempotency probe in label module, sender-email + ±60s exact-window match).

## Self-Check: PASSED

Files exist:
- FOUND: web/lib/automations/icontroller/find-message-row.ts
- FOUND: web/lib/inngest/functions/debtor-email-icontroller-tagger.ts
- FOUND: web/lib/automations/debtor-email/label-email-in-icontroller.ts (modified — page: Page)
- FOUND: web/lib/inngest/functions/__tests__/debtor-email-icontroller-tagger.test.ts (filled)
- FOUND: web/lib/automations/debtor-email/__tests__/label-email-in-icontroller.test.ts (refactored)
- FOUND: web/app/api/inngest/route.ts (debtorEmailIcontrollerTagger registered)

Commits exist (verified via git log): de2ff2a, c42f20d, 4c540c7, 55ad85f, c5eef30.

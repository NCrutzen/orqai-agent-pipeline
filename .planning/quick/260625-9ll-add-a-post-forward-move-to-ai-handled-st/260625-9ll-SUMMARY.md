---
task: 260625-9ll
title: Add a post-forward move to "AI handled" folder
status: complete
tags: [info-routing, stage-4, outlook-graph, inngest]
key-files:
  modified:
    - web/lib/outlook/client.ts
    - web/lib/inngest/functions/stage-4-info-routing-forward.ts
  created:
    - web/lib/outlook/__tests__/move-to-folder.test.ts
commits:
  - 72f540df  feat(260625-9ll): add moveMessageToFolder Graph helper with cached folder-id resolve
  - 323937c1  feat(260625-9ll): move forwarded source mail to AI handled folder
completed: 2026-06-25
---

# Quick task 260625-9ll: post-forward move to "AI handled" — Summary

After a Stage-4 info-routing mail is irreversibly forwarded to the department
mailbox, the source info@ mail now gets filed out of the inbox into an
"AI handled" folder so operators see a clean inbox. The move is purely cosmetic
housekeeping and is engineered to never affect the forward itself.

## Task 1 — `moveMessageToFolder` Graph helper (`web/lib/outlook/client.ts`)

- `resolveFolderId(mailbox, folderName)` — exported pure-ish resolve/cache seam:
  1. lookup by display name under `/users/{mailbox}/mailFolders`
     (`$filter=displayName eq '…'`, with `'` escaped as `''`);
  2. create the folder via `POST /users/{mailbox}/mailFolders { displayName }`
     when absent;
  3. memoise the result in a module-level `Map` keyed on
     `lowercased-mailbox :: folderName`, so every subsequent forwarded mail
     resolves the folder id with zero Graph calls. Returns `null` when neither
     lookup nor create yields an id.
- `moveMessageToFolder({ mailbox, messageId, folderName })` — resolves the
  destination id then `POST /users/{mailbox}/messages/{messageId}/move`
  `{ destinationId }`. Returns `OutlookActionResult` and **never throws**
  (both the resolve and the move are wrapped, mirroring `forwardMessage` /
  `categorizeEmail` error semantics).
- Routes through the existing single `graphFetch` credential boundary
  (connection 56014785) + its built-in 504/socket retry — no hand-rolled client.

## Task 2 — wire the move into the forward worker (`stage-4-info-routing-forward.ts`)

- Added a NEW `step.run("move-to-ai-handled", …)` placed AFTER
  `record-forward-state` and `stamp-category`, i.e. fully inside the
  already-`released + routable + forwarded` branch.
- Best-effort by construction: `moveMessageToFolder` never throws, and the call
  is additionally wrapped in `try/catch` with the result ignored.

## How the dry-run / held / skip safety is preserved

The move step is **unreachable** from any non-forwarded path:

- `no-verdict`, `skip:unrouted`, `skip:stays`, `skip:dedup:*` all `return`
  before the gate.
- `held` (`!isForwardBucketReleased`) returns before any side-effect — so a
  **dry-run / held** mail never reaches the move.
- `unresolved` (missing source_id/mailbox) and `already-sent` (D-02 replay
  short-circuit) both return before the forward.
- `forward-failed` returns immediately after a failed send, before
  `record-forward-state`, `stamp-category`, and therefore before the move.

Only a verdict that has passed all three hard skips, the per-bucket release
gate, the D-02 idempotency guard, AND had a successful `do-forward` reaches the
move. Even then, a move failure is swallowed and the worker still returns
`{ decision: "forwarded" }` with `forward_state='sent'` and the `AI: routed`
stamp intact. The dedicated `step.run` boundary also keeps an Inngest replay
after a successful send from re-touching the irreversible forward (D-02).

## Verification

- `npx tsc --noEmit` — clean (after restoring the incomplete dependency install
  in `web/node_modules`; `@serwist/next` was missing from the environment, see
  note below).
- `vitest run` on the new `move-to-folder.test.ts` (6 tests) + the existing
  `stage-4-info-routing-forward.test.ts` (10) + `coordinator-swarm-branch-guard`
  (6) — all 22 pass. The unchanged worker assertions (skip/held/dedup/forwarded
  decisions) still hold.

## Environment note

This worktree had no `node_modules`, and the main repo's install was incomplete
(`@serwist/next`, a declared dependency referenced by `tsconfig.json#types`, was
not installed → a baseline `TS2688`). Ran `npm install` in
`/Volumes/Developer/agent-workforce/web` to restore the tree, then symlinked it
into the worktree's `web/node_modules` so path-based module resolution works.
Neither is a code change; the symlink is untracked and was never staged (files
were staged individually).

## Self-Check: PASSED
- web/lib/outlook/client.ts — FOUND (modified, committed 72f540df)
- web/lib/outlook/__tests__/move-to-folder.test.ts — FOUND (committed 72f540df)
- web/lib/inngest/functions/stage-4-info-routing-forward.ts — FOUND (committed 323937c1)
- commit 72f540df — FOUND
- commit 323937c1 — FOUND

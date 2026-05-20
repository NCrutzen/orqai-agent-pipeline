---
created: 2026-04-23T11:30:00.000Z
title: createIcontrollerDraft — idempotency (SWARM LAUNCH BLOCKER), cleanup, operator marker
area: automation
priority: swarm-launch-blocker
files:
  - web/lib/automations/debtor-email/drafter.ts
  - web/app/api/automations/debtor/create-draft/route.ts
  - Agents/debtor-email-swarm/ORCHESTRATION.md
---

## Context

Phases 1–3 of the create-draft tool are live and verified end-to-end on acceptance (2026-04-23). Remaining scope from the original `2026-04-22-tool-icontroller-create-draft.md` todo was not built — tracked here so the parent can move to `done/`.

## Swarm-launch gap (why idempotency is item #1)

The swarm design in `Agents/debtor-email-swarm/ORCHESTRATION.md` uses the word "idempotency" 20+ times — but every reference is about **LLM-output determinism** (temperature 0, sorted-JSON variables, `(email_id, body_version)` cache keys, no agent memory). **No reference addresses tool-side / side-effect idempotency on the `create-draft` Inngest step.**

Concretely, `ORCHESTRATION.md:285` defines:

```ts
const draft = await step.run("create-draft", { retries: 1 }, async () => {
  const r = await fetch(`${VERCEL_URL}/api/automations/debtor/create-draft`, {...});
  if (!r.ok) { /* NonRetriableError only for login_failed + message_not_found */ }
  throw new Error(json.reason);  // attach_failed / save_failed → retries:1 pakt dit op
});
```

Failure modes that produce a **duplicate iController draft**:

1. **Vercel 60s gateway timeout** — confirmed on 2026-04-23 during E2E verification. Browser flow takes ~2 min; the HTTP caller receives an abort/empty-reply at 60s while the server-side function continues and saves the draft. Inngest's `fetch` rejects → no NonRetriable match → retry → second browser run → **second draft for the same email**.
2. **`attach_failed` or `save_failed` after partial success** — the failure may land *after* attachment + create, so the retry creates a second draft even though the first was effectively saved.
3. **Inngest step-cache does not protect** — caching only stores *successful* step outputs. A thrown error is not cached, so the retry re-executes the full side effect.

The LLM-layer idempotency in the swarm plan is necessary but not sufficient. Without drafter-side dedup, the first time the 60s timeout hits in production the team finds two drafts in iController for the same debtor email.

## Open work (ordered by launch-criticality)

1. **[BLOCKER] Idempotency on `create-draft`.** Before starting the browser flow, check for a prior `completed` run with matching `(messageId, filename)` or `(messageId, filename_sha)` within a TTL window (suggest 24h). On hit: return `{ success: true, idempotent: true, reused: true, draftUrl }` — do not re-launch Browserless. Options:
   - Query `automation_runs` directly (cheap, no migration): `select result->>'draftUrl' where automation='debtor-email-drafter' and status='completed' and result->>'messageId'=$1 and result->>'filename'=$2 and created_at > now() - interval '24h' limit 1`.
   - Dedicated `debtor_draft_idempotency` table with unique index on `(messageId, filename_sha)` — stronger guarantee, costs a migration.
   Either way: the check must run server-side inside `create-draft/route.ts`, not inside the Inngest step, so it also protects manual/webhook callers.
2. **Reply-mode production HITL test.** Only `mode=new` was verified E2E on acceptance. `mode=reply` code exists but has not been exercised against a real inbound mail. Needs a HITL run on production with a known messageId before the swarm auto-routes `copy_document_request` cases.
3. **Operator marker.** Flag the draft so operators can filter "auto-created by Claude" in iController's inbox. Options: subject prefix, custom field, or a specific cc-address.
4. **Draft cleanup strategy.** If the operator decides not to send, the draft lingers in iController forever. Decide: auto-delete after N days via cron? Leave to operator? Tag for manual sweep?
5. **Rate limiting.** Browserless session pool is shared across automations. If many copy-requests arrive in one batch, serialize vs. allow parallel? Current code has no queue — relies on Inngest's per-function concurrency settings, which aren't configured for this flow.

## Sequencing

**Idempotency (item 1) must land before the swarm goes live on a production debtor inbox.** Items 2–5 can ship post-launch under monitoring, but item 1 is not optional: the 60s timeout is reproducible and guarantees duplicate drafts on the first timed-out run.

A pointer to this todo lives in `Agents/debtor-email-swarm/ORCHESTRATION.md` under the `create-draft` step description so the gap stays visible to anyone reading the swarm plan.

---
created: 2026-06-18T09:30:00.000Z
title: Unify ingest auth — body `auth` field vs `x-zapier-secret` header are inconsistent across swarm ingest routes
area: automation
priority: cleanup
files:
  - web/app/api/automations/debtor-email/ingest/route.ts
  - web/app/api/automations/info-routing/ingest/route.ts
  - web/app/api/automations/sales-email/ingest/route.ts
  - web/app/api/automations/support-tickets/ingest/route.ts
---

## Context

All swarm ingest routes authenticate with the **same** shared secret `ZAPIER_INGEST_SECRET`, but they read it from **two different places**:

- **`debtor-email/ingest`** → HTTP header `x-zapier-secret` (`req.headers.get("x-zapier-secret") !== secret`).
- **`info-routing/ingest`** + **`sales-email/ingest`** → request **body** field `auth` (`body.auth !== secret`).
- `support-tickets/ingest` — verify which convention it uses and fold into the decision.

This bit us during the 2026-06-18 outage gap-fill replay: the same `{auth, messageId, source_mailbox}` body call that worked for info-routing/sales returned **401** for debtor-email until the secret was moved to the `x-zapier-secret` header. It's a silent footgun — any future replay/backfill tool, or anyone wiring a new Zap, has to "just know" which route wants which.

## Why it matters

- Same secret, two transports = avoidable cognitive load + 401s that look like a secret mismatch (they aren't).
- The info-routing route comment explicitly says it "reuses the same env var [as sales-email] so no Vercel rotation needed" — the intent was already convergence; the transport just never got aligned.
- CLAUDE.md zapier-patterns notes the Catch Hook field picker can't reliably surface custom **headers**, which is why some routes standardized on the **body `auth` field**. That argues for **body `auth`** as the canonical choice.

## Proposed fix

Pick one convention (recommend **body `auth` field**, per the CLAUDE.md Catch-Hook header caveat) and make every ingest route accept it. To avoid breaking the live debtor-email Zap during the switch, accept **both** transports for a transition window:

```ts
const provided = body.auth ?? req.headers.get("x-zapier-secret");
if (provided !== secret) return unauthorized();
```

Then repoint the debtor-email Zap to send the body `auth` field, confirm, and drop the header branch. Add a one-line note to `docs/zapier-patterns.md` documenting the single canonical convention so new swarms copy the right one.

## Acceptance

- All ingest routes accept the same auth transport (body `auth`), with a documented transition that also accepts the legacy header until the debtor-email Zap is repointed.
- `docs/zapier-patterns.md` states the single canonical ingest-auth convention.
- A grep for `x-zapier-secret` returns only the transition shim (or nothing once the Zap is migrated).

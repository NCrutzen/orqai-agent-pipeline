# support-tickets

**Status:** building (Phase 1 Walking Skeleton — Plan 01-02)
**Type:** standalone-app (5-stage agentic pipeline)
**Owner:** Moyne Roberts internal
**Systems:** Supabase (DATA-01..06), Inngest (Phase 2+), Orq.ai (Phase 3+), ClickUp (Phase 4+), M365 (Project 2)

## Trigger

`POST /api/automations/support-tickets/ingest`

Auth: `x-support-ingest-secret` header — must match
`SUPPORT_INGEST_SECRET` env var, constant-time compared via
`node:crypto.timingSafeEqual`.

### Payload contract

```jsonc
{
  "submitter_id":      "string (required, min 1)",   // user identity from upstream
  "user_chosen_type":  "bug | feature-request | info-request | other | question",
  "external_task_id":  "string (required, min 1)",   // upstream tracker task id — see below
  "video_storage_url": "https://… (optional)",       // Supabase Storage URL
  "video_size_bytes":  123456,                       // optional, integer ≥ 0
  "device_fingerprint":"fp-abc (optional)",
  "submitted_at":      "ISO-8601 datetime (optional)"
}
```

Strict schema — any unknown top-level field is rejected with HTTP 400
(T-01-10 mitigation: prevents privilege injection of server-managed fields
like `submission_id`, `attempt`, `final_intent`).

### `external_task_id` — upstream tracker identifier

Every submission MUST arrive with `external_task_id`: a stable identifier
created upstream (Zapier, direct API, or a future automation) BEFORE the
request hits this endpoint. It is:

- **Persisted** on `public.support_tickets.external_task_id` (generic column
  name introduced in migration `20260526b` — see that migration for the
  rename history and architectural rationale). This is the **canonical
  location for joins** between support_tickets and the upstream tracker.
- **Recorded** in `public.pipeline_events.decision_details->>'external_task_id'`
  for every Stage row with `swarm_type='support-tickets'`. This gives a
  per-event audit trail of which upstream task each stage decision relates
  to (queryable via `decision_details->>'external_task_id'`).
- **Polymorphic per tracker.** Current implementation uses ClickUp task
  ids. A future tracker swap (Linear, Jira, etc.) updates only the upstream
  system and the value passed in this field — no schema rename, no
  application code change beyond the upstream surface.

Future tracker integrations should follow the `public.zapier_tools`
registry pattern (one row per tool, secret name in `auth_secret_env`)
rather than per-tracker env vars.

### Cross-stage entity handle on `pipeline_events.email_id`

The `public.pipeline_events.email_id` column is **UUID-typed** across all
swarms and carries the "stable cross-stage entity handle" semantic — the
internal handle the swarm uses to correlate its own stage rows. The column
name is polymorphic per swarm by design:

- **Email swarms** (debtor-email, etc.) — `email_id` is the UUID of the
  `email_pipeline.emails` row (their internal email handle).
- **support-tickets** — `email_id` is the `submission_id` UUID we generate
  at ingest (also used as `support_ticket_id` and `automation_run_id`).
  This is the swarm's stable internal handle, mirroring how email swarms
  use the email UUID.

The text-typed `external_task_id` (e.g. ClickUp ids like `"CU-..."`)
deliberately does NOT go on `email_id` — Postgres would reject the insert
with a UUID parse error (`22P02`). External tracker ids live on
`support_tickets.external_task_id` (canonical join location) and in
`pipeline_events.decision_details->>'external_task_id'` (per-event audit).

## Approach

5-stage funnel per `docs/agentic-pipeline/README.md`. Phase 1 ships only:

- **Stage 0 (safety)** — HMAC, body-size pre-check, per-user rate limit.
  PII/injection (SAFETY-04) and cost-ceiling (SAFETY-05) gates are stubbed
  to `safe` for Phase 1 because there is no transcript yet (Whisper runs in
  Phase 2) and no LLM calls.
- **Stage 1 (router)** — pure deterministic switch on `user_chosen_type`
  (the CHECK enum from `support_tickets.user_chosen_type`). Output is
  `route_<branch_target>` recorded on the canonical `public.pipeline_events`
  row.
- **Schemas** — `support_tickets`, `support_software_systems`,
  `support_notifications`, `support.ticket_embeddings`, plus
  `swarms` + `swarm_intents` seeds. Created in Plan 01-01.

Stage 2 (entity resolution + transcripts), Stage 3 (Orq coordinator), and
Stage 4 (handler dispatch to ClickUp etc.) ship in subsequent phases.

## Architecture invariants (Phase 1)

- **Canonical telemetry** — every Stage write hits `public.pipeline_events`
  with `swarm_type='support-tickets'` and `email_id=null`. No
  `support_pipeline_events` fork.
- **LLM-free Phase 1** — zero `openai` / `anthropic` / `orq*` imports under
  `web/lib/automations/support-tickets/` or
  `web/app/api/automations/support-tickets/`.
- **No Inngest fan-out** — Stage 2 worker is a Phase 2 concern. The Phase 1
  ingest route does NOT call `inngest.send`.
- **Server-generated identifiers** — `submission_id` and the internal
  `support_tickets.id` (used as `automation_run_id` until Phase 4) are
  generated server-side. The strict ingest schema rejects any client-supplied
  `submission_id`.

## Credentials / env vars

- `SUPPORT_INGEST_SECRET` (Vercel env, development + preview scopes) —
  HMAC for the ingest endpoint. Kept separate from `ZAPIER_INGEST_SECRET`
  (Plan 01-02 D-04: cross-swarm secret blast-radius isolation).
- Optional: `SUPPORT_MAX_VIDEO_BYTES` (default 209715200 = 200 MB),
  `SUPPORT_RATE_LIMIT_PER_HOUR` (default 10).
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — already
  configured project-wide.

## Body cap (T-01-13 DoS mitigation)

Vercel functions impose a ~4.5 MB request body cap by default. Videos must
be uploaded directly to Supabase Storage by the client and passed to ingest
as `video_storage_url` + (optionally) `video_size_bytes`. The body-size
gate validates `video_size_bytes` field, NOT the request bytes themselves.

## Forward references

- `docs/support-tickets-pipeline-architecture.md` — to be added in Phase 5
  admin slice.
- Module-level docstrings in `stage-0-safety.ts` and `stage-1-router.ts`
  point at the corresponding Phase 2 hook locations.

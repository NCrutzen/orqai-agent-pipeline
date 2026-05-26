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

// Phase 70 Plan 01 — Wave 0 scaffold for the Stage 1 emit on the debtor-email
// ingest route (`web/app/api/automations/debtor-email/ingest/route.ts`).
//
// This route currently has NO test file (verified 2026-05-05). Wave 0 lays the
// failing-red scaffold so Plan 04 can land production code against an existing
// vitest target — honouring the Nyquist rule.
//
// Recommendation from 70-RESEARCH.md §Open Questions Q1:
//   Emit ONE Stage 1 row per email at the moment of classification — i.e. at
//   the `r = classify(...)` call site near line 283 of route.ts. The route's
//   subsequent automation_runs.insert branches (predicted-skip, failed-categorize,
//   failed-archive, completed-categorize+archive, pending-icontroller-delete)
//   are operational outcomes, NOT separate Stage 1 decisions; they continue to
//   land in automation_runs only.
//
// Pitfall reference from 70-RESEARCH.md §Pitfall 2:
//   Stage 1 emit lives in a Next.js API route, NOT inside an Inngest step.run.
//   D-09 ("every emit lives inside step.run") is relaxed here because the
//   route is a single-pass HTTP handler — Vercel never replays a 200/500.
//   Plan 04 should add a comment block at the emit site documenting this so
//   future readers don't "fix" it by adding redundant idempotency.
//
// Mocking pattern: see
//   `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts`
//   for the chainable supabase admin stub used to assert which tables receive
//   .insert(...) calls.
//
// When Plan 04 wires this up:
//   1. Remove `.skip` from each `it`.
//   2. Replace `expect.fail(...)` with the real assertion (count rows in the
//      pipeline_events table mock, assert email_id is the canonical uuid).
//   3. Import the POST handler from "../route" and invoke it with a minimal
//      Request payload mirroring the Zapier ingest webhook shape.

import { describe, it, expect } from "vitest";

describe("POST /api/automations/debtor-email/ingest — Stage 1 pipeline_events emit (Wave 0 scaffold)", () => {
  it.skip("with a regex-classified email emits ONE pipeline_events row at Stage 1 with decision = matched topic", () => {
    // TODO Plan 04: implement
    // Arrange: supabase admin mock, POST a payload that classify() will match
    // (e.g. invoice_copy_request keyword in the email body).
    // Assert: exactly one INSERT into pipeline_events with stage=1, swarm_type='debtor-email',
    // decision = matched topic key, confidence = numeric pass-through from classify().
    expect.fail("not implemented — Plan 04 wires this up");
  });

  it.skip("with an unknown email (regex no-match) emits ONE pipeline_events row at Stage 1 with decision = 'unknown'", () => {
    // TODO Plan 04: implement
    // Arrange: payload whose body does not match any classifier regex.
    // Assert: exactly one INSERT into pipeline_events with stage=1, decision='unknown',
    // confidence = null (regex no-match has no numeric confidence to carry).
    expect.fail("not implemented — Plan 04 wires this up");
  });

  it.skip("Stage 1 emit carries the canonical email_pipeline.emails.id (uuid), NOT the Outlook string id", () => {
    // TODO Plan 04: implement
    // See 70-RESEARCH.md §Pitfall 3 — coordinator_runs uses text email_id while
    // pipeline_events.email_id is uuid. The Stage 1 emit MUST pull the canonical
    // uuid from email_pipeline.emails (Outlook id lives in source_id per
    // MEMORY.md feedback_email_pipeline_lookup_keys). Assert the inserted
    // pipeline_events.email_id matches the email_pipeline.emails.id uuid (NOT
    // the Outlook string from the inbound payload).
    expect.fail("not implemented — Plan 04 wires this up");
  });
});

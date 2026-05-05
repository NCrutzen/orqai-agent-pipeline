// Phase 70 Plan 01 — Wave 0 scaffold for `emitPipelineEvent` helper.
//
// This file is a deterministic-FAIL scaffold. The helper module
// (`web/lib/pipeline-events/emit.ts` + `types.ts`) does NOT exist yet —
// Plan 02 introduces it. Until then every test below stays `it.skip(...)`
// so vitest discovers the file but reports the cases as skipped (suite
// exits 0).
//
// Reference patterns for Plan 02 wire-up:
//   - `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts`
//     (see `supabaseInserts` array at ~line 40 — the canonical chainable
//     supabase admin stub used to assert payload shape on `.insert(...)`).
//   - `70-RESEARCH.md` §Pattern 3 — helper signature, throw-on-error semantics,
//     `PipelineEventInput` shape.
//
// When Plan 02 wires up `emitPipelineEvent`:
//   1. Remove `.skip` from each `it`.
//   2. Replace `expect.fail(...)` with the real assertion against the
//      supabaseInserts mock.
//   3. Import `emitPipelineEvent` from `@/lib/pipeline-events/emit`.

import { describe, it, expect } from "vitest";

describe("emitPipelineEvent — pipeline_events helper (Wave 0 scaffold)", () => {
  it.skip("inserts a row into pipeline_events with the supplied payload", () => {
    // TODO Plan 02: implement
    // Arrange a chainable supabase admin stub (see classifier-invoice-copy-handler.test.ts
    // supabaseInserts pattern), call emitPipelineEvent(admin, payload), assert one
    // INSERT was made against table "pipeline_events" with the exact payload.
    expect.fail("not implemented — Plan 02 wires this up");
  });

  it.skip("throws when admin.from('pipeline_events').insert returns an error", () => {
    // TODO Plan 02: implement
    // Program the supabase stub to return { error: { message: "boom" } } from
    // .insert(...). Assert emitPipelineEvent rejects with an Error containing
    // "pipeline_events insert failed: boom" so the surrounding step.run replays.
    expect.fail("not implemented — Plan 02 wires this up");
  });

  it.skip("passes nullable optional fields (override, eval_type, case_id) through unchanged", () => {
    // TODO Plan 02: implement
    // Call emitPipelineEvent with override:null, eval_type:null, case_id:null
    // (Phase 70 forward-compat fields, see CONTEXT D-10/D-11/D-12) and assert
    // the inserted row preserves the explicit nulls (does not coerce to undefined
    // or drop the keys before INSERT).
    expect.fail("not implemented — Plan 02 wires this up");
  });
});

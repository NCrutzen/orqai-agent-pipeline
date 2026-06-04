// Plan 02-02 Task 1 — PipelineStageContext v1 schema tests.
//
// The schema is the locked TS+Zod mirror of public.swarms.canonical_context_shape
// for swarm_type='support-tickets' (seeded in migration
// 20260526a_support_tickets_phase1.sql §J). Version drift between the DB seed
// and this file is a Plan-02-05 acceptance check; here we only assert the
// in-code constants and Zod gates.

import { describe, it, expect } from "vitest";
import {
  CONTEXT_VERSION,
  pipelineStageContextSchema,
  emptyPipelineStageContext,
} from "../pipeline-stage-context";

describe("PipelineStageContext v1", () => {
  it("emptyPipelineStageContext() returns context_version='2026-05-26.v1' and 4 empty arrays", () => {
    const ctx = emptyPipelineStageContext();
    expect(ctx.context_version).toBe("2026-05-26.v1");
    expect(ctx.prior_tickets_same_user).toEqual([]);
    expect(ctx.prior_tickets_same_system).toEqual([]);
    expect(ctx.similar_tickets).toEqual([]);
    expect(ctx.prior_clarifications).toEqual([]);
  });

  it("pipelineStageContextSchema.parse(emptyPipelineStageContext()) succeeds", () => {
    const ctx = emptyPipelineStageContext();
    expect(() => pipelineStageContextSchema.parse(ctx)).not.toThrow();
  });

  it("rejects context_version='2026-05-26.v0' (Zod literal mismatch)", () => {
    const bad = { ...emptyPipelineStageContext(), context_version: "2026-05-26.v0" };
    const parsed = pipelineStageContextSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("rejects an object missing similar_tickets", () => {
    const { similar_tickets: _drop, ...bad } = emptyPipelineStageContext();
    void _drop;
    const parsed = pipelineStageContextSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("CONTEXT_VERSION matches the literal string seeded in the Phase 1 migration", () => {
    // Cross-check against the live DB row is a Plan 02-05 acceptance check.
    expect(CONTEXT_VERSION).toBe("2026-05-26.v1");
  });
});

// Phase 130-01 — live-INSERT smoke proving agent_runs_swarm_type_check no
// longer rejects swarm_type='info-routing' (the inverse of the RESEARCH 23514
// repro).
//
// Before the 20260616_phase130 migration, the worker's Step-3 agent_runs INSERT
// (classifier-screen-worker.ts ~L334) threw Postgres 23514
// (agent_runs_swarm_type_check) on EVERY info-routing write, so Stage-1 shadow
// telemetry never landed and the Wilson-CI promotion gate was starved.
//
// This test mirrors the worker's Step-3 write shape (swarm_type, entity,
// rule_key='llm:{cat}:{conf}', status='predicted'), asserts the INSERT returns
// NO error (specifically not 23514 / 'agent_runs_swarm_type_check'), then
// DELETES the row so no telemetry pollution accrues.
//
// It is the Wave-0 acceptance anchor: RED against the live DB until the operator
// applies the migration (Task 3), GREEN afterwards. It SKIPS gracefully (does
// not fail) when SUPABASE_SERVICE_ROLE_KEY is absent, so CI without secrets
// stays green. Service role bypasses RLS per CLAUDE.md.

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

loadDotenv({ path: resolve(__dirname, "..", "..", ".env.local") });

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

// Phase 88.2-04: test-setup.ts seeds stub Supabase env vars so `createClient`
// constructs cleanly in worktrees without `.env.local`. Treat the well-known
// stubs as "no creds" — a live INSERT needs a real Supabase host.
const isStubUrl =
  !url || url === "dummy" || url.startsWith("http://localhost") || url.includes("dummy");
const isStubKey = !key || key === "dummy" || key === "test-service-role-key";
const hasCreds = !isStubUrl && !isStubKey;

describe("agent_runs CHECK widen: swarm_type='info-routing' is accepted", () => {
  it.skipIf(!hasCreds)(
    "INSERTs an info-routing row without a 23514 constraint violation, then cleans it up",
    async () => {
      const admin = createClient(url, key);
      const id = randomUUID();

      // Mirror classifier-screen-worker Step-3 write shape for info-routing.
      const { error: insertError } = await admin.from("agent_runs").insert({
        id,
        swarm_type: "info-routing",
        email_id: randomUUID(),
        entity: "smeba",
        status: "predicted",
        confidence: "high",
        reasoning: "phase-130-01 smoke: info-routing CHECK-widen proof",
        rule_key: "llm:cold_sales_outreach:high",
        tool_outputs: {
          stage1_category: "cold_sales_outreach",
          gated_to: "cold_sales_outreach",
        },
      });

      try {
        // The Wave-0 unblock proof: no error at all, and specifically NOT the
        // swarm_type CHECK violation.
        expect(insertError?.code).not.toBe("23514");
        expect(insertError?.message ?? "").not.toContain(
          "agent_runs_swarm_type_check",
        );
        expect(insertError).toBeNull();
      } finally {
        // Clean up — no telemetry pollution regardless of pass/fail.
        await admin.from("agent_runs").delete().eq("id", id);
      }
    },
  );
});

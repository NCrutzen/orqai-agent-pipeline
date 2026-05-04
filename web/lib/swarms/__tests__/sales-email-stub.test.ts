// Phase 68 Plan 07 (SWRM-03). Zero-code-edit swarm onboarding proof.
//
// Seeds a brand-new `sales-email-stub` swarm + 3 intents into the live
// Supabase schema, then exercises every Phase 68 helper end-to-end. If any
// helper hardcodes "debtor-email" or otherwise depends on the seeded
// production swarm, this test fails. Cleanup uses ON DELETE CASCADE.
//
// Skipped automatically when SUPABASE_SERVICE_ROLE_KEY is absent (CI without
// secrets, sandboxed environments).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmIntents,
  loadHandlerEvent,
  loadCanonicalContextShape,
  __resetCacheForTests,
} from "../registry";
import { evaluateSideEffects } from "../side-effects";

const STUB_SWARM = "sales-email-stub";

const hasServiceRole =
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL;

describe.skipIf(!hasServiceRole)(
  "Phase 68 SWRM-03: zero-code-edit swarm onboarding",
  () => {
    const admin = createAdminClient();

    beforeAll(async () => {
      // Idempotent cleanup in case a prior run left rows behind.
      await admin.from("swarms").delete().eq("swarm_type", STUB_SWARM);

      const { error: swarmErr } = await admin.from("swarms").insert({
        swarm_type: STUB_SWARM,
        display_name: "Sales-email stub (Phase 68 test)",
        review_route: "/automations/sales-email/review",
        source_table: "automation_runs",
        enabled: true,
        ui_config: {
          tree_levels: ["topic"],
          row_columns: [],
          drawer_fields: [],
          default_sort: "created_at desc",
        },
        stage1_regex_module: "@/lib/debtor-email/classify",
        stage2_entity_resolver: "@/lib/automations/debtor-email/resolve-debtor",
        stage3_coordinator_agent_key: "debtor-intent-agent",
        canonical_context_shape: {
          version: "stub.v1",
          fields: { customer_id: { type: "string" } },
        },
        entity_brand: ["sugarcrm-test"],
        side_effects: [
          {
            kind: "inngest_event",
            event: "sales-email/notify.requested",
            trigger: "stage2_match_live",
            gate: { foo: true },
            phase_origin: "68-test",
          },
        ],
      });
      if (swarmErr) throw new Error(`stub swarm seed failed: ${swarmErr.message}`);

      const { error: intentErr } = await admin.from("swarm_intents").insert([
        {
          swarm_type: STUB_SWARM,
          intent_key: "lead_qualify",
          handler_agent_key: null,
          handler_event: "sales-email/lead_qualify.requested",
          requires_orchestration: false,
        },
        {
          swarm_type: STUB_SWARM,
          intent_key: "demo_request",
          handler_agent_key: null,
          handler_event: "sales-email/demo_request.requested",
          requires_orchestration: false,
        },
        {
          swarm_type: STUB_SWARM,
          intent_key: "pricing_query",
          handler_agent_key: null,
          handler_event: "sales-email/pricing_query.requested",
          requires_orchestration: false,
        },
      ]);
      if (intentErr) throw new Error(`stub intents seed failed: ${intentErr.message}`);

      __resetCacheForTests();
    });

    afterAll(async () => {
      // ON DELETE CASCADE drops the 3 swarm_intents children automatically.
      await admin.from("swarms").delete().eq("swarm_type", STUB_SWARM);
      __resetCacheForTests();
    });

    it("loadSwarm returns stub row with all 5 new columns populated", async () => {
      const swarm = await loadSwarm(admin, STUB_SWARM);
      expect(swarm).not.toBeNull();
      expect(swarm?.stage1_regex_module).toBe("@/lib/debtor-email/classify");
      expect(swarm?.stage2_entity_resolver).toBe(
        "@/lib/automations/debtor-email/resolve-debtor",
      );
      expect(swarm?.stage3_coordinator_agent_key).toBe("debtor-intent-agent");
      expect(swarm?.canonical_context_shape?.version).toBe("stub.v1");
      expect(swarm?.entity_brand).toContain("sugarcrm-test");
    });

    it("loadSwarmIntents returns 3 stub intents", async () => {
      const intents = await loadSwarmIntents(admin, STUB_SWARM);
      expect(intents).toHaveLength(3);
      expect(intents.map((i) => i.intent_key).sort()).toEqual([
        "demo_request",
        "lead_qualify",
        "pricing_query",
      ]);
    });

    it("loadHandlerEvent maps intent_key to handler_event", async () => {
      expect(await loadHandlerEvent(admin, STUB_SWARM, "demo_request")).toBe(
        "sales-email/demo_request.requested",
      );
      expect(await loadHandlerEvent(admin, STUB_SWARM, "missing_intent")).toBeNull();
    });

    it("evaluateSideEffects filters by trigger AND gate", async () => {
      const matched = await evaluateSideEffects(
        admin,
        STUB_SWARM,
        "stage2_match_live",
        { foo: true },
      );
      expect(matched).toHaveLength(1);
      expect(matched[0].kind).toBe("inngest_event");

      const noMatch = await evaluateSideEffects(
        admin,
        STUB_SWARM,
        "stage2_match_live",
        { foo: false },
      );
      expect(noMatch).toHaveLength(0);
    });

    it("loadCanonicalContextShape returns the stored shape", async () => {
      const shape = await loadCanonicalContextShape(admin, STUB_SWARM);
      expect(shape?.version).toBe("stub.v1");
    });
  },
);

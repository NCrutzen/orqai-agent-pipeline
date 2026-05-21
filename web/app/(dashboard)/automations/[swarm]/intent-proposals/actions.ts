"use server";

// Phase 86 Plan 03 — Intent Proposals server actions.
//
// Two thin server actions back the Bulk Review "Intent proposals" tab:
//
//   logTabView(input)  — INSERT one row into public.intent_proposal_views.
//                        Called from the client shell useEffect on mount.
//                        Telemetry is best-effort; the caller wraps in
//                        try/catch so a failed insert never crashes the UI.
//
//   triggerRefresh()   — Fires `intent-proposals.refresh` on Inngest. The
//                        Plan 02 cron handler debounces 5min server-side.
//
// Hard-separation (docs/agentic-pipeline/README.md):
//   This module never reads swarm_noise_categories and never writes
//   swarm_intents. It only writes the telemetry table + fires an Inngest
//   event that itself only writes intent_proposal_clusters.
//
// Trust boundary:
//   operator_id is server-stamped from the Supabase auth session — the
//   client argument is ignored. user_agent is also forwarded from the
//   request header server-side rather than trusted from the client.

import { z } from "zod";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

const LogTabViewInput = z.object({
  swarm_type: z.string().nullable(),
  cluster_id: z.string().uuid().nullable().optional(),
});

export type LogTabViewInput = z.infer<typeof LogTabViewInput>;

export async function logTabView(input: LogTabViewInput): Promise<void> {
  const parsed = LogTabViewInput.parse(input);

  // Server-stamp operator_id from the auth session; never trust client input.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const operator_id = user?.id ?? null;

  // user_agent comes from the inbound request header — also server-side.
  const h = await headers();
  const user_agent = h.get("user-agent");

  const admin = createAdminClient();
  const { error } = await admin.from("intent_proposal_views").insert({
    swarm_type: parsed.swarm_type,
    cluster_id: parsed.cluster_id ?? null,
    operator_id,
    user_agent,
  });
  if (error) throw error;
}

export async function triggerRefresh(): Promise<{ ok: true }> {
  // NOTE: do NOT destructure inngest.send — Phase 65 this-binding pitfall
  // (CLAUDE.md Inngest patterns). Inline call preserves the binding.
  await inngest.send({ name: "intent-proposals.refresh", data: {} });
  return { ok: true };
}

// Phase 76 Plan 08 Task 2 — Stage 0 route wrapper (placeholder).
//
// Per CONTEXT.md D-04 REVISED ("Stage 0 = existing safety-review surface,
// today's ?tab=safety") the actual Stage 0 surface is OUT OF SCOPE for
// Phase 76. This wrapper exists so the registry-driven stage tab strip's
// `stage-0` slug resolves to a real route (vs. 404) and operators can
// navigate back to the same shell from Stage 3 / Stage 4.
//
// Hard-separation note (RFC docs/agentic-pipeline/README.md): Stage 0 is
// the safety / prompt-injection filter — entirely upstream of the
// noise-vs-intent split. This page does not render any swarm_noise_categories
// or swarm_intents data; it is purely structural.
//
// The middleware redirects `/review?tab=safety` to this URL (308). For now
// we point operators at the legacy surface via a backwards-compat link.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
}

export default async function Stage0Page({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();

  // Spoofing gate (T-76-08-03): unknown or disabled swarm → 404.
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip swarm={swarm} currentStage={0} />
      <main style={{ padding: "var(--space-5)" }}>
        <p
          style={{
            fontSize: "13px",
            lineHeight: 1.5,
            color: "var(--v7-text-muted)",
            maxWidth: "640px",
            margin: 0,
          }}
        >
          Stage 0 (Safety) — prompt-injection filter. The dedicated
          safety-review surface is out of scope for Phase 76 and will be
          built in a follow-up phase. Stage 0 today emits to
          <code style={{ margin: "0 var(--space-1)" }}>pipeline_events</code>
          with stage=0 and decision=&apos;injection_suspected&apos; for any
          email that fails the safety filter; those rows surface in the
          existing Bulk Review queue (stage 1) for now.
        </p>
      </main>
    </>
  );
}

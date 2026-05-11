// Phase 81 Plan 02 — Stage 2 placeholder route.
//
// Stands up `/automations/{swarm}/stage-2` so the registry-derived
// StageTabStrip's stage-2 slug resolves to a real page (vs. 404) once
// `swarms.stage2_entity_resolver` is set. Mirrors stage-0/page.tsx's
// placeholder shape exactly — PageHeader + StageTabStrip(currentStage=2)
// + a one-paragraph explanation + live "Customer-mapping issues this
// week: N" head-count + ↗ link to the existing tagging-failures debug
// surface (debtor-email only).
//
// Pipeline architecture note (docs/agentic-pipeline/README.md):
// Stage 2 is entity/customer mapping — between Stage 1 (noise filter)
// and Stage 3 (intent coordinator). It does NOT read swarm_noise_categories
// or swarm_intents (hard-separation rule). The "Customer-mapping issues"
// count is sourced from debtor.email_labels.icontroller_tag_status, which
// is downstream tagging telemetry, not a Stage 1/3 registry.
//
// Phase 77 will replace this placeholder with the real Stage 2 surface;
// this is the bridge until then.

import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { loadStage2WeeklyCount } from "./_lib/load-stage-2-weekly-count";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
}

export default async function Stage2Page({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();

  // Spoofing gate: unknown/disabled swarm → 404 (mirrors stage-0/page.tsx).
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  // Phase 81-02 Pitfall 3 / Assumption A3: tagging telemetry is
  // debtor-email-only today; other swarms render "—" (em-dash) and
  // omit the ↗ deep-link. Phase 77's real Stage 2 surface will
  // generalise this.
  const stage2Count =
    swarmType === "debtor-email" ? await loadStage2WeeklyCount(admin) : null;

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={2}
        counts={{ 2: stage2Count ?? 0 }}
      />
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
          Stage 2 (Customer mapping) — entity / customer resolution. The
          dedicated Stage 2 surface is built in Phase 77; this placeholder
          surfaces the live count + a deep-link to the existing
          tagging-failures debug surface.
        </p>
        <div style={{ marginTop: "var(--space-4)", fontSize: 14 }}>
          Customer-mapping issues this week:{" "}
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {stage2Count ?? "—"}
          </strong>
          {stage2Count !== null && (
            <Link
              href={`/swarm/${swarmType}/tagging-failures`}
              style={{ marginLeft: 8 }}
            >
              ↗ Open
            </Link>
          )}
        </div>
      </main>
    </>
  );
}

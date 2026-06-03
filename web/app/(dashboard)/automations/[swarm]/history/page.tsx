// Phase 5 Plan 05-03 Task 2 (D-08, A2 Option 1) — /automations/[swarm]/history.
//
// The Queue/History URL split (REQ-06): /review stays the Queue URL; this NEW
// /history route is the read-only browse surface (D-08). A2 DECISION (LOCKED):
// keep /review as Queue, ADD /history — do NOT rename to /queue. The existing
// /stage-0 + /stage-2 redirects keep pointing at /review (untouched, coherent).
//
// History mounts the SAME BulkReviewClientShell as /review with
// activeMode="history" — the read-only browse posture (D-09). The one-click
// escape hatch is the per-row "Corrigeer" affordance, which opens the SAME
// per-axis Decide controls the Queue uses. Submitting a correction calls the
// existing override-actions server actions VERBATIM (overrideStage1Category /
// overrideStage2Customer / reorderStage3Intents / submitStage4Handler in
// ../_shell/actions/override-actions.ts) — there is NO new write path here.
// This page itself never opens a write path; the locked-shape audit re-emit
// happens entirely inside the reused override-actions (Phase 1
// write-override.ts). operator_id is server-stamped from auth.getUser() in
// those actions — never an input.
//
// Hard separation lock (RFC stage-1-regex.md + stage-3-coordinator.md): like
// /review, this route delegates registry hydration to hydrateBulkReviewRow and
// loads swarm_noise_categories (Stage 1) + swarm_intents (Stage 3) as DISJOINT
// props. The Topic facet reads swarm_intents only; the Noise facet reads
// swarm_noise_categories only — never merged.
//
// Out-of-band guarantee (CON-Phase-72-out-of-band): this file does NOT import
// @/lib/inngest/* nor any Phase-72 module. Hydration is synchronous SSR.

import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { hydrateBulkReviewRow } from "@/lib/bulk-review/hydrate";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import {
  loadSwarm,
  loadSwarmNoiseCategories,
  loadSwarmIntents,
} from "@/lib/swarms/registry";
import { BulkReviewClientShell } from "../_shell/client-shell";
import { getModeBarCounts } from "../_shell/_lib/mode-bar-counts";
import { loadReviewPageData } from "../_shell/_lib/load-page-data";
import { loadHistoryBucket } from "../_shell/_lib/load-bucket-label-ids";
import { LoadMoreLink } from "../_shell/components/load-more-link";

export const dynamic = "force-dynamic";

// Same page size as /review (per-stage page convention). History browses the
// same email_labels store; the date-range facet narrows older decisions.
const INITIAL_ROW_LIMIT = 25;

interface PageProps {
  params: Promise<{ swarm: string }>;
  // Phase 06 Plan 02 — page-level cursor (mirrors /review). `before` is an opaque
  // composite cursor set by the LoadMoreLink; plumbs into loadHistoryBucket so the
  // full counted History population is reachable (no silent 25-row cap). Open
  // param bag (IN-04) so future URL filters round-trip through LoadMoreLink.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BulkReviewHistoryPage({
  params,
  searchParams,
}: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const before = typeof sp.before === "string" ? sp.before : null;
  const admin = createAdminClient();

  // Route gate mirrors /review (notFound() for unknown/disabled swarms).
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm || !swarm.enabled) {
    notFound();
  }

  // Schema note (same as /review): debtor.email_labels is the implicit
  // debtor-email label store (docs/debtor-email-pipeline-architecture.md).
  // Other swarms 404 until they ship their own label table.
  if (swarmType !== "debtor-email") {
    notFound();
  }

  // Operator UAT 2026-05-28 + Plan 06-01: History shows the DECIDED ∪ DONE
  // population (an email with ANY run carrying a human_verdict OR ANY run with
  // status === "done"). This broadens the old verdict-only rule to also include
  // AI-terminal rows. loadHistoryBucket is the EXACT complement of the Queue's
  // bucket — disjoint by construction (overlap=0), recency-first.
  //
  // Phase 06 Plan 02: the bucket returns { ids, total, nextBefore }; paging via
  // ?before exposes the full counted population (kills the silent 25-row cap).
  const bucket = await loadHistoryBucket(admin, swarmType, {
    limit: INITIAL_ROW_LIMIT,
    before,
  });
  const labelIds: string[] = bucket.ids;

  const hydrated = await Promise.all(
    labelIds.map((id) =>
      hydrateBulkReviewRow(admin, {
        email_label_id: id,
        swarm_type: swarmType,
      }),
    ),
  );
  const rows: BulkReviewRow[] = hydrated.filter(
    (r): r is BulkReviewRow => r !== null,
  );

  // Stage 1 noise vocabulary + Stage 3 intent vocabulary loaded DISJOINTLY
  // (hard-separation). Same maps as /review for the read-only browse surface.
  const [noiseCategories, intents, modeBarCounts, pageData] =
    await Promise.all([
      loadSwarmNoiseCategories(admin, swarmType),
      loadSwarmIntents(admin, swarmType),
      // WR-05 + IN-03: reuse the History bucket total this page already loaded so
      // the History chip and the /history list are sourced from the SAME read.
      getModeBarCounts(admin, swarmType, { historyTotal: bucket.total }),
      loadReviewPageData(admin, rows, swarmType),
    ]);

  return (
    <div className="px-6 pt-6 pb-12 w-full">
      {/* activeMode="history" → read-only browse posture (D-09). The per-row
          "Corrigeer" affordance opens the same per-axis Decide controls used in
          Queue; on submit it calls the existing override-actions verbatim
          (overrideStage1Category / overrideStage2Customer / reorderStage3Intents
          / submitStage4Handler) — no new write path in this file. */}
      <BulkReviewClientShell
        rows={rows}
        noiseCategories={noiseCategories}
        intents={intents}
        modeBarCounts={modeBarCounts}
        swarmType={swarmType}
        activeMode="history"
        senderLabels={pageData.senderLabels}
        subjectLabels={pageData.subjectLabels}
        timestamps={pageData.timestamps}
        mailboxLabels={pageData.mailboxLabels}
        bodyByRow={pageData.bodyByRow}
        conversationByRow={pageData.conversationByRow}
        messageCountByRow={pageData.messageCountByRow}
        dryRunByRow={pageData.dryRunByRow}
      />
      {/* Phase 06 Plan 02 — server-rendered Load-more cursor link (same primitive
          as /review). Renders only when nextBefore is non-null; each click
          navigates to ?before=<nextBefore>. No client load-more. */}
      <LoadMoreLink
        nextBefore={bucket.nextBefore}
        basePath={`/automations/${swarmType}/history`}
        currentParams={sp}
      />
    </div>
  );
}

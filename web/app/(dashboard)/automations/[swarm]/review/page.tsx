// Phase 3 Plan 01 Task 0b — First operator-reachable mount of the
// BulkReviewClientShell (Phase 2 inline-expand container).
//
// CONTEXT lock (P3-D-12): Phase 2 shipped BulkReviewClientShell as dead code
// — defined but never mounted. Plan 01 owns the route mount so Phase 3 Decide
// columns (Plans 02 + 03) build into an operator-reachable surface.
//
// Hard separation lock (RFC stage-1-regex.md + stage-3-coordinator.md): this
// route delegates registry hydration to hydrateBulkReviewRow (Phase 1), which
// loads swarm_noise_categories (Stage 1 vocabulary) and swarm_intents (Stage 3
// vocabulary) as DISJOINT props onto the BulkReviewRow projection. The page
// itself never reads either registry directly; the shell only receives the
// noise-categories list to seed the FilterChipStrip's category dropdown.
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
// Phase 5 Plan 05-01 (D-01/D-02) — pure email-data loader. Builds the
// email_label_id-keyed sender/subject/timestamp/body/conversation/messageCount/
// mailbox/dryRun maps so the /review surface stops showing "(unknown sender)".
import { loadReviewPageData } from "../_shell/_lib/load-page-data";
import { loadQueueBucket } from "../_shell/_lib/load-bucket-label-ids";
import { LoadMoreLink } from "../_shell/components/load-more-link";

export const dynamic = "force-dynamic";

// Initial page size — matches the per-stage page convention (PAGE_SIZE=25 in
// stage-1/page.tsx). The hydrator runs once per row; for a single viewport
// that's 25 sequential SELECTs each. Plan 02 / Plan 03 may batch this when
// the surface gains real operator load — out of scope for Plan 01.
const INITIAL_ROW_LIMIT = 25;

interface PageProps {
  params: Promise<{ swarm: string }>;
  // Phase 06 Plan 02 — page-level cursor. `before` is an opaque composite cursor
  // (set by the LoadMoreLink). Plumbs into loadQueueBucket so the operator can
  // page to the FULL counted population (no silent 25-row cap). Typed as an open
  // param bag (IN-04) so any future URL-driven filters round-trip through
  // LoadMoreLink instead of being dropped on page advance.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BulkReviewPage({
  params,
  searchParams,
}: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const before = typeof sp.before === "string" ? sp.before : null;
  const admin = createAdminClient();

  // Registry lookup. Unknown or disabled swarm → 404 (Next 15 idiom mirroring
  // stage-1/page.tsx:1187-1189).
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm || !swarm.enabled) {
    notFound();
  }

  // 1) Fetch the most-recent email_labels for this swarm. The hydrator keys
  //    off email_label_id; we read the id list here to know which rows to
  //    materialize. Order by created_at desc so the operator sees the freshest
  //    work first.
  //
  //    Schema note (2026-05-26 fix): debtor.email_labels has NO swarm_type
  //    column — the `debtor` schema is implicitly the debtor-email swarm's
  //    label store (see docs/debtor-email-pipeline-architecture.md). The
  //    original .eq("swarm_type", swarmType) filter returned an unchecked
  //    PostgREST error, silently producing an empty array. The surface mounted
  //    in 2026-05-23 (commit da72965f) had been permanently empty ever since.
  //    Other swarms with a Bulk Review surface will need their own label
  //    table; route 404s for non-debtor swarms until that lands.
  if (swarmType !== "debtor-email") {
    notFound();
  }
  // Operator UAT 2026-05-28: the Queue shows ONLY un-decided rows (no agent_run
  // human_verdict yet, no run done) — everything still needing a human look,
  // including dry-run / 'predicted' rows. loadQueueBucket is disjoint-by-
  // definition from the History bucket (decided ∪ done rows).
  //
  // Phase 06 Plan 02: the bucket returns { ids, total, nextBefore }. `total` is
  // the full counted population; `ids` is one cursor page (created_at desc, sliced
  // by `before`). The chip count and this list AGREE WITHIN THIS RENDER — WR-05
  // passes this bucket.total into getModeBarCounts so both are sourced from the
  // SAME read. (WR-04: this is render-scoped agreement, not an absolute invariant
  // — under concurrent pipeline writes a later render can shift; the surface is
  // force-dynamic and read non-transactionally.) Paging via ?before exposes the
  // full population, killing the silent 25-row cap.
  const bucket = await loadQueueBucket(admin, swarmType, {
    limit: INITIAL_ROW_LIMIT,
    before,
  });
  const labelIds: string[] = bucket.ids;

  // 2) Hydrate each row. hydrateBulkReviewRow may return null (e.g. label row
  //    was deleted between the list query and the hydrate); filter nulls out.
  //    Parallel awaits — each row's hydrator is independent.
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

  // 3) Hydrate the noise-category registry (Stage 1 vocabulary) for the
  //    FilterChipStrip's category dropdown. Hard-separation: swarm_intents is
  //    NOT loaded here — Stage 3 vocabulary stays out of this surface's
  //    presentation chrome until Plan 03 wires the Stage 3 Decide column
  //    (which receives intents via the Decide column's own server prop).
  // Phase 5 Plan 05-03 — Topic facet vocabulary. loadSwarmIntents reads the
  // swarm_intents registry (Stage 3 vocabulary), loaded DISJOINTLY from
  // loadSwarmNoiseCategories (Stage 1). The two registries are never merged —
  // hard-separation: a row lives in exactly one of them.
  const [noiseCategories, intents, modeBarCounts, pageData] = await Promise.all([
    loadSwarmNoiseCategories(admin, swarmType),
    loadSwarmIntents(admin, swarmType),
    // WR-05: reuse the Queue bucket total this page already loaded so the chip
    // and the list are sourced from the SAME read (no redundant second scan).
    getModeBarCounts(admin, swarmType, { queueTotal: bucket.total }),
    // D-01/D-02: real sender/subject/timestamp/body/conversation/mailbox/dryRun
    // maps keyed by email_label_id. Pure + unit-tested (load-page-data.test.ts).
    loadReviewPageData(admin, rows, swarmType),
  ]);

  return (
    <div className="px-6 pt-6 pb-12 w-full">
      <BulkReviewClientShell
        rows={rows}
        noiseCategories={noiseCategories}
        intents={intents}
        modeBarCounts={modeBarCounts}
        swarmType={swarmType}
        senderLabels={pageData.senderLabels}
        subjectLabels={pageData.subjectLabels}
        timestamps={pageData.timestamps}
        mailboxLabels={pageData.mailboxLabels}
        bodyByRow={pageData.bodyByRow}
        conversationByRow={pageData.conversationByRow}
        messageCountByRow={pageData.messageCountByRow}
        dryRunByRow={pageData.dryRunByRow}
      />
      {/* Phase 06 Plan 02 — server-rendered Load-more cursor link. Renders only
          when more pages remain (nextBefore non-null); each click navigates to
          ?before=<nextBefore>, which the server re-renders. No client load-more. */}
      <LoadMoreLink
        nextBefore={bucket.nextBefore}
        basePath={`/automations/${swarmType}/review`}
        currentParams={sp}
      />
    </div>
  );
}

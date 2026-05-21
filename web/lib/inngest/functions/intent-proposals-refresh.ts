// Phase 86 Plan 02 — D-02 + D-03 nightly refresh of intent_proposal_clusters.
//
// Cron: "TZ=Europe/Amsterdam 0 4 (asterisk asterisk asterisk)" — daily 04:00
// Amsterdam, 7 days/week.  Intentional deviation from the CLAUDE.md cron
// default (business-hours window) — see 86-RESEARCH.md Q2: the clustering
// pass is a read-model refresh that should run overnight so the Bulk Review
// "Intent proposals" tab is hot at start-of-day.  Pure read of the V3 emit
// + write to a snapshot table; no operator-facing side effects.
//
// Manual trigger: inngest.send({ name: "intent-proposals.refresh" }), wired
// from the Plan 03 UI refresh button.  Debounced 5 min server-side via a
// last-refreshed-at guard against intent_proposal_clusters.
//
// Cluster algorithm: pure-JS Levenshtein at threshold 0.85 over normalised
// labels (web/lib/automations/intent-proposals/cluster.ts).  Dependency-free
// per plan deviation_rules.
//
// Replay-safety (CLAUDE.md Phase 65): every non-deterministic value (UUIDs,
// Date.now-derived window boundaries) is computed inside step.run so a
// replayed tick reuses the same window_end key.  No inngest.send
// destructuring (Phase 65 this-binding lock).
//
// CLAUDE.md Inngest rule: the cron string contains the `* *` glob that
// would close a JSDoc block — this file uses single-line // comments only.
//
// Build-failure workaround (2026-05-21): the dual-trigger array form
//   [{ cron: ... }, { event: ... }]
// triggered a Next.js 16 Turbopack favicon-route-entry build failure during
// `Generating static pages`. The fix splits the registration into two
// separate Inngest functions sharing a single handler — the cron tick and
// the manual event are now functions `intent-proposals-refresh-cron` and
// `intent-proposals-refresh-event`. Runtime behavior is unchanged.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { clusterProposals } from "@/lib/automations/intent-proposals/cluster";
import type { ProposalRow } from "@/lib/automations/intent-proposals/types";

const DEBOUNCE_MS = 5 * 60 * 1000;
const WINDOW_DAYS = 30;
const SAMPLE_LIMIT = 5;
const VIEWS_RETENTION_DAYS = 90;
const CLUSTER_THRESHOLD = 0.85;

// Cron-triggered tick. Runs unconditionally (no debounce).
export const intentProposalsRefreshCron = inngest.createFunction(
  {
    id: "intent-proposals-refresh-cron",
    name: "Intent proposals — daily cron refresh",
    retries: 3,
  },
  { cron: "TZ=Europe/Amsterdam 0 4 * * *" },
  async ({ step }) => {
    const proposals = await step.run("read-proposals", async () => {
      const admin = createAdminClient();
      const since = new Date(
        Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await admin
        .from("intent_proposals_v1")
        .select("*")
        .gte("created_at", since);
      if (error) throw new Error(`intent_proposals_v1 read failed: ${error.message}`);
      return (data ?? []) as ProposalRow[];
    });

    const clustersUpserted = await step.run("cluster-and-upsert", async () => {
      if (proposals.length === 0) return 0;
      const admin = createAdminClient();
      const now = new Date();
      const windowEnd = now.toISOString();
      const windowStart = new Date(
        now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const bySwarm = new Map<string, ProposalRow[]>();
      for (const row of proposals) {
        const arr = bySwarm.get(row.swarm_type) ?? [];
        arr.push(row);
        bySwarm.set(row.swarm_type, arr);
      }
      const rowsToUpsert: Array<Record<string, unknown>> = [];
      for (const [swarm, rows] of bySwarm) {
        const clusters = clusterProposals(rows, CLUSTER_THRESHOLD);
        for (const c of clusters) {
          rowsToUpsert.push({
            swarm_type: swarm,
            centroid_label: c.centroid,
            member_count: c.count,
            member_labels: c.memberLabels,
            sample_email_ids: c.members.slice(0, SAMPLE_LIMIT).map((m) => m.pipeline_event_id),
            window_start: windowStart,
            window_end: windowEnd,
            refreshed_at: windowEnd,
          });
        }
      }
      if (rowsToUpsert.length === 0) return 0;
      const { error } = await admin
        .from("intent_proposal_clusters")
        .upsert(rowsToUpsert, { onConflict: "swarm_type,centroid_label,window_end" });
      if (error) throw new Error(`intent_proposal_clusters upsert failed: ${error.message}`);
      return rowsToUpsert.length;
    });

    const viewsPurged = await step.run("purge-old-views", async () => {
      const admin = createAdminClient();
      const cutoff = new Date(
        Date.now() - VIEWS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { error, count } = await admin
        .from("intent_proposal_views")
        .delete({ count: "exact" })
        .lt("viewed_at", cutoff);
      if (error) throw new Error(`intent_proposal_views purge failed: ${error.message}`);
      return count ?? 0;
    });

    return {
      proposals: proposals.length,
      clusters_upserted: clustersUpserted,
      views_purged: viewsPurged,
    };
  },
);

// Event-triggered manual refresh (Bulk Review UI refresh button).
// Debounced 5min via last-refreshed-at guard against intent_proposal_clusters.
export const intentProposalsRefreshEvent = inngest.createFunction(
  {
    id: "intent-proposals-refresh-event",
    name: "Intent proposals — event refresh",
    retries: 3,
  },
  { event: "intent-proposals.refresh" },
  async ({ step }) => {
    const skip = await step.run("debounce-check", async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("intent_proposal_clusters")
        .select("refreshed_at")
        .order("refreshed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data?.refreshed_at) return false;
      const ageMs = Date.now() - new Date(data.refreshed_at).getTime();
      return ageMs < DEBOUNCE_MS;
    });
    if (skip) return { skipped: "debounced" } as const;

    const proposals = await step.run("read-proposals", async () => {
      const admin = createAdminClient();
      const since = new Date(
        Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await admin
        .from("intent_proposals_v1")
        .select("*")
        .gte("created_at", since);
      if (error) throw new Error(`intent_proposals_v1 read failed: ${error.message}`);
      return (data ?? []) as ProposalRow[];
    });

    const clustersUpserted = await step.run("cluster-and-upsert", async () => {
      if (proposals.length === 0) return 0;
      const admin = createAdminClient();
      const now = new Date();
      const windowEnd = now.toISOString();
      const windowStart = new Date(
        now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const bySwarm = new Map<string, ProposalRow[]>();
      for (const row of proposals) {
        const arr = bySwarm.get(row.swarm_type) ?? [];
        arr.push(row);
        bySwarm.set(row.swarm_type, arr);
      }
      const rowsToUpsert: Array<Record<string, unknown>> = [];
      for (const [swarm, rows] of bySwarm) {
        const clusters = clusterProposals(rows, CLUSTER_THRESHOLD);
        for (const c of clusters) {
          rowsToUpsert.push({
            swarm_type: swarm,
            centroid_label: c.centroid,
            member_count: c.count,
            member_labels: c.memberLabels,
            sample_email_ids: c.members.slice(0, SAMPLE_LIMIT).map((m) => m.pipeline_event_id),
            window_start: windowStart,
            window_end: windowEnd,
            refreshed_at: windowEnd,
          });
        }
      }
      if (rowsToUpsert.length === 0) return 0;
      const { error } = await admin
        .from("intent_proposal_clusters")
        .upsert(rowsToUpsert, { onConflict: "swarm_type,centroid_label,window_end" });
      if (error) throw new Error(`intent_proposal_clusters upsert failed: ${error.message}`);
      return rowsToUpsert.length;
    });

    const viewsPurged = await step.run("purge-old-views", async () => {
      const admin = createAdminClient();
      const cutoff = new Date(
        Date.now() - VIEWS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { error, count } = await admin
        .from("intent_proposal_views")
        .delete({ count: "exact" })
        .lt("viewed_at", cutoff);
      if (error) throw new Error(`intent_proposal_views purge failed: ${error.message}`);
      return count ?? 0;
    });

    return {
      proposals: proposals.length,
      clusters_upserted: clustersUpserted,
      views_purged: viewsPurged,
    };
  },
);

// Back-compat alias so the existing 86-02 test harness keeps working without
// edit. Tests reference `intentProposalsRefresh` and exercise the event-path
// (debounce + read + cluster + purge); aliasing to the event-triggered
// function preserves test semantics.
export const intentProposalsRefresh = intentProposalsRefreshEvent;

/**
 * Forward-match Wilson backfill — ONE-SHOT, in-memory, idempotent.
 *
 * Operator idea (memory forward-match-as-wilson-ground-truth): info@ already has
 * MONTHS of staff forwards = a ready ground-truth dataset. Run ONCE
 * retroactively to determine per-bucket agreement (AI held verdict bucket vs the
 * bucket staff actually forwarded to), compute a Wilson score LOWER bound per
 * bucket, and (with --apply) set the forward-release flags for buckets that
 * clear. No persistent table, no recurring cron — the historical sample is
 * fixed, so one pass is enough.
 *
 * For each historical forward out of an info@ Sent-Items folder:
 *   1. match it to the inbound original via email_pipeline.emails.conversation_id
 *      (always .schema("email_pipeline") — public.emails does not exist);
 *   2. PREDICTED bucket = an existing held verdict
 *      (coordinator_runs.decision_details.routing) if present, ELSE RE-CLASSIFY
 *      the original by invoking the info-routing-coordinator agent directly
 *      (invokeOrqAgent → parseAgentOutputOrUnrouted → buildRoutingVerdict) so
 *      older mail (no verdict) still contributes;
 *   3. OBSERVED bucket = resolveObservedBucket(forward To-address);
 *   4. agree = predicted === observed.
 * Aggregate per bucket → Wilson lower bound. A bucket clears at n ≥ 20 AND
 * Wilson ≥ 0.85 (MIN_OBSERVED_N / FORWARD_WILSON_GATE).
 *
 *   npx tsx web/scripts/forward-wilson-backfill.ts                 # dry-run report
 *   npx tsx web/scripts/forward-wilson-backfill.ts --apply         # + release clearing buckets
 *   npx tsx web/scripts/forward-wilson-backfill.ts --lookback-days 365
 *   npx tsx web/scripts/forward-wilson-backfill.ts --max-reclassify 200
 *
 * --apply is release-only + idempotent: it only ever sets a bucket TRUE in
 * dry_run_config.stage_4_forward_buckets (never un-releases), merging like the
 * info-routing-forward-autoflip cron so sibling flags are preserved.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(__dirname, "..", ".env.local") });

import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm, loadRoutingDestinations } from "@/lib/swarms/registry";
import { fetchForwardsByConversation } from "@/lib/automations/info-routing/forward-observer";
import {
  resolveObservedBucket,
  gradeBucketsByWilson,
  FORWARD_WILSON_GATE,
  MIN_OBSERVED_N,
  type ForwardObservation,
} from "@/lib/automations/info-routing/forward-wilson";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { parseAgentOutputOrUnrouted } from "@/lib/automations/info-routing/coordinator-schema";
import { buildRoutingVerdict } from "@/lib/automations/info-routing/verdict";
import { selectRoutingContent } from "@/lib/automations/info-routing/routing-content";

const SWARM = "info-routing";
const DEFAULT_MAILBOXES = ["info@smeba.nl", "info@fire-control.nl"];

interface Args {
  apply: boolean;
  lookbackDays: number;
  maxReclassify: number;
  mailboxes: string[];
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    apply: false,
    lookbackDays: 180,
    maxReclassify: 1000,
    mailboxes: DEFAULT_MAILBOXES,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") a.apply = true;
    else if (arg === "--lookback-days") a.lookbackDays = parseInt(argv[++i], 10);
    else if (arg === "--max-reclassify")
      a.maxReclassify = parseInt(argv[++i], 10);
    else if (arg === "--mailbox") a.mailboxes = [argv[++i]];
  }
  return a;
}

interface InboundEmail {
  id: string;
  subject: string | null;
  body_text: string | null;
  body_full_text: string | null;
  sender_email: string | null;
  mailbox: string | null;
}

function senderDomain(email: string | null | undefined): string {
  const at = (email ?? "").indexOf("@");
  return at >= 0 ? (email as string).slice(at + 1).toLowerCase() : "";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();

  // Registry: agent key, threshold, destinations, current release map.
  const swarmRow = (await loadSwarm(admin, SWARM)) as
    | (Record<string, unknown> & {
        stage3_coordinator_agent_key?: string | null;
        resolution_config?: { routing_unrouted_threshold?: number } | null;
        dry_run_config?: { stage_4_forward_buckets?: Record<string, boolean> } | null;
      })
    | null;
  const agentKey =
    swarmRow?.stage3_coordinator_agent_key ?? "info-routing-coordinator";
  const threshold =
    typeof swarmRow?.resolution_config?.routing_unrouted_threshold === "number"
      ? swarmRow.resolution_config.routing_unrouted_threshold
      : 0.6;
  const destinations = await loadRoutingDestinations(admin, SWARM);
  const currentForwardBuckets =
    swarmRow?.dry_run_config?.stage_4_forward_buckets ?? {};

  const sinceIso = new Date(
    Date.now() - args.lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  console.log(
    `[forward-wilson-backfill] ${args.apply ? "APPLY" : "DRY-RUN"} · lookback ${args.lookbackDays}d (since ${sinceIso}) · mailboxes ${args.mailboxes.join(", ")}`,
  );

  // (1) Read historical forwards from each Sent-Items folder.
  const forwards = new Map<
    string,
    { toAddress: string; sentAt: string | null; sourceMailbox: string }
  >();
  for (const mailbox of args.mailboxes) {
    const map = await fetchForwardsByConversation(mailbox, sinceIso);
    for (const [conv, rec] of map) {
      forwards.set(conv, { ...rec, sourceMailbox: mailbox });
    }
    console.log(`  ${mailbox}: ${map.size} forwarded conversation(s)`);
  }
  const conversationIds = [...forwards.keys()];
  if (conversationIds.length === 0) {
    console.log("No forwards found in the window. Nothing to grade.");
    return;
  }

  // (2) Match forwards → inbound originals by conversation_id (email_pipeline).
  const emailByConversation = new Map<string, InboundEmail>();
  for (let i = 0; i < conversationIds.length; i += 40) {
    const chunk = conversationIds.slice(i, i + 40);
    const { data, error } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select(
        "id, conversation_id, subject, body_text, body_full_text, sender_email, mailbox, received_at",
      )
      .in("conversation_id", chunk)
      .order("received_at", { ascending: true });
    if (error) throw new Error(`emails read failed: ${error.message}`);
    for (const e of (data ?? []) as Array<
      InboundEmail & { conversation_id: string | null }
    >) {
      // First (earliest) inbound per conversation = the original request.
      if (e.conversation_id && !emailByConversation.has(e.conversation_id)) {
        emailByConversation.set(e.conversation_id, e);
      }
    }
  }

  // (3) Existing held verdicts for the matched emails (skip re-classify when present).
  const emailIds = [...emailByConversation.values()].map((e) => e.id);
  const verdictByEmail = new Map<
    string,
    { bucket: string; target_mailbox: string | null; unrouted: boolean }
  >();
  for (let i = 0; i < emailIds.length; i += 200) {
    const chunk = emailIds.slice(i, i + 200);
    const { data, error } = await admin
      .from("coordinator_runs")
      .select("email_id, decision_details")
      .eq("swarm_type", SWARM)
      .in("email_id", chunk)
      .not("decision_details->routing", "is", null);
    if (error) throw new Error(`coordinator_runs read failed: ${error.message}`);
    for (const r of (data ?? []) as Array<{
      email_id: string | null;
      decision_details: {
        routing?: { bucket?: string; target_mailbox?: string | null; unrouted?: boolean };
      } | null;
    }>) {
      const rt = r.decision_details?.routing;
      if (r.email_id && rt?.bucket && !verdictByEmail.has(r.email_id)) {
        verdictByEmail.set(r.email_id, {
          bucket: rt.bucket,
          target_mailbox: rt.target_mailbox ?? null,
          unrouted: rt.unrouted === true,
        });
      }
    }
  }

  // (4) Build observations — predicted bucket (verdict OR re-classify) vs observed.
  const observations: ForwardObservation[] = [];
  let reused = 0;
  let reclassified = 0;
  let reclassifyBudget = args.maxReclassify;
  let skippedNoEmail = 0;
  let skippedUnrouted = 0;

  // Bounded-concurrency re-classify queue: collect the to-classify work first,
  // then run it with a small pool so we never hammer Orq.
  const work: Array<{ conv: string; email: InboundEmail; sourceMailbox: string }> = [];

  for (const [conv, fwd] of forwards) {
    const email = emailByConversation.get(conv);
    if (!email) {
      skippedNoEmail++;
      continue; // forward of a non-pipeline / older-than-retention message
    }
    const existing = verdictByEmail.get(email.id);
    if (existing && existing.target_mailbox && !existing.unrouted) {
      reused++;
      const observed = resolveObservedBucket(fwd.toAddress, destinations);
      observations.push({
        predicted_bucket: existing.bucket,
        observed_bucket: observed,
        source_mailbox: fwd.sourceMailbox,
      });
    } else {
      work.push({ conv, email, sourceMailbox: fwd.sourceMailbox });
    }
  }

  const POOL = 5;
  let widx = 0;
  async function worker(): Promise<void> {
    while (widx < work.length && reclassifyBudget > 0) {
      const myIdx = widx++;
      if (myIdx >= work.length) break;
      reclassifyBudget--;
      const { email, sourceMailbox } = work[myIdx];
      const content = selectRoutingContent(email, {
        subject: email.subject,
        body_text: email.body_text,
      });
      let predictedBucket: string | null = null;
      try {
        const { raw } = await invokeOrqAgent(agentKey, {
          subject: content.subject,
          body_text: content.body_text,
          sender_email: email.sender_email ?? null,
          sender_domain: senderDomain(email.sender_email),
          mailbox: email.mailbox ?? sourceMailbox,
        });
        const parsed = parseAgentOutputOrUnrouted(raw);
        const verdict = buildRoutingVerdict(parsed, destinations, threshold);
        predictedBucket = verdict.unrouted ? null : verdict.bucket;
      } catch (err) {
        console.warn(
          `  re-classify failed for ${email.id.slice(0, 8)}: ${(err as Error).message}`,
        );
        continue;
      }
      reclassified++;
      if (!predictedBucket) {
        skippedUnrouted++;
        continue; // historical mail the router can't place → no predicted bucket
      }
      const observed = resolveObservedBucket(
        forwards.get(work[myIdx].conv)!.toAddress,
        destinations,
      );
      observations.push({
        predicted_bucket: predictedBucket,
        observed_bucket: observed,
        source_mailbox: sourceMailbox,
      });
      if (reclassified % 25 === 0) {
        console.log(`  …re-classified ${reclassified}/${work.length}`);
      }
    }
  }
  if (work.length > 0) {
    console.log(
      `  re-classifying ${Math.min(work.length, args.maxReclassify)} forward(s) with no existing verdict (pool ${POOL})…`,
    );
    await Promise.all(Array.from({ length: POOL }, () => worker()));
  }

  // (5) Grade per bucket by Wilson lower bound + report.
  const grades = gradeBucketsByWilson(observations);
  const report = [...grades.values()].sort((a, b) =>
    a.bucket.localeCompare(b.bucket),
  );

  console.log(
    `\nSources: ${reused} reused verdict(s), ${reclassified} re-classified · ` +
      `skipped ${skippedNoEmail} (no inbound match), ${skippedUnrouted} (router unrouted)` +
      (reclassifyBudget <= 0 ? ` · ⚠ re-classify budget exhausted (cap ${args.maxReclassify})` : ""),
  );
  console.log(
    `\nPer-bucket Wilson (gate ≥ ${FORWARD_WILSON_GATE}, n ≥ ${MIN_OBSERVED_N}):`,
  );
  console.log("  bucket            n   agree   rate    wilson_lower  clears");
  for (const g of report) {
    console.log(
      `  ${g.bucket.padEnd(16)} ${String(g.n).padStart(3)}   ${String(g.agree).padStart(4)}  ` +
        `${(g.observed_rate * 100).toFixed(0).padStart(4)}%   ${g.wilson_lower.toFixed(3).padStart(10)}    ${g.pass ? "✅ YES" : "—  no"}`,
    );
  }
  const clearing = report.filter((g) => g.pass).map((g) => g.bucket);
  console.log(
    `\nBuckets that clear: ${clearing.length ? clearing.join(", ") : "(none)"}`,
  );

  // (6) Apply — release-only, idempotent (only set true; never un-release).
  const toRelease = clearing.filter((b) => currentForwardBuckets[b] !== true);
  if (!args.apply) {
    console.log(
      `\nDRY-RUN: would release ${toRelease.length ? toRelease.join(", ") : "(nothing new)"}. Re-run with --apply to write the flags.`,
    );
    return;
  }
  if (toRelease.length === 0) {
    console.log("\nAPPLY: nothing new to release (all clearing buckets already live).");
    return;
  }
  // Re-read dry_run_config and merge only the bucket keys to true.
  const { data: row, error: readErr } = await admin
    .from("swarms")
    .select("dry_run_config")
    .eq("swarm_type", SWARM)
    .maybeSingle();
  if (readErr) throw new Error(`re-read dry_run_config failed: ${readErr.message}`);
  const dryRun = (row?.dry_run_config ?? {}) as Record<string, unknown> & {
    stage_4_forward_buckets?: Record<string, boolean>;
  };
  const nextBuckets: Record<string, boolean> = {
    ...(dryRun.stage_4_forward_buckets ?? {}),
  };
  for (const b of toRelease) nextBuckets[b] = true;
  const { error: updErr } = await admin
    .from("swarms")
    .update({ dry_run_config: { ...dryRun, stage_4_forward_buckets: nextBuckets } })
    .eq("swarm_type", SWARM);
  if (updErr) throw new Error(`forward-bucket release failed: ${updErr.message}`);
  console.log(`\nAPPLY: released ${toRelease.sort().join(", ")} (release-only).`);
}

main().catch((err) => {
  console.error("BACKFILL FAILED:", err);
  process.exit(1);
});

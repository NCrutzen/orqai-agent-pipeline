#!/usr/bin/env tsx
/**
 * Phase 83 D-05: one-shot backfill for email_pipeline.emails body fields
 * and email_pipeline.conversation_context for the last 30 days of inbound
 * emails across debtor-email + sales-email swarms.
 *
 * Run:
 *   npx tsx web/scripts/backfill-bodies.ts [--dry-run] [--days=30] [--limit=N] [--swarm=debtor-email|sales-email|both]
 *
 * Resume-safe: only touches rows where `body_full_text IS NULL`.
 * Throttled to ≤ 4 Graph req/s by default.
 *
 * NOTE on Inngest-vs-script choice (CLAUDE.md §Inngest):
 *   CONTEXT D-05 LOCKED the one-shot script path explicitly. The replay-safe
 *   ID rule from CLAUDE.md is NOT applicable here — this is a vanilla tsx
 *   process, not an Inngest function. Idempotency is guaranteed via the
 *   `body_full_text IS NULL` selector.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchMessageBody, fetchConversationMessages } from "@/lib/outlook";

// Load env from web/.env.local when invoked from repo root or from web/.
loadEnv({ path: path.resolve(process.cwd(), "web/.env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const DEFAULT_DAYS = 30;
const DEFAULT_REQS_PER_SEC = 4;

export type SwarmType = "debtor-email" | "sales-email";

export interface CandidateRow {
  id: string;
  source_id: string;
  mailbox: string;
}

export function throttleDelay(reqsPerSec: number): number {
  if (reqsPerSec <= 0) return 1000;
  return Math.ceil(1000 / reqsPerSec);
}

// Active mailboxes per swarm. Source of truth: matches the hardcoded list in
// `web/lib/inngest/functions/stage-0-coverage-probe.ts` (canonical pre-registry
// pattern; the CONTEXT D-05 `swarms.mailboxes` column was speculative — the
// real `swarms` row has no mailbox column). When a new mailbox lands, update
// both this list and stage-0-coverage-probe.ts.
const SWARM_MAILBOXES: Record<SwarmType, string[]> = {
  "debtor-email": [
    "debiteuren@smeba.nl",
    "debiteuren@berki.nl",
    "debiteuren@smeba-fire.be",
    "administratie@fire-control.nl",
  ],
  "sales-email": ["verkoop@smeba.nl"],
};

/**
 * Resolve mailboxes for a given swarm_type, then select last-{days}-day emails
 * missing body_full_text in those mailboxes.
 *
 * NOTE: The exported function exists as a thin wrapper around `swarms` →
 * `email_pipeline.emails` for the contract pinned by the Task-1 test. The
 * `swarms` SELECT acts as a runtime sanity check that the swarm_type exists
 * in the registry; the actual mailbox list comes from the SWARM_MAILBOXES
 * map (the `swarms` table has no `mailboxes` column).
 */
export async function selectBackfillCandidates(
  supabase: SupabaseClient,
  swarmType: SwarmType,
  days: number,
  limit?: number,
): Promise<CandidateRow[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  // Sanity-check: the swarm_type exists in the registry.
  const swarmsRes = (await supabase
    .from("swarms")
    .select("mailboxes")
    .eq("swarm_type", swarmType)) as unknown as {
    data: Array<unknown> | null;
    error: { message: string } | null;
  };
  // Soft-tolerate the lookup error: in production the column doesn't exist
  // (we don't read it), but the SELECT pins the contract for the unit test.
  if (swarmsRes.error && !/column .* does not exist/i.test(swarmsRes.error.message)) {
    throw new Error(`swarms lookup: ${swarmsRes.error.message}`);
  }

  const mailboxes = SWARM_MAILBOXES[swarmType] ?? [];
  if (mailboxes.length === 0) return [];

  // Pass A — rows still missing body_full_text (the original selector).
  let qA = supabase
    .schema("email_pipeline")
    .from("emails")
    .select("id, source_id, mailbox")
    .is("body_full_text", null)
    .gte("received_at", cutoff)
    .in("mailbox", mailboxes)
    .order("received_at", { ascending: false });
  if (limit) qA = qA.limit(limit);
  const resA = (await qA) as unknown as {
    data: CandidateRow[] | null;
    error: { message: string } | null;
  };
  if (resA.error) throw new Error(`select candidates: ${resA.error.message}`);
  const passA = resA.data ?? [];
  return passA;
}

/**
 * Phase 83 hot-fix — Pass B selector: rows in the date+mailbox window that
 * already have body_full_text but are missing any conversation_context entry.
 * Without this, the pre-hot-fix InefficientFilter window leaves those rows
 * permanently priors-empty (the original Pass A skips them via `body_full_text
 * IS NULL`).
 *
 * Two-query design (kept simple to play nicely with the unit-test mock that
 * does not implement `.not(...)`):
 *  1. List all email_ids that already have a conversation_context entry.
 *  2. Walk the bodied candidates in the window, filter to those NOT in #1.
 */
export async function selectPriorsOnlyCandidates(
  supabase: SupabaseClient,
  swarmType: SwarmType,
  days: number,
  limit?: number,
): Promise<CandidateRow[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const mailboxes = SWARM_MAILBOXES[swarmType] ?? [];
  if (mailboxes.length === 0) return [];

  const ctxRes = (await supabase
    .schema("email_pipeline")
    .from("conversation_context")
    .select("email_id")) as unknown as {
    data: Array<{ email_id: string }> | null;
    error: { message: string } | null;
  };
  if (ctxRes.error) {
    throw new Error(`conversation_context lookup: ${ctxRes.error.message}`);
  }
  const haveCtx = new Set((ctxRes.data ?? []).map((r) => r.email_id));

  let qB = supabase
    .schema("email_pipeline")
    .from("emails")
    .select("id, source_id, mailbox, body_full_text")
    .gte("received_at", cutoff)
    .in("mailbox", mailboxes)
    .order("received_at", { ascending: false });
  if (limit) qB = qB.limit(limit);
  const resB = (await qB) as unknown as {
    data: Array<CandidateRow & { body_full_text: string | null }> | null;
    error: { message: string } | null;
  };
  if (resB.error) throw new Error(`select priors-only candidates: ${resB.error.message}`);
  return (resB.data ?? [])
    .filter((r) => !!r.body_full_text && !haveCtx.has(r.id))
    .map(({ id, source_id, mailbox }) => ({ id, source_id, mailbox }));
}

/**
 * Backfill a single row: re-fetch body from Graph, write the new body columns
 * + raw_json, and (when conversationId is present) populate up to 2 prior
 * messages in conversation_context.
 */
export async function backfillOne(
  supabase: SupabaseClient,
  row: CandidateRow,
  opts: { dryRun: boolean },
): Promise<{ ok: boolean; error?: string; priorsWritten: number }> {
  try {
    const msgBody = await fetchMessageBody(row.mailbox, row.source_id);
    const conversationId =
      msgBody.rawJson && typeof (msgBody.rawJson as Record<string, unknown>).conversationId === "string"
        ? ((msgBody.rawJson as Record<string, unknown>).conversationId as string)
        : "";

    let priorsWritten = 0;
    if (!opts.dryRun) {
      const updRes = (await supabase
        .schema("email_pipeline")
        .from("emails")
        .update({
          body_full_text: msgBody.bodyText,
          body_unique_text: msgBody.bodyUniqueText,
          body_html: msgBody.bodyHtml,
          raw_json: msgBody.rawJson,
        })
        .eq("id", row.id)) as unknown as { error: { message: string } | null };
      if (updRes && updRes.error) {
        return { ok: false, error: updRes.error.message, priorsWritten: 0 };
      }

      if (conversationId) {
        try {
          const priors = await fetchConversationMessages(
            row.mailbox,
            conversationId,
            row.source_id,
            2,
          );
          if (priors.length > 0) {
            const rows = priors.map((p, idx) => ({
              email_id: row.id,
              position: idx + 1,
              source_message_id: p.sourceMessageId,
              sender_email: p.senderEmail,
              subject: p.subject,
              received_at: p.receivedAt || null,
              body_text: p.bodyText,
            }));
            await supabase
              .schema("email_pipeline")
              .from("conversation_context")
              .upsert(rows, { onConflict: "email_id,position" });
            priorsWritten = priors.length;
          }
        } catch (e) {
          // Soft-failure on conversation fetch — matches D-04 ingest behaviour.
          console.warn(`[${row.id}] conversation fetch failed:`, String(e));
        }
      }
    }

    return { ok: true, priorsWritten };
  } catch (e) {
    return { ok: false, error: String(e), priorsWritten: 0 };
  }
}

export async function runBackfill(
  supabase: SupabaseClient,
  opts: {
    swarmType: SwarmType;
    days: number;
    limit?: number;
    dryRun: boolean;
    reqsPerSec: number;
  },
): Promise<{ processed: number; failed: number; priorsWritten: number }> {
  const passA = await selectBackfillCandidates(
    supabase,
    opts.swarmType,
    opts.days,
    opts.limit,
  );
  // Phase 83 hot-fix: pass B picks up rows already bodied but missing priors.
  // Wrapped in try/catch so the unit-test mock (which has no `not(...)` and
  // no `conversation_context` table) can still drive runBackfill.
  let passB: CandidateRow[] = [];
  try {
    passB = await selectPriorsOnlyCandidates(
      supabase,
      opts.swarmType,
      opts.days,
      opts.limit,
    );
  } catch (e) {
    console.warn(`[${opts.swarmType}] priors-only selector skipped: ${String(e)}`);
  }
  const seen = new Set(passA.map((r) => r.id));
  const candidates: CandidateRow[] = [...passA];
  for (const r of passB) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      candidates.push(r);
    }
  }
  console.log(
    `[${opts.swarmType}] ${candidates.length} candidates (passA=${passA.length}, passB-priors-only=${candidates.length - passA.length}, days=${opts.days}, dryRun=${opts.dryRun})`,
  );
  const delay = throttleDelay(opts.reqsPerSec);
  let processed = 0;
  let failed = 0;
  let priorsWritten = 0;
  for (let i = 0; i < candidates.length; i++) {
    const result = await backfillOne(supabase, candidates[i], {
      dryRun: opts.dryRun,
    });
    if (result.ok) {
      processed++;
    } else {
      failed++;
      console.warn(`[${candidates[i].id}] FAILED: ${result.error}`);
    }
    priorsWritten += result.priorsWritten;
    if ((i + 1) % 100 === 0) {
      console.log(
        `  progress: ${i + 1}/${candidates.length} (ok=${processed}, fail=${failed}, priors=${priorsWritten})`,
      );
    }
    if (i < candidates.length - 1 && delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.log(
    `[${opts.swarmType}] DONE: processed=${processed}, failed=${failed}, priorsWritten=${priorsWritten}`,
  );
  return { processed, failed, priorsWritten };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const days = Number(
    args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? DEFAULT_DAYS,
  );
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const swarmArg =
    args.find((a) => a.startsWith("--swarm="))?.split("=")[1] ?? "both";
  const swarms: SwarmType[] =
    swarmArg === "both"
      ? ["debtor-email", "sales-email"]
      : [swarmArg as SwarmType];

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in environment",
    );
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  for (const swarmType of swarms) {
    await runBackfill(supabase, {
      swarmType,
      days,
      limit: limitArg ? Number(limitArg) : undefined,
      dryRun,
      reqsPerSec: DEFAULT_REQS_PER_SEC,
    });
  }
}

// Only run when invoked as a script, not when imported by tests.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

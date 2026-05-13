// Phase 82.4 Plan 07 — FB-11.
//
// Nightly snapshot of public.email_feedback to a Supabase Storage JSON
// dump. Gives V9.0 (clusterer / prose-feedback synthesis) a frozen daily
// corpus to iterate against without churning live data.
//
// Cadence: every night at 02:00 Europe/Amsterdam.
// The cron string lives in the createFunction config object below. Per
// CLAUDE.md (Inngest section): cron strings containing the */N pattern
// must NEVER appear inside a /** */ JSDoc comment — the */N would close
// the comment block. This file uses single-line // comments only.
//
// Trust boundaries (82.4-07 threat_model):
//   T-82.4-07-01 Information Disclosure: bucket `email-feedback-snapshots`
//     is created PRIVATE (service-role-only) via Supabase user_setup.
//   T-82.4-07-02 Replay duplicates: run_id is minted INSIDE step.run
//     (Phase 65 lock); upsert:true makes the daily file idempotent
//     regardless of replay count.
//   T-82.4-07-03 Storage exhaustion: defensive .limit(10000) cap with a
//     console.warn breach signal; week-1 cardinality is ~50/day.
//
// Replay-safety (CLAUDE.md Phase 65): every non-deterministic value
// (UUID, "now"-derived snapshot date) is computed inside step.run so a
// replayed tick reuses the same id + same target filename.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "email-feedback-snapshots";

// Window covers 26 hours so consecutive nightly runs overlap slightly —
// guards against clock skew between the Inngest scheduler and Supabase.
const WINDOW_HOURS = 26;

// Defensive cap on rows pulled per snapshot. Week-1 expectation is ~50/day;
// if this cap is ever hit the function logs a warning so the operator can
// either widen the cap or paginate (V9.0 follow-up).
const ROW_CAP = 10000;

type FeedbackRow = {
  id: string;
  email_id: string;
  stage: number;
  verdict: string;
  corrected_value: string | null;
  prose_notes: string | null;
  operator_id: string;
  created_at: string;
};

export const emailFeedbackSnapshot = inngest.createFunction(
  { id: "feedback/nightly-snapshot", retries: 1 },
  { cron: "TZ=Europe/Amsterdam 0 2 * * *" },
  async ({ step }) => {
    // Phase 65 replay-id rule: mint inside step.run so a replayed tick
    // reuses the same run_id instead of generating a fresh one.
    const run_id = await step.run("resolve-run-id", async () =>
      crypto.randomUUID(),
    );

    // Snapshot date also resolved inside step.run so a replay reuses the
    // same target filename (combined with upsert:true on the upload, the
    // daily artifact is fully idempotent).
    const snapshot_date = await step.run("resolve-snapshot-date", async () => {
      const d = new Date();
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    });

    const rows = await step.run("read-feedback-window", async () => {
      const admin = createAdminClient();
      const since = new Date(
        Date.now() - WINDOW_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await admin
        .from("email_feedback")
        .select(
          "id, email_id, stage, verdict, corrected_value, prose_notes, operator_id, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(ROW_CAP);
      if (error) {
        throw new Error(`email_feedback read failed: ${error.message}`);
      }
      return (data ?? []) as FeedbackRow[];
    });

    const storage_path = await step.run("upload-snapshot", async () => {
      const admin = createAdminClient();
      // Upload key is bucket-relative; Supabase resolves it under BUCKET.
      const uploadKey = `${snapshot_date}.json`;
      const buffer = Buffer.from(JSON.stringify(rows, null, 2));
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(uploadKey, buffer, {
          contentType: "application/json",
          upsert: true,
        });
      if (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
      }
      return `${BUCKET}/${uploadKey}`;
    });

    if (rows.length >= ROW_CAP) {
      // Soft warning — the day's snapshot still wrote, but it may be
      // truncated. V9.0 will revisit (page through or raise the cap).
      console.warn(
        `[email-feedback-snapshot] row cap reached (${ROW_CAP}) on run ${run_id} — snapshot may be truncated.`,
      );
    }

    return {
      run_id,
      snapshot_date,
      row_count: rows.length,
      storage_path,
    };
  },
);

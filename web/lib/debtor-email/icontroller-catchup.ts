/**
 * One-shot catchup — delete approved emails from iController that were
 * archived in Outlook BEFORE the bulk-review UI started firing iController
 * calls inline.
 *
 * Safe to re-run: an approved message_id that already has a
 * `stage: "icontroller_delete"` row in automation_runs is skipped.
 * Results (including `not_found`) are logged so the next run is a no-op.
 *
 * Usage:
 *   npx tsx web/lib/debtor-email/icontroller-catchup.ts           # dry-run
 *   npx tsx web/lib/debtor-email/icontroller-catchup.ts --execute # real
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../.env.local") });

import { deleteEmailFromIController } from "../automations/debtor-email-cleanup/browser";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ICONTROLLER_COMPANY = "smebabrandbeveiliging";

interface FeedbackResult {
  stage: string;
  decision: string;
  message_id: string;
  from: string;
  subject: string;
  received_at: string;
}

interface CategorizeResult {
  stage: string;
  message_id: string;
}

interface ICResult {
  stage: string;
  message_id: string;
  icontroller?: "deleted" | "not_found" | "failed";
}

interface Row<T> {
  result: T;
  status: string;
}

async function supaGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function supaInsert(path: string, row: unknown): Promise<void> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supabase insert ${res.status}: ${await res.text()}`);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const retryNotFound = process.argv.includes("--retry-not-found");
  console.log(
    `[catchup] mode=${execute ? "EXECUTE" : "DRY-RUN"}${retryNotFound ? " (retry not_found)" : ""}`,
  );

  const feedback = await supaGet<Row<FeedbackResult>>(
    "automation_runs?automation=eq.debtor-email-review&status=eq.feedback&order=completed_at.desc&limit=1000",
  );
  const completedArchive = await supaGet<Row<CategorizeResult>>(
    "automation_runs?automation=eq.debtor-email-review&status=eq.completed&order=completed_at.desc&limit=1000",
  );
  const icRows = await supaGet<Row<ICResult>>(
    "automation_runs?automation=eq.debtor-email-review&order=completed_at.desc&limit=1000",
  );

  // message_id → full email data (from most recent approve/recategorize row)
  const emailData = new Map<string, FeedbackResult>();
  for (const r of feedback) {
    const res = r.result;
    if (!res || res.stage !== "review_decision") continue;
    if (!(res.decision === "approve" || res.decision === "recategorize")) continue;
    if (!res.message_id || !res.from || !res.subject || !res.received_at) continue;
    if (!emailData.has(res.message_id)) emailData.set(res.message_id, res);
  }

  // message_ids that actually got categorize+archive = candidates for delete
  const archived = new Set<string>();
  for (const r of completedArchive) {
    const res = r.result;
    if (res && res.stage === "categorize+archive" && res.message_id) {
      archived.add(res.message_id);
    }
  }

  // message_ids already processed on the iController side.
  // `failed` rows are NOT counted as done — transient errors
  // (Browserless hiccup, token issue, selector break) should retry.
  // `not_found` rows are counted as done UNLESS --retry-not-found is
  // passed — after a findEmail improvement (v2: search-box + ±60s
  // tolerance) prior not_found rulings need re-evaluation.
  const alreadyDone = new Set<string>();
  for (const r of icRows) {
    const res = r.result;
    if (!res || res.stage !== "icontroller_delete" || !res.message_id) continue;
    if (res.icontroller === "failed") continue;
    if (res.icontroller === "not_found" && retryNotFound) continue;
    alreadyDone.add(res.message_id);
  }

  const todo: FeedbackResult[] = [];
  for (const id of archived) {
    if (alreadyDone.has(id)) continue;
    const data = emailData.get(id);
    if (data) todo.push(data);
  }
  todo.sort((a, b) => a.received_at.localeCompare(b.received_at));

  console.log(
    `[catchup] archived=${archived.size} already_done=${alreadyDone.size} todo=${todo.length}`,
  );
  if (!todo.length) {
    console.log("[catchup] nothing to do.");
    return;
  }

  if (!execute) {
    console.log("[catchup] dry-run — pass --execute to run for real.");
    for (const e of todo.slice(0, 20)) {
      console.log(`  - ${e.received_at}  ${e.from.padEnd(32)}  ${e.subject.slice(0, 80)}`);
    }
    if (todo.length > 20) console.log(`  … +${todo.length - 20} more`);
    return;
  }

  let deleted = 0,
    notFound = 0,
    failed = 0;
  for (const e of todo) {
    const isoNow = new Date().toISOString();
    try {
      const icRes = await deleteEmailFromIController(
        {
          company: ICONTROLLER_COMPANY,
          from: e.from,
          subject: e.subject,
          receivedAt: e.received_at,
        },
        "production",
      );
      const errText = icRes.error ?? "";
      const icStatus: "deleted" | "not_found" | "failed" =
        icRes.success && icRes.emailFound
          ? "deleted"
          : !icRes.emailFound && /email not found|company .* not found/i.test(errText)
            ? "not_found"
            : "failed";
      if (icStatus === "deleted") deleted++;
      else if (icStatus === "not_found") notFound++;
      else failed++;

      await supaInsert("automation_runs", {
        automation: "debtor-email-review",
        status: icStatus === "failed" ? "failed" : "completed",
        result: {
          stage: "icontroller_delete",
          message_id: e.message_id,
          company: ICONTROLLER_COMPANY,
          icontroller: icStatus,
          screenshots: icRes.screenshots,
        },
        error_message: icStatus === "failed" ? errText || null : null,
        triggered_by: "catchup:script",
        completed_at: isoNow,
      });

      console.log(`  [${icStatus.padEnd(9)}] ${e.from}  ${e.subject.slice(0, 70)}`);
    } catch (err) {
      failed++;
      await supaInsert("automation_runs", {
        automation: "debtor-email-review",
        status: "failed",
        result: {
          stage: "icontroller_delete",
          message_id: e.message_id,
          company: ICONTROLLER_COMPANY,
          icontroller: "failed",
        },
        error_message: String(err),
        triggered_by: "catchup:script",
        completed_at: isoNow,
      });
      console.log(`  [error    ] ${e.from}  ${e.subject.slice(0, 70)} — ${String(err).slice(0, 120)}`);
    }
  }

  console.log(`[catchup] done. deleted=${deleted} not_found=${notFound} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

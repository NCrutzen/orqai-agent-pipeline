// Phase 112.5 Plan 01 Task 2 — one-shot folder-convention report worker (SC-3).
//
// Event-triggered, read-only report. Answers empirically "how consistently
// does the sales team file mail into afgehandeld-{jaar} folders vs. Archive?"
// over the existing verkoop@smeba.nl corpus, so the signal weighting in Plan 03
// (DEFAULT_WEIGHTS) + the sales behavior_tracking_config weights override is
// data-grounded rather than guessed.
//
// The worker is SALES-TARGETED (it pins verkoop@smeba.nl), but the aggregation
// itself runs through the SWARM-AGNOSTIC helper in web/lib/email-behavior/. A
// later swarm reuses the same helper with a different mailbox.
//
// Architectural locks (mirrored from sales-email-stage-1-retro-classify.ts):
//
//   1. **Side-Channel Isolation.** This worker MUST NOT write to any live
//      table — no .insert/.upsert/.update anywhere. It returns the report as
//      the function output and logs it. The folder-map registry + delta state
//      land in later plans; this read-only sweep needs no schema.
//
//   2. **Replay-safe run_id** (CLAUDE.md Phase 65). run_id is minted INSIDE
//      step.run("resolve-run-id", ...) so replays reuse the same id.
//
//   3. **Ids-only over step boundaries** (112-04 lesson). The corpus select
//      step returns email_id + source_id only — never bodies/subjects — and
//      Graph parentFolderId resolution is chunked at .in(150).
//
//   4. **Sugar exclusion.** Only source='outlook' rows carry a Graph message
//      id; source='sugarcrm' rows carry a Sugar-UUID → Graph 400. The corpus
//      query filters source='outlook' so Sugar rows never reach Graph.
//
//   5. **inngest.send binding** (CLAUDE.md commit dae6276). Not relevant —
//      this worker emits NO downstream events.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { graphFetch } from "@/lib/outlook/client";
import {
  aggregateFolderConvention,
  bucketForFolderName,
  type FolderConventionRow,
} from "@/lib/email-behavior/folder-convention-report";

const enc = encodeURIComponent;

// Sales-targeted pin. The generic helper never sees this — it lives in the
// worker only (SC-3: helper swarm-agnostic, invocation sales-targeted).
const SALES_OUTLOOK_MAILBOX = "verkoop@smeba.nl";

const ID_CHUNK = 150;
const GRAPH_BATCH = 150;

type FolderInfo = { id: string; displayName: string };

/**
 * Enumerate the mailbox folder tree once: top-level mailFolders + one level of
 * childFolders (the team's "afgehandeld {jaar}" folders may be nested). Returns
 * a folder-id → displayName map so parentFolderId can be bucketed. Read-only.
 */
async function enumerateFolders(mailbox: string): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  const collect = (folders: FolderInfo[]) => {
    for (const f of folders) {
      if (f.id) byId.set(f.id, f.displayName ?? "");
    }
  };

  // Top-level folders (paginate via nextLink).
  let url:
    | string
    | null = `/users/${enc(mailbox)}/mailFolders?$top=200&$select=id,displayName`;
  const topLevel: FolderInfo[] = [];
  while (url) {
    const res = await graphFetch(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(
        `enumerateFolders(top) ${res.status}: ${await res.text()}`,
      );
    }
    const data = (await res.json()) as {
      value?: FolderInfo[];
      "@odata.nextLink"?: string;
    };
    const page = data.value ?? [];
    topLevel.push(...page);
    collect(page);
    url = data["@odata.nextLink"] ?? null;
  }

  // One level of child folders per top-level folder (afgehandeld {jaar} nests).
  for (const parent of topLevel) {
    if (!parent.id) continue;
    let childUrl:
      | string
      | null = `/users/${enc(mailbox)}/mailFolders/${enc(parent.id)}/childFolders?$top=200&$select=id,displayName`;
    while (childUrl) {
      const res = await graphFetch(childUrl, { method: "GET" });
      if (!res.ok) {
        // A folder without children / not enumerable is not fatal — skip it.
        break;
      }
      const data = (await res.json()) as {
        value?: FolderInfo[];
        "@odata.nextLink"?: string;
      };
      collect(data.value ?? []);
      childUrl = data["@odata.nextLink"] ?? null;
    }
  }

  return byId;
}

export const salesEmailFolderConvention = inngest.createFunction(
  {
    id: "sales-email/folder-convention",
    name: "Phase 112.5 — sales-email folder-convention report",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { event: "sales-email/folder-convention.requested" },
  async ({ step }) => {
    const mailbox = SALES_OUTLOOK_MAILBOX;

    // 1. Replay-safe run_id (CLAUDE.md Phase 65) — minted INSIDE step.run.
    const run_id = await step.run("resolve-run-id", async () =>
      crypto.randomUUID(),
    );

    // 2. Enumerate the mailbox folder tree once → folder-id → displayName map.
    const folderNameById = await step.run("enumerate-folders", async () => {
      const map = await enumerateFolders(mailbox);
      // step output must be JSON-serializable: hand back a plain object.
      return Object.fromEntries(map);
    });

    // 3. Select the corpus email_ids + Graph source_ids (ids-only over the step
    //    boundary). source='outlook' excludes Sugar rows; mailbox pinned.
    const corpus = await step.run("select-corpus", async () => {
      const admin = createAdminClient();
      const out: { email_id: string; source_id: string }[] = [];
      let from = 0;
      const PAGE = 1000;
      // Page through the corpus so a large mailbox does not blow PostgREST's
      // default row cap silently.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = (await admin
          .schema("email_pipeline")
          .from("emails")
          .select("id, source_id")
          .eq("source", "outlook")
          .eq("mailbox", mailbox)
          .not("source_id", "is", null)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1)) as {
          data: { id: string; source_id: string | null }[] | null;
          error: unknown;
        };
        if (error) throw error as Error;
        const rows = data ?? [];
        for (const r of rows) {
          if (r.source_id) out.push({ email_id: r.id, source_id: r.source_id });
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return out;
    });

    // 4. Resolve parentFolderId per message in Graph batches, bucket each via
    //    the swarm-agnostic mapper. Graph 400/404 on a single message = no-op
    //    skip (counted as 'unresolved'), never fails the whole run.
    const bucketedRows: FolderConventionRow[] = [];
    let unresolved = 0;
    let batchIndex = 0;
    for (let i = 0; i < corpus.length; i += GRAPH_BATCH) {
      const batch = corpus.slice(i, i + GRAPH_BATCH);
      const idx = batchIndex++;
      const batchResult = await step.run(
        `resolve-folders-batch-${idx}`,
        async () => {
          const rows: FolderConventionRow[] = [];
          let skipped = 0;
          for (const c of batch) {
            const res = await graphFetch(
              `/users/${enc(mailbox)}/messages/${enc(c.source_id)}?$select=id,parentFolderId`,
              { method: "GET", prefer: 'IdType="ImmutableId"' },
            );
            if (!res.ok) {
              // 400 (Sugar-shaped id leaked) / 404 (deleted) → skip as no-op.
              skipped += 1;
              continue;
            }
            const data = (await res.json()) as { parentFolderId?: string };
            const parentFolderId = data.parentFolderId ?? "";
            const displayName = folderNameById[parentFolderId] ?? "";
            rows.push({
              email_id: c.email_id,
              bucket: bucketForFolderName(displayName),
            });
          }
          return { rows, skipped };
        },
      );
      bucketedRows.push(...batchResult.rows);
      unresolved += batchResult.skipped;
    }

    // 5. Pure aggregation via the swarm-agnostic helper.
    const report = aggregateFolderConvention(bucketedRows);

    // 6. Log + return the report. NO writes to any live table (side-channel
    //    isolation lock).
    console.log(
      `[sales-email-folder-convention] run ${run_id} mailbox=${mailbox} ` +
        `resolved=${bucketedRows.length} unresolved=${unresolved} ` +
        `afgehandeld=${report.afgehandeld_total} archive=${report.archive_total} ` +
        `ratio=${report.afgehandeld_vs_archive_ratio}`,
    );

    return {
      run_id,
      mailbox,
      corpus_size: corpus.length,
      resolved: bucketedRows.length,
      unresolved,
      report,
    };
  },
);

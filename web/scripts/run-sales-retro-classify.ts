/**
 * Phase 113 — sales-email Stage 3 retro-classify CLI.
 *
 * Sales variant of run-retro-classify.ts. Triggers the Inngest function
 * `sales-email-stage-3-retro-classify`, which re-runs the sales intent agent
 * over the persisted post-Stage-1 verkoop@smeba.nl corpus into
 * stage_3_retro_runs (Side-Channel Isolation: never agent_runs /
 * coordinator_runs / pipeline_events), feeding intent_proposals /
 * intent_proposal_clusters for operator promotion (STAGE3-02).
 *
 * Usage:
 *   cd web && npx tsx scripts/run-sales-retro-classify.ts \
 *     --since 2026-06-02 --until 2026-06-10 [--sample-limit 100] [--bootstrap] [--yes]
 *
 * --bootstrap honors the bounded R-04 gate bypass: allowed ONLY while sales
 * swarm_intents is empty (the empty-cluster first pass). The Inngest function
 * THROWS if bootstrap=true after the vocabulary is seeded — re-runs are safe.
 */

import "dotenv/config";
import { inngest } from "@/lib/inngest/client";
import readline from "node:readline/promises";

const USAGE = `
Phase 113 sales retro-classify CLI

Usage:
  npx tsx scripts/run-sales-retro-classify.ts --since YYYY-MM-DD --until YYYY-MM-DD [options]

Required:
  --since YYYY-MM-DD    Window start (inclusive)
  --until YYYY-MM-DD    Window end (exclusive)

Options:
  --sample-limit N      Cap candidates (hard max = 5000)
  --bootstrap           Honor the bounded R-04 cluster-gate bypass (empty-vocab first pass only)
  --run-id UUID         Pin a specific run_id (for resuming)
  --yes                 Skip confirmation prompt
  --help                Show this help

Triggers Inngest function sales-email-stage-3-retro-classify.
`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HARD_CAP = 5000;

type Argv = Record<string, string | boolean>;

function parseArgv(argv: string[]): Argv {
  const out: Argv = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function fail(msg: string): never {
  console.error(`ERROR: ${msg}\n${USAGE}`);
  process.exit(1);
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question(`${prompt} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const since = typeof args.since === "string" ? args.since : undefined;
  const until = typeof args.until === "string" ? args.until : undefined;
  if (!since || !DATE_RE.test(since)) fail("--since YYYY-MM-DD required");
  if (!until || !DATE_RE.test(until)) fail("--until YYYY-MM-DD required");
  if ((since as string) >= (until as string)) {
    fail("--since must be strictly before --until");
  }

  let sample_limit: number | undefined;
  if (typeof args["sample-limit"] === "string") {
    const n = Number(args["sample-limit"]);
    if (!Number.isInteger(n) || n < 1 || n > HARD_CAP) {
      fail(`--sample-limit must be an integer in [1, ${HARD_CAP}]`);
    }
    sample_limit = n;
  }

  const bootstrap = args.bootstrap === true;
  const run_id =
    typeof args["run-id"] === "string" ? (args["run-id"] as string) : undefined;

  const limitDesc =
    sample_limit !== undefined ? `≤${sample_limit}` : `≤${HARD_CAP}`;
  console.log(
    `PRODUCTION -- sales-email Stage 3 retro classify${bootstrap ? " (BOOTSTRAP)" : ""} -- ` +
      `Action: re-classify ${limitDesc} emails in [${since}, ${until})`,
  );
  if (run_id) console.log(`Pinned run_id: ${run_id}`);

  const needsConfirm =
    !args.yes && (sample_limit === undefined || sample_limit > 50);
  if (needsConfirm) {
    const ok = await confirm("Proceed?");
    if (!ok) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // CLAUDE.md Phase 65: inngest.send must NOT be destructured (loses
  // this-binding → TypeError on first call). Inline call only.
  const result = await inngest.send({
    name: "sales-email/retro-classify.requested",
    data: {
      swarm_type: "sales-email",
      since: since as string,
      until: until as string,
      sample_limit,
      run_id,
      bootstrap,
    },
  });

  const ids = result.ids ?? [];
  console.log(`Inngest event sent: ${ids.join(", ")}`);
  console.log(
    "View progress: https://app.inngest.com/env/production/runs?event=sales-email%2Fretro-classify.requested",
  );
}

main().catch((err) => {
  console.error("Sales retro-classify CLI failed:", err);
  process.exit(1);
});

/**
 * Phase 87 — debtor-email Stage 3 retro-classify CLI.
 *
 * Usage:
 *   cd web && npx tsx scripts/run-retro-classify.ts \
 *     --since 2026-04-20 --until 2026-05-20 [--sample-limit 50] [--yes]
 *
 * Triggers the Inngest function `debtor-email-stage-3-retro-classify`. The
 * function re-runs V3 Stage 3 against persisted historical mail and writes
 * to stage_3_retro_runs + intent_volume_baselines (Side-Channel Isolation:
 * never to agent_runs / coordinator_runs / pipeline_events).
 *
 * See `.planning/phases/87-retro-classification-and-intent-volume-baseline/`.
 *
 * Production write — confirm prompt fires when sample-limit > 50 or absent.
 */

import "dotenv/config";
import { inngest } from "@/lib/inngest/client";
import readline from "node:readline/promises";

const USAGE = `
Phase 87 retro-classify CLI

Usage:
  npx tsx scripts/run-retro-classify.ts --since YYYY-MM-DD --until YYYY-MM-DD [options]

Required:
  --since YYYY-MM-DD    Window start (inclusive)
  --until YYYY-MM-DD    Window end (exclusive)

Options:
  --sample-limit N      Cap candidates (D-03 hard max = 5000)
  --swarm-type T        Defaults to "debtor-email"
  --run-id UUID         Pin a specific run_id (for resuming)
  --yes                 Skip confirmation prompt
  --help                Show this help

Triggers Inngest function debtor-email-stage-3-retro-classify.
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

  const swarm_type =
    typeof args["swarm-type"] === "string"
      ? (args["swarm-type"] as string)
      : "debtor-email";
  if (swarm_type !== "debtor-email") {
    fail(`--swarm-type must be "debtor-email" (got "${swarm_type}")`);
  }

  let sample_limit: number | undefined;
  if (typeof args["sample-limit"] === "string") {
    const n = Number(args["sample-limit"]);
    if (!Number.isInteger(n) || n < 1 || n > HARD_CAP) {
      fail(`--sample-limit must be an integer in [1, ${HARD_CAP}]`);
    }
    sample_limit = n;
  }

  const run_id =
    typeof args["run-id"] === "string" ? (args["run-id"] as string) : undefined;

  const limitDesc =
    sample_limit !== undefined ? `≤${sample_limit}` : `≤${HARD_CAP}`;
  console.log(
    `PRODUCTION -- debtor-email Stage 3 retro classify -- ` +
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
    name: "debtor-email/retro-classify.requested",
    data: {
      swarm_type: "debtor-email",
      since: since as string,
      until: until as string,
      sample_limit,
      run_id,
    },
  });

  const ids = result.ids ?? [];
  console.log(`Inngest event sent: ${ids.join(", ")}`);
  console.log(
    "View progress: https://app.inngest.com/env/production/runs?event=debtor-email%2Fretro-classify.requested",
  );
}

main().catch((err) => {
  console.error("Retro-classify CLI failed:", err);
  process.exit(1);
});

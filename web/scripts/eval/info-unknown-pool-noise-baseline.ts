/**
 * Phase 130 Plan 03 Task 3 — per-mailbox labelled-sample noise-baseline
 * (NOISE-03 discipline, RESEARCH Pitfall 5).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠ THE LABELLING STEP IS MANUAL (HUMAN JUDGEMENT). This script does NOT
 * decide noise-vs-routable — a human does. The script's job is to make that
 * manual labelling rigorous and repeatable:
 *
 *   PHASE A (sample):   draw a deterministic-seeded random sample of N
 *                       `unknown`-decision info-routing Stage-1 emails PER
 *                       mailbox (smeba, fire-control) over a [since, until)
 *                       window, and emit subject/sender/snippet for a human to
 *                       label as `noise` or `routable`. Subject + sender are
 *                       fetched from `email_pipeline.emails` (by `email_id`),
 *                       NOT from `decision_details` — the Stage-1 writer never
 *                       sets subject/from there (WR-01), so labelling reads the
 *                       email itself, never the LLM's own reasoning (Pitfall 5).
 *   PHASE B (compute):  feed the human labels back (JSON: row-id → label) and
 *                       compute the true-noise fraction + a Wilson 95% CI per
 *                       mailbox.
 *
 * Run PHASE A + PHASE B BEFORE the six new info-routing noise classes go live
 * (the BEFORE baseline), and AGAIN after promotion (the AFTER baseline). The
 * `compare` mode prints both side-by-side. NOISE-03 target: the true-noise
 * share inside the unknown pool drops ~50% → <20% per live mailbox WITHOUT the
 * routable share rising (which would mean routable mail got mis-archived — the
 * false-success failure mode Pitfall 5 guards against).
 *
 * The distribution half of the measurement (raw counts/pct per mailbox) comes
 * from the Task-1 view `public.info_unknown_pool_composition`; this script
 * reads that view in PHASE A to report the unknown-pool size it is sampling
 * from. Distribution counts ALONE are necessary-but-not-sufficient — the
 * labelled fraction here is the sufficient half.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Pure functions (sampling, fraction+CI) are exported and IO-free so the unit
 * test can drive them with fixtures; main() wires them to Supabase
 * (service-role) and is the only part that touches env/secrets/network.
 *
 * Args are validated BEFORE createAdminClient is imported/instantiated, so the
 * no-args usage error fires without any DB connection attempt.
 *
 * Sample N: default 80 per mailbox. Rationale: at an expected true-noise share
 * near 50%, n=80 yields a Wilson 95% half-width of ~±11pp — tight enough to
 * resolve a 50%→<20% drop unambiguously (the BEFORE CI lower bound sits well
 * above the AFTER CI upper bound). Override with --n=<int> if the live unknown
 * pool per mailbox is smaller than 80 (the script samples min(N, poolSize)).
 *
 * Usage:
 *   # PHASE A — emit a sample to label (writes JSON rows to stdout):
 *   npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts sample <sinceISO> <untilISO> [--n=80] [--seed=130]
 *
 *   # PHASE B — compute the fraction+CI from a labelled file:
 *   npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts compute <labelled.json>
 *
 *   # compare BEFORE vs AFTER labelled files:
 *   npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts compare <before.json> <after.json>
 *
 * labelled.json shape: { "rows": [{ "id": "<pipeline_event_id>", "mailbox_entity": "smeba", "label": "noise" | "routable" }, ...] }
 */

import {
  wilsonCiLower,
  wilsonCiUpper,
  PROMOTE_N_MIN,
} from "@/lib/classifier/wilson";

const SWARM = "info-routing";
const DEFAULT_N = 80;
const DEFAULT_SEED = 130;

// ─── PURE: deterministic seeded sampling ───────────────────────────────────

/** A row eligible for labelling (unknown-decision info-routing Stage-1 event). */
export interface SampleCandidate {
  id: string;
  mailbox_entity: string | null;
  subject: string | null;
  sender: string | null;
  snippet: string | null;
}

/**
 * Mulberry32 — small, fast, deterministic PRNG. Same seed → same sequence, so
 * a BEFORE/AFTER pair (or a re-run) draws the SAME sample given the same
 * candidate ordering. Pure.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher–Yates sample of up to `n` candidates PER mailbox_entity.
 * Candidates are first sorted by id (stable input ordering, so the seed alone
 * determines the draw), grouped by mailbox_entity, then shuffled with the
 * seeded PRNG and sliced to min(n, group size). Pure.
 */
export function samplePerMailbox(
  candidates: SampleCandidate[],
  n: number,
  seed: number,
): Record<string, SampleCandidate[]> {
  const byMailbox = new Map<string, SampleCandidate[]>();
  for (const c of candidates) {
    const key = c.mailbox_entity ?? "(null)";
    if (!byMailbox.has(key)) byMailbox.set(key, []);
    byMailbox.get(key)!.push(c);
  }

  const out: Record<string, SampleCandidate[]> = {};
  for (const [mailbox, group] of byMailbox) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const rng = mulberry32(seed + hashString(mailbox));
    // Fisher–Yates in place on a copy.
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
    out[mailbox] = sorted.slice(0, Math.min(n, sorted.length));
  }
  return out;
}

/** Tiny stable string hash so per-mailbox PRNG streams differ deterministically. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── PURE: labelled fraction + Wilson CI ───────────────────────────────────

export type NoiseLabel = "noise" | "routable";

export interface LabelledRow {
  id: string;
  mailbox_entity: string | null;
  label: NoiseLabel;
}

export interface NoiseFraction {
  mailbox_entity: string;
  n: number;
  noise: number;
  routable: number;
  noise_fraction: number; // point estimate noise/n
  wilson_ci_lo: number; // 95% lower bound on the noise fraction
  wilson_ci_hi: number; // 95% upper bound on the noise fraction
  under_min_n: boolean; // true when n < PROMOTE_N_MIN (CI uninformative)
}

/**
 * Compute the true-noise fraction + BOTH Wilson 95% bounds (lo and hi) PER
 * mailbox from a set of human labels. NOISE-03's AFTER assertion uses
 * `wilson_ci_hi < 0.20` (the upper bound below threshold is the rigorous proof
 * the noise share dropped under 20%). `under_min_n` flags mailboxes whose
 * sample is below the promotion-grade minimum (PROMOTE_N_MIN) — their CI is too
 * wide to trust as a before/after delta on its own. Pure.
 */
export function computeNoiseFractions(rows: LabelledRow[]): NoiseFraction[] {
  const byMailbox = new Map<string, LabelledRow[]>();
  for (const r of rows) {
    const key = r.mailbox_entity ?? "(null)";
    if (!byMailbox.has(key)) byMailbox.set(key, []);
    byMailbox.get(key)!.push(r);
  }

  const out: NoiseFraction[] = [];
  for (const [mailbox, group] of byMailbox) {
    const n = group.length;
    const noise = group.filter((r) => r.label === "noise").length;
    const routable = n - noise;
    out.push({
      mailbox_entity: mailbox,
      n,
      noise,
      routable,
      noise_fraction: n === 0 ? 0 : noise / n,
      wilson_ci_lo: wilsonCiLower(n, noise),
      wilson_ci_hi: wilsonCiUpper(n, noise),
      under_min_n: n < PROMOTE_N_MIN,
    });
  }
  out.sort((a, b) => a.mailbox_entity.localeCompare(b.mailbox_entity));
  return out;
}

export interface FractionComparison {
  mailbox_entity: string;
  before: NoiseFraction | null;
  after: NoiseFraction | null;
  /** before.noise_fraction − after.noise_fraction (positive = noise share dropped). */
  noise_fraction_delta: number | null;
}

/** Pair BEFORE and AFTER fractions per mailbox and compute the delta. Pure. */
export function compareFractions(
  before: NoiseFraction[],
  after: NoiseFraction[],
): FractionComparison[] {
  const beforeMap = new Map(before.map((f) => [f.mailbox_entity, f]));
  const afterMap = new Map(after.map((f) => [f.mailbox_entity, f]));
  const mailboxes = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  const out: FractionComparison[] = [];
  for (const mailbox of mailboxes) {
    const b = beforeMap.get(mailbox) ?? null;
    const a = afterMap.get(mailbox) ?? null;
    out.push({
      mailbox_entity: mailbox,
      before: b,
      after: a,
      noise_fraction_delta:
        b && a ? b.noise_fraction - a.noise_fraction : null,
    });
  }
  out.sort((x, y) => x.mailbox_entity.localeCompare(y.mailbox_entity));
  return out;
}

// ─── IO: parse a labelled file (validates shape) ───────────────────────────

export function parseLabelledRows(raw: unknown): LabelledRow[] {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { rows?: unknown }).rows)
  ) {
    throw new Error('labelled file must be { "rows": [...] }');
  }
  const rows = (raw as { rows: unknown[] }).rows;
  return rows.map((r, i) => {
    const row = r as Record<string, unknown>;
    const label = row.label;
    if (label !== "noise" && label !== "routable") {
      throw new Error(
        `row ${i}: label must be "noise" | "routable", got ${JSON.stringify(label)}`,
      );
    }
    if (typeof row.id !== "string") {
      throw new Error(`row ${i}: id must be a string`);
    }
    return {
      id: row.id,
      mailbox_entity:
        typeof row.mailbox_entity === "string" ? row.mailbox_entity : null,
      label,
    };
  });
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const USAGE = `info-unknown-pool-noise-baseline — per-mailbox labelled noise baseline (NOISE-03)

The LABELLING step is MANUAL (human noise-vs-routable judgement). Run BEFORE
and AFTER promotion, per mailbox.

Usage:
  sample  <sinceISO> <untilISO> [--n=${DEFAULT_N}] [--seed=${DEFAULT_SEED}]
            emit a deterministic per-mailbox sample of unknown-decision
            info-routing Stage-1 emails to label as noise|routable.
  compute <labelled.json>
            compute true-noise fraction + Wilson 95% CI per mailbox.
  compare <before.json> <after.json>
            print BEFORE vs AFTER fractions + delta per mailbox.

labelled.json: { "rows": [{ "id": "<id>", "mailbox_entity": "smeba", "label": "noise" }, ...] }
`;

function parseFlag(args: string[], name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = args.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  // eslint-disable-next-line no-console
  console.error(USAGE);
  process.exit(2);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = argv[0];

  // ── Arg validation BEFORE any DB import/instantiation ──
  if (mode !== "sample" && mode !== "compute" && mode !== "compare") {
    fail(
      `missing or unknown mode "${mode ?? ""}" — expected: sample | compute | compare`,
    );
  }

  if (mode === "sample") {
    const since = argv[1];
    const until = argv[2];
    if (!since || !until) {
      fail("sample: missing required <sinceISO> <untilISO> arguments");
    }
    const n = Number(parseFlag(argv, "n") ?? DEFAULT_N);
    const seed = Number(parseFlag(argv, "seed") ?? DEFAULT_SEED);
    if (!Number.isFinite(n) || n <= 0) fail("--n must be a positive integer");
    if (!Number.isFinite(seed)) fail("--seed must be a number");

    // Lazy import so arg-validation never needs env/secrets/network.
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    // Distribution half (Task-1 view) — report the unknown-pool size we sample
    // from, per mailbox, for the [since, until) window.
    const compRes = await admin
      .from("info_unknown_pool_composition")
      .select("mailbox_entity, decision, n, pct");
    if (compRes.error) {
      // eslint-disable-next-line no-console
      console.error(
        `warning: info_unknown_pool_composition read failed (${compRes.error.message}) — continuing with raw sample only`,
      );
    }

    // Sampling pool — unknown-decision info-routing Stage-1 events in window.
    const poolRes = await admin
      .from("pipeline_events")
      .select("id, decision_details, email_id")
      .eq("swarm_type", SWARM)
      .eq("stage", 1)
      .eq("decision", "unknown")
      .gte("created_at", since)
      .lt("created_at", until);
    if (poolRes.error) {
      throw new Error(`pool query: ${poolRes.error.message}`);
    }

    type PoolRow = {
      id: string;
      decision_details: Record<string, unknown> | null;
      email_id: string | null;
    };
    const poolRows = (poolRes.data ?? []) as PoolRow[];

    // WR-01: subject/sender come from email_pipeline.emails (by email_id), NOT
    // from decision_details — the Stage-1 writer never sets dd.subject/dd.from
    // (see classifier-screen-worker.ts:449-471), so reading them yields null
    // and forces circular labelling from the LLM's own reasoning (Pitfall 5).
    const emailIds = Array.from(
      new Set(
        poolRows
          .map((r) => r.email_id)
          .filter((id): id is string => typeof id === "string"),
      ),
    );

    const emailMeta = new Map<
      string,
      { subject: string | null; sender: string | null }
    >();
    const CHUNK = 200;
    for (let i = 0; i < emailIds.length; i += CHUNK) {
      const chunk = emailIds.slice(i, i + CHUNK);
      const { data, error } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("id, subject, sender_email, mailbox")
        .in("id", chunk);
      if (error) {
        // Non-fatal (mirror composition-view warning style): degrade to null
        // subject/sender rather than throwing — the sample must still emit.
        // eslint-disable-next-line no-console
        console.error(
          `warning: email_pipeline.emails read failed (${error.message}) — continuing with null subject/sender`,
        );
        break;
      }
      for (const e of (data ?? []) as Array<{
        id: string;
        subject: string | null;
        sender_email: string | null;
      }>) {
        emailMeta.set(e.id, {
          subject: e.subject ?? null,
          sender: e.sender_email ?? null,
        });
      }
    }

    const candidates: SampleCandidate[] = poolRows.map((r) => {
      const dd = r.decision_details ?? {};
      const meta =
        r.email_id != null ? emailMeta.get(r.email_id) : undefined;
      return {
        id: r.id,
        mailbox_entity:
          typeof dd.entity === "string" ? (dd.entity as string) : null,
        subject: meta?.subject ?? null,
        sender: meta?.sender ?? null,
        snippet:
          typeof dd.llm_reasoning === "string"
            ? (dd.llm_reasoning as string)
            : null,
      };
    });

    const sample = samplePerMailbox(candidates, n, seed);

    // Emit a label-ready scaffold: each row pre-stamped with id + mailbox so
    // the human only fills `label`.
    const rows = Object.entries(sample).flatMap(([mailbox, group]) =>
      group.map((c) => ({
        id: c.id,
        mailbox_entity: mailbox,
        subject: c.subject,
        sender: c.sender,
        snippet: c.snippet,
        label: "TODO_noise_or_routable",
      })),
    );

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          mode: "sample",
          swarm: SWARM,
          window: { since, until },
          n_per_mailbox: n,
          seed,
          distribution: compRes.error ? null : compRes.data,
          instructions:
            'Set each row.label to "noise" or "routable", then run: compute <this-file>.json',
          rows,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (mode === "compute") {
    const file = argv[1];
    if (!file) fail("compute: missing required <labelled.json> argument");
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const rows = parseLabelledRows(raw);
    const fractions = computeNoiseFractions(rows);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({ mode: "compute", swarm: SWARM, fractions }, null, 2),
    );
    return;
  }

  // mode === "compare"
  const beforeFile = argv[1];
  const afterFile = argv[2];
  if (!beforeFile || !afterFile) {
    fail("compare: missing required <before.json> <after.json> arguments");
  }
  const { readFileSync } = await import("node:fs");
  const before = computeNoiseFractions(
    parseLabelledRows(JSON.parse(readFileSync(beforeFile, "utf8"))),
  );
  const after = computeNoiseFractions(
    parseLabelledRows(JSON.parse(readFileSync(afterFile, "utf8"))),
  );
  const comparison = compareFractions(before, after);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ mode: "compare", swarm: SWARM, comparison }, null, 2),
  );
}

// Only run main() when invoked directly (tsx), never on import (the test
// imports the pure functions only).
const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /info-unknown-pool-noise-baseline\.ts$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

/**
 * Phase 111 Plan 04 Task 1 (D-07) — sales-email Stage-1 noise discovery miner.
 *
 * Read-only cluster miner over the retro-run's `unknown` bucket. Adapts the
 * spike-002 first-match-wins clusterer
 * (.claude/skills/spike-findings-agent-workforce/sources/002-smeba-info-noise-patterns/spike-002-cluster.ts)
 * but with three deliberate divergences vs. the spike:
 *
 *   1. SOURCE = the retro unknown bucket, NOT the raw mailbox. We read
 *      `public.stage_1_retro_runs WHERE predicted_category_key = 'unknown'`
 *      (the leftovers the live Stage-1 noise filter + LLM 2nd-pass could not
 *      classify as noise), then join to `email_pipeline.emails` for the
 *      signature fields (sender domain, subject prefix, body boilerplate).
 *      The spike read the raw mailbox; here we only mine what Stage-1 already
 *      failed to catch — that is the only set worth discovering NEW rules from.
 *
 *   2. BOTH corpora. The retro bucket already spans live Outlook
 *      (`source='outlook'`, verkoop@smeba.nl) AND historic SugarCRM
 *      (`source='sugarcrm'`). We do NOT hardcode a mailbox or a direction
 *      filter (the spike pinned a single info-mailbox + direction=incoming —
 *      spike lines 11, 117-118). Direction is normalized via the Plan 03
 *      helper ({inbound,incoming}→inbound, {sent,outbound}→outbound).
 *
 *   3. OPERATOR-GATED — NO auto-INSERT. This script SURFACES a ranked,
 *      inspectable candidate list (cluster size + 8 sample subjects/senders
 *      per cluster + top-25 unknown sender domains + top-25 unknown sender
 *      addresses). It NEVER writes a `swarm_noise_categories` row
 *      (Anti-Pattern A4: build the discovery mechanism, let the operator
 *      promote — do NOT hand-curate or auto-promote noise keys). Promotion of
 *      any approved subset is a SEPARATE follow-up migration + seed re-fire,
 *      not this script.
 *
 * ── Per-candidate rule form (Claude's Discretion / RESEARCH Pitfall 7) ──
 * An approved candidate DEFAULTS to an LLM-category row — pure registry data
 * (RESEARCH Finding 3): INSERT a `swarm_noise_categories` row + re-fire
 * `classifier/llm-rules-seed.run`. No Orq Studio edit, no `npm run codegen`
 * (codegen covers swarm_intents only, not swarm_noise_categories).
 *
 * A SALES REGEX RULE (Pass 1) is the costlier path and is OUT by default: sales
 * has `stage1_regex_module=null` and no module registered in
 * STAGE1_REGEX_MODULES, so a regex rule requires a NEW module file + a
 * STAGE1_REGEX_MODULES map entry + a `swarms.stage1_regex_module` UPDATE —
 * that is code, not registry data, and risks per-swarm coupling. Only choose
 * regex if a candidate has a crisp, deterministic, anchored+bounded signature
 * AND the executor explicitly accepts the documented code cost.
 *
 * Read-only. Pure reporting. No DB writes of any kind.
 *
 * Run:  npx tsx scripts/sales-stage-1-cluster-mine.ts [--swarm sales-email] [--run-id <uuid>]
 *       (defaults: swarm=sales-email; run-id = the most recent stage_1_retro_runs run)
 */

import { createClient } from "@supabase/supabase-js";

// ── Config (env-driven; no hardcoded mailbox/direction) ───────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DEFAULT_SWARM = "sales-email";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (load web/.env.local).",
  );
  process.exit(1);
}

function argval(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const SWARM_TYPE = argval("--swarm") ?? DEFAULT_SWARM;
const RUN_ID_ARG = argval("--run-id");

// Two schema-scoped clients: public (retro runs) + email_pipeline (signatures).
const pub = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: "public" },
});
const epl = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: "email_pipeline" },
});

type NormalizedDirection = "inbound" | "outbound";

/**
 * Mirror of Plan 03's select-candidates.normalizeDirection (Pitfall 4):
 * {inbound, incoming} → inbound; {sent, outbound} → outbound; missing → inbound.
 * Kept local so the script has no cross-package import coupling, but the
 * collapse rule is identical.
 */
function normalizeDirection(
  direction: string | null | undefined,
): NormalizedDirection {
  const d = (direction ?? "").trim().toLowerCase();
  if (d === "sent" || d === "outbound") return "outbound";
  return "inbound";
}

interface Row {
  email_id: string;
  source: string | null;
  normalized_direction: NormalizedDirection;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  body_text: string | null;
}

interface Rule {
  key: string;
  match: (r: Row) => boolean;
}

function domainOf(email: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

function localPart(email: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at === -1 ? email.toLowerCase() : email.slice(0, at).toLowerCase();
}

// Smeba's own + sibling Moyne Roberts brand domains (own-domain loopback signal).
const OWN_DOMAINS = new Set([
  "smeba.nl",
  "smeba-fire.be",
  "moyneroberts.com",
  "fire-control.nl",
  "berki.nl",
  "sicli-noord.be",
  "sicli-sud.be",
]);

// Candidate signature rules, ordered by specificity. First match wins.
// These are DISCOVERY signatures — they propose how the unknown leftovers
// cluster, so the operator can decide which (if any) warrant a real
// swarm_noise_categories row. They are NOT promoted noise keys.
const RULES: Rule[] = [
  {
    key: "cand_delivery_failure",
    match: (r) =>
      /(undeliverable|delivery (status notification|failure)|message not delivered|niet bestelbaar|niet bezorgd|mailer-daemon|postmaster)/i.test(
        (r.subject || "") + " " + localPart(r.sender_email),
      ),
  },
  {
    key: "cand_auto_reply_ooo",
    match: (r) =>
      /(automatisch antwoord|automatic reply|automatische reply|out of office|afwezigheidsbericht|^read: |^gelezen: )/i.test(
        r.subject || "",
      ),
  },
  {
    key: "cand_noreply_notification",
    match: (r) => {
      const l = localPart(r.sender_email);
      return (
        /^(noreply|no-reply|donotreply|do-not-reply|dontreply|notifications?|notify|alerts?|automated|mailer|postmaster|info-noreply)/i.test(
          l,
        ) || /^(noreply|no-reply|notifications?)\./i.test(l)
      );
    },
  },
  {
    key: "cand_marketing_newsletter",
    match: (r) => {
      const l = localPart(r.sender_email);
      const d = domainOf(r.sender_email);
      if (
        /(newsletter|nieuwsbrief|marketing|news@|^news[-_.]|mailing|campaign|broadcast|^promo|^offers?|^deals?)/i.test(
          l,
        )
      )
        return true;
      if (
        /^(mail|email|mailing|newsletter|news)\.|\.(mailchimp|sendgrid|mandrill|hubspot|constantcontact)\./i.test(
          d,
        )
      )
        return true;
      return false;
    },
  },
  {
    key: "cand_own_domain_loopback",
    match: (r) => OWN_DOMAINS.has(domainOf(r.sender_email)),
  },
];

function classify(r: Row): string {
  for (const rule of RULES) {
    if (rule.match(r)) return rule.key;
  }
  return "unclustered";
}

/** Resolve the run_id to mine — the explicit arg, or the most recent run. */
async function resolveRunId(): Promise<string> {
  if (RUN_ID_ARG) return RUN_ID_ARG;
  const { data, error } = await pub
    .from("stage_1_retro_runs")
    .select("run_id, created_at")
    .eq("swarm_type", SWARM_TYPE)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.error(
      `No stage_1_retro_runs rows for swarm '${SWARM_TYPE}'. Run the Stage-1 retro harness (Plan 03) first, or pass --run-id.`,
    );
    process.exit(1);
  }
  return (data[0] as { run_id: string }).run_id;
}

/** Page the retro unknown bucket for the run. */
async function fetchUnknownEmailIds(runId: string): Promise<string[]> {
  const PAGE = 1000;
  const ids: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await pub
      .from("stage_1_retro_runs")
      .select("email_id")
      .eq("run_id", runId)
      .eq("predicted_category_key", "unknown")
      .order("email_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    ids.push(...data.map((d) => (d as { email_id: string }).email_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

/** Fetch signature fields from email_pipeline.emails for the unknown ids. */
async function fetchSignatures(emailIds: string[]): Promise<Row[]> {
  const CHUNK = 500;
  const rows: Row[] = [];
  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const slice = emailIds.slice(i, i + CHUNK);
    const { data, error } = await epl
      .from("emails")
      .select("id, source, direction, subject, sender_email, sender_name, body_text")
      .in("id", slice);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    for (const e of data ?? []) {
      const row = e as {
        id: string;
        source: string | null;
        direction: string | null;
        subject: string | null;
        sender_email: string | null;
        sender_name: string | null;
        body_text: string | null;
      };
      rows.push({
        email_id: row.id,
        source: row.source,
        normalized_direction: normalizeDirection(row.direction),
        subject: row.subject,
        sender_email: row.sender_email,
        sender_name: row.sender_name,
        body_text: row.body_text,
      });
    }
  }
  return rows;
}

async function main() {
  const runId = await resolveRunId();
  console.log(`=== Phase 111 D-07 — sales Stage-1 noise discovery miner ===\n`);
  console.log(`Swarm:  ${SWARM_TYPE}`);
  console.log(`Run id: ${runId}`);
  console.log(
    `Source: stage_1_retro_runs WHERE predicted_category_key='unknown' (the retro leftover bucket — both corpora)\n`,
  );

  const unknownIds = await fetchUnknownEmailIds(runId);
  console.log(`Unknown-bucket rows: ${unknownIds.length}\n`);
  if (unknownIds.length === 0) {
    console.log("Nothing to mine — the unknown bucket is empty for this run.");
    return;
  }

  const rows = await fetchSignatures(unknownIds);

  // Surface the direction split so the operator can reason about it (inbound
  // leftovers are the real false-archive risk surface).
  const inbound = rows.filter((r) => r.normalized_direction === "inbound").length;
  console.log(
    `Signatures resolved: ${rows.length}  (inbound=${inbound}, outbound=${rows.length - inbound})\n`,
  );

  const buckets: Record<string, Row[]> = {};
  for (const r of rows) {
    const k = classify(r);
    (buckets[k] = buckets[k] || []).push(r);
  }

  const order = [...RULES.map((r) => r.key), "unclustered"];

  // Ranked candidate list — sorted by cluster size DESC (operator reviews
  // biggest signatures first), 'unclustered' always last.
  const ranked = order
    .map((key) => ({ key, n: (buckets[key] || []).length }))
    .filter((c) => c.n > 0 && c.key !== "unclustered")
    .sort((a, b) => b.n - a.n);

  console.log(`--- Ranked candidate clusters (operator-approvable; NO auto-INSERT) ---`);
  console.log(`${"candidate_key".padEnd(30)} ${"count".padStart(6)}  ${"%".padStart(6)}`);
  console.log("-".repeat(48));
  for (const { key, n } of ranked) {
    const pct = ((n / rows.length) * 100).toFixed(1);
    console.log(`${key.padEnd(30)} ${String(n).padStart(6)}  ${pct.padStart(5)}%`);
  }
  const unclustered = (buckets["unclustered"] || []).length;
  console.log("-".repeat(48));
  console.log(
    `${"unclustered (no signature)".padEnd(30)} ${String(unclustered).padStart(6)}  ${((unclustered / rows.length) * 100).toFixed(1).padStart(5)}%\n`,
  );

  // Per-cluster samples — 8 subjects/senders each, for inspection.
  for (const { key } of ranked) {
    const bucket = buckets[key] || [];
    console.log(`\n--- ${key} (${bucket.length}) — sample subjects + senders ---`);
    for (const r of bucket.slice(0, 8)) {
      const subj = (r.subject || "(no subject)").slice(0, 80);
      const dir = r.normalized_direction === "inbound" ? "in " : "out";
      console.log(`  [${dir}] ${(r.sender_email || "?").padEnd(42)}  ${subj}`);
    }
  }

  // Within the residual unclustered bucket, surface top sender domains +
  // addresses so the operator can spot NEW signatures the rules missed.
  const residual = buckets["unclustered"] || [];
  const domainCounts: Record<string, number> = {};
  const senderCounts: Record<string, number> = {};
  for (const r of residual) {
    const d = domainOf(r.sender_email) || "(none)";
    const s = (r.sender_email || "(none)").toLowerCase();
    domainCounts[d] = (domainCounts[d] || 0) + 1;
    senderCounts[s] = (senderCounts[s] || 0) + 1;
  }
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);
  console.log(`\n--- unclustered bucket — top 25 sender domains (new-signature hunting) ---`);
  for (const [d, n] of topDomains) console.log(`  ${String(n).padStart(5)}  ${d}`);

  const topSenders = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);
  console.log(`\n--- unclustered bucket — top 25 sender addresses ---`);
  for (const [s, n] of topSenders) console.log(`  ${String(n).padStart(5)}  ${s}`);

  console.log(
    `\n[operator] Review the ranked clusters above. To promote a cluster to a noise rule:\n` +
      `  • DEFAULT (registry data): add a swarm_noise_categories row for the new key + re-fire\n` +
      `    classifier/llm-rules-seed.run. No Orq Studio edit, no codegen (Finding 3).\n` +
      `  • REGEX (code, only for a crisp deterministic signature): new STAGE1_REGEX_MODULES\n` +
      `    module + swarms.stage1_regex_module UPDATE (Pitfall 7).\n` +
      `This script makes NO writes — promotion is a deliberate, separate follow-up step.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

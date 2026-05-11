/**
 * A0.5 — Historical replay.
 *
 * Runs the classifier over labeled rows in debtor.email_analysis and reports
 * precision / recall / confusion-matrix numbers against the existing labels.
 *
 * Usage: npx tsx web/lib/debtor-email/replay.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../.env.local") });

import { classify, type Category } from "./classify";

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface AnalysisRow {
  id: string;
  email_id: string;
  language: string | null;
  category: string | null;
  email_intent: string | null;
}

interface EmailContent {
  id: string;
  sender_email: string | null;
  subject: string | null;
  body_text: string | null;
  direction: string | null;
}

interface EmailRow extends EmailContent {
  language: string | null;
  category: string | null;
  email_intent: string | null;
}

/**
 * Map the historical `(category, email_intent)` labels to our new taxonomy.
 * Rows we can't map (legal, delivery_issue, etc.) are excluded from the
 * eval — those belong to Phase C's `unknown` bucket anyway.
 */
function expectedCategory(row: EmailRow): Category | null {
  const cat = row.category ?? "";
  const intent = row.email_intent ?? "";

  if (cat === "auto_reply" || intent === "auto_reply") return "auto_reply";
  if (intent === "payment_confirmation") return "payment_admittance";

  // Explicit negatives — these MUST NOT be classified as auto_reply or payment.
  if (intent === "payment_dispute") return "unknown";
  if (["dispute", "complaint", "legal", "delivery_issue"].includes(cat)) return "unknown";

  // Other categories (admin, invoice, other) are semantically "unknown" for
  // Phase A's purposes — the classifier shouldn't fire on them.
  return "unknown";
}

async function supaGet(path: string, profile: string): Promise<unknown> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Accept-Profile": profile,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchRows(limit: number): Promise<EmailRow[]> {
  const pageSize = 1000;

  const analysis: AnalysisRow[] = [];
  for (let offset = 0; offset < limit; offset += pageSize) {
    const page = (await supaGet(
      `email_analysis?select=id,email_id,language,category,email_intent&order=id&limit=${pageSize}&offset=${offset}`,
      "debtor",
    )) as AnalysisRow[];
    if (page.length === 0) break;
    analysis.push(...page);
    if (page.length < pageSize) break;
  }

  const emailIds = analysis.map((r) => r.email_id).filter(Boolean);
  const contentMap = new Map<string, EmailContent>();
  const inBatch = 150; // URL length ceiling ≈ 8KB; 150 × ~50 chars = ~7.5KB.
  for (let i = 0; i < emailIds.length; i += inBatch) {
    const batch = emailIds.slice(i, i + inBatch);
    const inList = batch.map((id) => `"${id}"`).join(",");
    const page = (await supaGet(
      `emails?select=id,sender_email,subject,body_text,direction&id=in.(${inList})`,
      "email_pipeline",
    )) as EmailContent[];
    for (const c of page) contentMap.set(c.id, c);
  }

  const rows: EmailRow[] = [];
  for (const a of analysis) {
    const c = contentMap.get(a.email_id);
    if (!c || c.direction !== "incoming") continue;
    rows.push({
      id: c.id,
      sender_email: c.sender_email,
      subject: c.subject,
      body_text: c.body_text,
      direction: c.direction,
      language: a.language,
      category: a.category,
      email_intent: a.email_intent,
    });
  }
  return rows.slice(0, limit);
}

interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

function blankConfusion(): Confusion {
  return { tp: 0, fp: 0, fn: 0, tn: 0 };
}

async function main() {
  console.log("Fetching analyzed inbound rows…");
  const rows = await fetchRows(10_000);
  console.log(`  got ${rows.length} rows\n`);

  // Label distributions
  const trueCounts: Record<string, number> = {};
  const predCounts: Record<string, number> = {};

  // Per-category confusion — treat each target label as a binary problem.
  const targets: Category[] = ["auto_reply", "ooo_temporary", "ooo_permanent", "payment_admittance", "spam"];
  const cm: Record<string, Confusion> = Object.fromEntries(targets.map((t) => [t, blankConfusion()]));

  // Rule-hit stats
  const ruleHits: Record<string, number> = {};
  const mismatches: Array<{
    predicted: Category;
    expected: Category;
    rule: string;
    subject: string;
    from: string;
  }> = [];

  for (const row of rows) {
    const expected = expectedCategory(row);
    if (!expected) continue;

    const predicted = classify({
      subject: row.subject ?? "",
      from: row.sender_email ?? "",
      bodySnippet: (row.body_text ?? "").slice(0, 2000),
    });

    // Note: our `auto_reply` historical label includes what we'd now split
    // into ooo_*. So when predicted is ooo_temporary/ooo_permanent and
    // expected is auto_reply, count it as a TP for auto_reply family.
    const predFamily: Category =
      predicted.category === "ooo_temporary" || predicted.category === "ooo_permanent"
        ? "auto_reply"
        : predicted.category;

    trueCounts[expected] = (trueCounts[expected] ?? 0) + 1;
    predCounts[predicted.category] = (predCounts[predicted.category] ?? 0) + 1;
    ruleHits[predicted.matchedRule] = (ruleHits[predicted.matchedRule] ?? 0) + 1;

    for (const t of targets) {
      const tBinaryExpected = expected === t || (t === "auto_reply" && expected === "auto_reply");
      // Collapse OoO labels into auto_reply family for comparison vs historical.
      const tBinaryPredicted =
        t === "auto_reply"
          ? predFamily === "auto_reply"
          : predicted.category === t;

      if (tBinaryExpected && tBinaryPredicted) cm[t].tp++;
      else if (!tBinaryExpected && tBinaryPredicted) cm[t].fp++;
      else if (tBinaryExpected && !tBinaryPredicted) cm[t].fn++;
      else cm[t].tn++;
    }

    // Collect mismatches for inspection (false positives only — most instructive).
    if (predFamily !== "unknown" && predFamily !== expected && mismatches.length < 30) {
      mismatches.push({
        predicted: predicted.category,
        expected,
        rule: predicted.matchedRule,
        subject: (row.subject ?? "").slice(0, 80),
        from: row.sender_email ?? "",
      });
    }
  }

  console.log("═══ Label distribution (true) ═══");
  for (const [k, v] of Object.entries(trueCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v.toString().padStart(6)}`);
  }

  console.log("\n═══ Label distribution (predicted) ═══");
  for (const [k, v] of Object.entries(predCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v.toString().padStart(6)}`);
  }

  console.log("\n═══ Rule hits ═══");
  for (const [k, v] of Object.entries(ruleHits).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(48)} ${v.toString().padStart(6)}`);
  }

  console.log("\n═══ Per-category precision / recall ═══");
  for (const t of targets) {
    const c = cm[t];
    const precision = c.tp + c.fp === 0 ? 0 : c.tp / (c.tp + c.fp);
    const recall = c.tp + c.fn === 0 ? 0 : c.tp / (c.tp + c.fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    console.log(
      `  ${t.padEnd(22)} P=${precision.toFixed(3)}  R=${recall.toFixed(3)}  F1=${f1.toFixed(3)}  ` +
        `(tp=${c.tp} fp=${c.fp} fn=${c.fn} tn=${c.tn})`,
    );
  }

  console.log("\n═══ Sample mismatches (≤30) ═══");
  for (const m of mismatches) {
    console.log(
      `  pred=${m.predicted.padEnd(19)} exp=${m.expected.padEnd(19)} rule=${m.rule.padEnd(40)}`,
    );
    console.log(`    from=${m.from}`);
    console.log(`    subj=${m.subject}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

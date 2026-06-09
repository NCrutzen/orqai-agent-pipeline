// Phase 114-03 Task 3 (D-04) — data-driven identifier-kind discovery over the
// verkoop@smeba.nl inbound corpus.
//
// PURPOSE: Stage 2 customer resolution is config-driven; `resolution_config.precedence`
// MUST be ordered by which identifier kinds ACTUALLY occur in sales mail (and at what
// frequency), NOT hand-curated. This script mines `email_pipeline.emails` and reports,
// per candidate identifier kind, the count + percentage of inbound rows matching. The
// committed JSON report (web/scripts/output/sales-identifier-mining.json) is the
// data-driven input Plan 04 reads to set precedence ordering.
//
// PITFALL 4 (denominator correction): 28% of rows have sender_email=null. A miss on a
// null-sender row is "no input", not "no NXT match". We report TWO denominators —
// total inbound rows AND rows_with_sender_email — and state the excluded null-sender
// count explicitly. sender_match-dependent resolution rate uses rows_with_sender_email.
//
// V5 (input validation): all identifier kinds are validated by regex BEFORE any future
// NXT lookup — the email body is untrusted; a crafted identifier must match a strict
// format before it can target an account downstream.
//
// READ-ONLY: this script never writes to emails/resolution_audit. It is an offline
// analysis task, NOT a runtime code path and NOT a unit test.
//
// RUN: cd web && tsx scripts/sales-identifier-mining.ts
//   requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
//   in web/.env.local (auto-loaded below).

import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

const MAILBOX = "verkoop@smeba.nl";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

if (!url || !key) {
  console.error(
    "[sales-identifier-mining] Missing SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL.\n" +
      "Run me with the service-role key set:\n" +
      "  cd web && SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... tsx scripts/sales-identifier-mining.ts",
  );
  process.exit(1);
}

const pipeline = createClient(url, key, { db: { schema: "email_pipeline" } });

/**
 * Identifier-kind definitions. Each `pattern` is the strict format an extracted
 * candidate must satisfy BEFORE any NXT lookup (V5). Shapes were DISCOVERED from
 * the corpus (subject samples 2026-06-04), not hand-curated:
 *   - offertenummer:  "Offerte SB014967 ...", "FW: Offerte SB014596 ..."   → SB + 5-6 digits
 *   - smeq_quote:     "offerte Smeq 97891", "SMEQ98082"                     → SME[QB] + 4-6 digits
 *   - werkorder:      ">>> werkorder 1634448", "met werkorder 1529119"      → werkorder + 5-8 digits
 *   - case_ref:       "[CASE:752400]"                                       → CASE: + 4-7 digits
 *   - factuurnummer:  reuse debtor extract-invoices.ts NXT invoice prefixes → (17|25|30|32|33)+6 digits
 *   - postcode:       NL postcode → NXT Site (installation address, D-05)   → [1-9]NNN + 2 letters
 *   - ordernummer:    "ordernummer 12345", "order: 67890"                   → order... + 4-8 digits
 *   - klant_debiteur: "klantnummer 1234", "debiteurnummer 56789"           → (klant|debiteur)... + 3-8 digits
 */
interface IdentifierKind {
  key: string;
  description: string;
  /** D-05 confirmed kind vs mined candidate. */
  status: "confirmed" | "candidate";
  /** Whether resolving this kind depends on sender_match (affects denominator choice). */
  sender_dependent: boolean;
  pattern: RegExp;
}

const KINDS: IdentifierKind[] = [
  {
    key: "offertenummer_sb",
    description: "Offertenummer SB-format (Offerte SB014967) → quote → account",
    status: "confirmed",
    sender_dependent: false,
    pattern: /\bSB\d{5,6}\b/i,
  },
  {
    key: "offertenummer_smeq",
    description: "Quote SMEQ/SMEB-format (Smeq 97891 / SMEQ98082) → quote → account",
    status: "confirmed",
    sender_dependent: false,
    pattern: /\bSME[QB]\s?\d{4,6}\b/i,
  },
  {
    key: "werkordernummer",
    description: "Werkorder/order ref (werkorder 1634448) → order → account",
    status: "confirmed",
    sender_dependent: false,
    pattern: /werkorder\s*\d{5,8}/i,
  },
  {
    key: "ordernummer",
    description: "Generic order number (ordernummer 12345 / order: 67890) → order → account",
    status: "candidate",
    sender_dependent: false,
    pattern: /order[a-z]*\s*[:#]?\s*\d{4,8}/i,
  },
  {
    key: "case_ref",
    description: "Case reference ([CASE:752400]) — thread-routing token, corroborating signal",
    status: "candidate",
    sender_dependent: false,
    pattern: /CASE:\s?\d{4,7}/i,
  },
  {
    key: "factuurnummer",
    description: "NXT invoice number (17|25|30|32|33 + 6 digits) → paying customer (reuses debtor layer 3)",
    status: "confirmed",
    sender_dependent: false,
    pattern: /\b(?:17|25|30|32|33)\d{6}\b/,
  },
  {
    key: "postcode_site",
    description: "NL postcode → NXT Site (installation address) → account (D-05, CTO-confirmed)",
    status: "confirmed",
    sender_dependent: false,
    pattern: /\b[1-9][0-9]{3}\s?[A-Za-z]{2}\b/,
  },
  {
    key: "klant_debiteurnummer",
    description: "Customer/debtor number (klantnummer 1234 / debiteurnummer 56789) → account",
    status: "candidate",
    sender_dependent: false,
    pattern: /(?:klant|debiteur)[a-z]*\s*[:#]?\s*\d{3,8}/i,
  },
];

const FREEMAIL = /@(gmail|hotmail|outlook|live|icloud|yahoo|me|msn)\./i;
const OWN_TENANT = /@smeba\./i;

interface EmailRow {
  sender_email: string | null;
  subject: string | null;
  body_full_text: string | null;
  has_attachments: boolean | null;
}

async function fetchAll(): Promise<EmailRow[]> {
  const out: EmailRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await pipeline
      .from("emails")
      .select("sender_email,subject,body_full_text,has_attachments")
      .eq("mailbox", MAILBOX)
      .eq("direction", "inbound")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`corpus query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as EmailRow[]));
    if (data.length < PAGE) break;
  }
  return out;
}

function corpusText(r: EmailRow): string {
  return `${r.subject ?? ""} ${r.body_full_text ?? ""}`;
}

async function main() {
  const rows = await fetchAll();
  const total = rows.length;
  const withSender = rows.filter((r) => r.sender_email != null && r.sender_email !== "").length;
  const nullSender = total - withSender;
  const withAttachments = rows.filter((r) => r.has_attachments === true).length;

  const freemail = rows.filter(
    (r) => r.sender_email != null && FREEMAIL.test(r.sender_email),
  ).length;
  const ownTenant = rows.filter(
    (r) => r.sender_email != null && OWN_TENANT.test(r.sender_email),
  ).length;
  const externalBusiness = withSender - freemail - ownTenant;

  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

  const kinds = KINDS.map((k) => {
    const matching = rows.filter((r) => k.pattern.test(corpusText(r)));
    const count = matching.length;
    // Of the matching rows, how many ALSO have a sender (resolvable end-to-end
    // if the kind is sender-dependent OR if we want a usable Stage-3 hand-off).
    const countWithSender = matching.filter(
      (r) => r.sender_email != null && r.sender_email !== "",
    ).length;
    return {
      key: k.key,
      description: k.description,
      status: k.status,
      sender_dependent: k.sender_dependent,
      pattern: k.pattern.source,
      pattern_flags: k.pattern.flags,
      count,
      pct_of_total: pct(count, total),
      count_with_sender: countWithSender,
      pct_of_with_sender: pct(countWithSender, withSender),
    };
  }).sort((a, b) => b.count - a.count); // precedence input: highest-frequency first

  const report = {
    generated_at: new Date().toISOString(),
    mailbox: MAILBOX,
    direction: "inbound",
    note:
      "Plan 04 reads `kinds` (sorted highest-frequency first) as the data-driven input to " +
      "resolution_config.precedence. PITFALL 4: any sender_match-dependent resolution rate " +
      "uses rows_with_sender_email as the denominator; null-sender rows are excluded input, " +
      "not NXT-misses.",
    denominators: {
      total_inbound_rows: total,
      rows_with_sender_email: withSender,
      excluded_null_sender_rows: nullSender,
      null_sender_pct_of_total: pct(nullSender, total),
    },
    sender_composition: {
      external_business: externalBusiness,
      freemail,
      own_tenant_forwards: ownTenant,
      external_business_pct_of_with_sender: pct(externalBusiness, withSender),
      freemail_pct_of_with_sender: pct(freemail, withSender),
      own_tenant_pct_of_with_sender: pct(ownTenant, withSender),
    },
    attachments: {
      rows_with_attachments: withAttachments,
      pct_of_total: pct(withAttachments, total),
      note:
        "has_attachments was never captured before Phase 114-03 (false on all rows). " +
        "Expect 0 until the ingest fix backfills / new mail arrives.",
    },
    kinds,
  };

  // Human-readable table to stdout.
  console.log(`\nverkoop@smeba.nl identifier mining — ${report.generated_at}`);
  console.log(
    `Denominators: total=${total}  with_sender=${withSender}  null_sender=${nullSender} (${report.denominators.null_sender_pct_of_total}% — EXCLUDED from sender-dependent rates)`,
  );
  console.log(
    `Sender mix: external_business=${externalBusiness}  freemail=${freemail}  own_tenant_fwd=${ownTenant}`,
  );
  console.log(
    `Attachments captured: ${withAttachments}/${total} (${report.attachments.pct_of_total}%)`,
  );
  console.log("\nkind                     status     count  %total  %w/sender");
  for (const k of kinds) {
    console.log(
      `${k.key.padEnd(24)} ${k.status.padEnd(10)} ${String(k.count).padStart(5)}  ${String(k.pct_of_total).padStart(5)}%  ${String(k.pct_of_with_sender).padStart(6)}%`,
    );
  }

  const outDir = resolve(__dirname, "output");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "sales-identifier-mining.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`\nReport written: ${outPath}`);
}

main().catch((err) => {
  console.error("[sales-identifier-mining] failed:", err);
  process.exit(1);
});

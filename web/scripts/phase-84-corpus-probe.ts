// Phase 84 Wave 0 — corpus sampler for the 8 new noise categories.
//
// Reads email_pipeline.emails via service-role and prints per-category matches
// (sender_email + subject anchors derived from CONTEXT.md domain block).
// Output guides hand-confirmation BEFORE CORPUS-SAMPLES.md entries are written.
//
// Run: cd web && SB_URL=... SB_KEY=... npx tsx scripts/phase-84-corpus-probe.ts
// (or with .env.local loaded externally)
//
// NOT idempotent / not for production data writes — read-only probe.

import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const pipeline = createClient(url, key, {
  db: { schema: "email_pipeline" },
});

interface FilterSpec {
  sender_email?: string;
  subject?: string;
  body_text?: string;
}

interface Probe {
  key: string;
  description: string;
  filters: FilterSpec[];
}

const PROBES: Probe[] = [
  {
    key: "coupa_invoice_paid_notification",
    description: "Coupa Betaald — Factuur ... gemarkeerd als Betaald door ISS",
    filters: [
      { sender_email: "%coupahost.com%", subject: "%gemarkeerd als Betaald door ISS%" },
      { subject: "%gemarkeerd als Betaald door%" },
    ],
  },
  {
    key: "coupa_invoice_approved_notification",
    description: "Coupa Goedgekeurd — is goedgekeurd voor betaling door ISS",
    filters: [
      { sender_email: "%coupahost.com%", subject: "%goedgekeurd voor betaling%" },
      { subject: "%goedgekeurd voor betaling door ISS%" },
    ],
  },
  {
    key: "iss_ptp_autoreply",
    description: "ISS PtP NL auto-reply",
    filters: [
      { sender_email: "%Invoice-PtP@nl.issworld.com%" },
      { sender_email: "%nl.issworld.com%" },
    ],
  },
  {
    key: "frieslandcampina_portal_reject",
    description: "FrieslandCampina Robbie.Robot Candex purchase reject",
    filters: [
      { sender_email: "%Robbie.Robot@frieslandcampina.com%" },
      { sender_email: "%frieslandcampina.com%" },
    ],
  },
  {
    key: "m365_quarantine",
    description: "Microsoft 365 quarantine notice",
    filters: [
      { subject: "%You have messages in quarantine%" },
      { subject: "%messages in quarantine%" },
      { subject: "%Microsoft 365 security%" },
    ],
  },
  {
    key: "sender_phishing_notice",
    description: "Sender-side phishing notice",
    filters: [
      { sender_email: "%@rskinstallatie.nl%" },
      { subject: "%pishing%" },
      { subject: "%Voorgaande mail niet openen%" },
      { subject: "%Uitleg pishing%" },
    ],
  },
  {
    key: "supplier_bank_change_notification",
    description: "FarmPlus / supplier bank-change IBAN announcement",
    filters: [
      { sender_email: "%info@farmplus.nl%" },
      { sender_email: "%@farmplus.nl%" },
    ],
  },
  {
    key: "own_outbound_invoice_loopback",
    description: "Tenant own-domain inbound (Fire Control)",
    filters: [
      { sender_email: "%@fire-control.nl%" },
    ],
  },
];

async function runProbe(p: Probe) {
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const f of p.filters) {
    let q = pipeline
      .from("emails")
      .select("id, mailbox, sender_email, subject, direction, received_at")
      .order("received_at", { ascending: false })
      .limit(200);
    if (f.sender_email) q = q.ilike("sender_email", f.sender_email);
    if (f.subject) q = q.ilike("subject", f.subject);
    if (f.body_text) q = q.ilike("body_text", f.body_text);
    const { data, error } = await q;
    if (error) {
      console.error(`[${p.key}] error:`, error.message);
      continue;
    }
    for (const r of data ?? []) {
      if (seen.has(r.id as string)) continue;
      seen.add(r.id as string);
      rows.push(r);
    }
  }
  return rows;
}

async function main() {
  for (const p of PROBES) {
    const rows = await runProbe(p);
    console.log("\n=========================================================");
    console.log(`## ${p.key}  (${p.description})`);
    console.log(`Total unique matches: ${rows.length}`);
    console.log("=========================================================");
    for (const r of rows) {
      const subj = (r.subject as string | null)?.slice(0, 180) ?? "";
      const date = (r.received_at as string | null)?.slice(0, 10) ?? "";
      console.log(
        `${r.id} | ${r.mailbox} | ${r.direction} | ${date} | ${r.sender_email}`,
      );
      console.log(`    SUBJ: ${subj}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

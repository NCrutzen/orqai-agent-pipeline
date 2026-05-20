// Spike 004 — random sample 30 emails from the post-noise-filter 'unknown' bucket
// to preview the router agent's workload shape. Read-only. Does NOT propose intents.

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

const MAILBOX = "info@smeba.nl";
const SAMPLE_N = 30;

// Mirror Spike 002's first-match-wins rules so we sample from the same 'unknown' set
// the future Stage 1 noise filter would produce.
const OWN_DOMAINS = new Set([
  "smeba.nl",
  "smeba-fire.be",
  "moyneroberts.com",
  "fire-control.nl",
  "berki.nl",
  "sicli-noord.be",
  "sicli-sud.be",
]);

function domainOf(email: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}
function local(email: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  return at === -1 ? email.toLowerCase() : email.slice(0, at).toLowerCase();
}

interface Row {
  source_id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  body_text: string | null;
  received_at: string;
}

function isNoise(r: Row): boolean {
  const subj = r.subject || "";
  const sndLocal = local(r.sender_email);
  const sndDomain = domainOf(r.sender_email);
  if (/^\s*\[SPAM\]/i.test(subj)) return true;
  if (OWN_DOMAINS.has(sndDomain)) return true;
  if (
    /^(noreply|no-reply|donotreply|do-not-reply|dontreply|notifications?|notify|alerts?|automated|mailer|postmaster|info-noreply)/i.test(
      sndLocal
    )
  )
    return true;
  if (
    /(automatisch antwoord|automatic reply|out of office|afwezigheidsbericht|^read: )/i.test(
      subj
    )
  )
    return true;
  if (/(newsletter|nieuwsbrief|marketing|news@|^news[-_.]|mailing|campaign)/i.test(sndLocal)) return true;
  return false;
}

async function fetchAll(): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("emails")
      .select("source_id, subject, sender_email, sender_name, body_text, received_at")
      .eq("mailbox", MAILBOX)
      .eq("direction", "incoming")
      .order("received_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  // deterministic shuffle for reproducibility (seeded LCG)
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const rows = await fetchAll();
  const unknownBucket = rows.filter((r) => !isNoise(r));
  console.log(`=== Spike 004 — random sample of post-noise unknown bucket ===\n`);
  console.log(`Total inbound: ${rows.length}`);
  console.log(`Post-noise unknown (router workload): ${unknownBucket.length}`);
  console.log(`Sampling ${SAMPLE_N} (seed=42, deterministic)\n`);

  const sample = shuffle(unknownBucket, 42).slice(0, SAMPLE_N);

  sample.forEach((r, i) => {
    const subj = (r.subject || "(no subject)").slice(0, 110);
    const preview = (r.body_text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    console.log(`\n#${String(i + 1).padStart(2, "0")}  ${r.received_at.slice(0, 10)}  ${r.sender_email}`);
    console.log(`     Subj: ${subj}`);
    console.log(`     Body: ${preview}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

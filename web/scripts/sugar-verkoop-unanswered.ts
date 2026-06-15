/**
 * RAPPORT-V3 — ECHTE onbeantwoorde klantmail op verkoop@smeba.nl sinds 2026-05-01.
 *
 * Vervangt RAPPORT-V2. V2 had twee fatale fouten:
 *   1. Populatie via team-regex op Cases (`smeba|verkoop|kede|berki|fire control`)
 *      i.p.v. de mailbox zelf → mengde UK/Apex/Keyways-data mee en miste BX-Verkoop
 *      inbound. Sugar is een GEDEELDE groep-instance.
 *   2. "beantwoord" werd alléén gemeten via Outlook Sent-Items conversationId.
 *      Maar Sugar verstuurt antwoorden via een EIGEN SMTP-account — die komen NIET
 *      in verkoop@ Sent Items. Resultaat: 3/905 als beantwoord geteld (fout).
 *
 * V3-correcties:
 *   • SCOPE = Sugar `Emails` met `mailbox_name = "BX Verkoop"` (= verkoop@smeba.nl
 *     inbound; live geverifieerd: al die inbound heeft to_addrs_names=verkoop@smeba.nl).
 *     Alle andere mailboxen (UK/Apex/Keyways/Info) worden uitgesloten.
 *   • BEANTWOORD = OR van twee betrouwbare bronnen (GEEN subject-fuzzy):
 *       (A) Sugar-outbound op de case: een `Emails`-record met zelfde `parent_id`,
 *           `type="out"`, `date_sent` > inbound `date_sent`. (mei/Sugar-tijdperk)
 *       (B) Outlook Sent op ADRES: verkoop@ Sent Items bevat een bericht met een
 *           `toRecipients`-adres == het afzender-emailadres van de inbound, met
 *           `sentDateTime` > inbound `date_sent`. (juni/post-cutover)
 *   • Afzender-EMAILADRES = `from_addr_name` (live geverifieerd: op BX-Verkoop
 *     inbound is dit het echte e-mailadres, niet een displaynaam). Fallback op de
 *     `link/from` EmailParticipants-relate als het veld geen e-mailadres-vorm heeft.
 *
 * ── READ-ONLY ─────────────────────────────────────────────────────────────────
 * Alle externe calls zijn reads:
 *   - Sugar Emails + Cases  → POST .../filter (read), GET .../link/from (read)
 *   - Microsoft Graph       → GET Sent-Items page (verkoop@smeba.nl)
 * GEEN writes naar Sugar / Outlook / productie-tabellen. Output beperkt tot:
 * RAPPORT-V3.md + dit script.
 *
 * ── AUTH ──────────────────────────────────────────────────────────────────────
 *   - Sugar:   Zapier SDK connectie 58816663 ("Sugar CRM // NCrutzen").
 *   - Outlook: graphFetch() uit lib/outlook/client.ts (Zapier conn 56014785).
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 *   cd web && npx tsx scripts/sugar-verkoop-unanswered.ts            # dry-run: stdout-samenvatting
 *   cd web && npx tsx scripts/sugar-verkoop-unanswered.ts --apply    # schrijf RAPPORT-V3.md
 *
 * Flags:
 *   --apply             schrijf RAPPORT-V3.md (anders alleen stdout-samenvatting)
 *   --since=YYYY-MM-DD  ondergrens date_sent (default 2026-05-01)
 *   --max=<n>           debug: beperk aantal verwerkte inbound-mails
 *
 * Verwacht ~10-20 min door de Sugar-paginatie + Graph Sent-Items-paginatie.
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

import { writeFileSync } from "node:fs";
import { createZapierSdk } from "@zapier/zapier-sdk";
import { graphFetch } from "../lib/outlook/client";

// ── Config ──────────────────────────────────────────────────────────────────
const MAILBOX = "verkoop@smeba.nl";
const SUGAR_MAILBOX_NAME = "BX Verkoop"; // = verkoop@ inbound op de gedeelde Sugar-instance
const SUGAR_CONNECTION_ID = "58816663";
const SUGAR_BASE = "https://walkerfire.sugaropencloud.eu/rest/v11";
const SUGAR_CALL_TIMEOUT_MS = 25_000;
const GRAPH_DELAY_MS = 110;

const REPORT_PATH = resolve(
  __dirname,
  "..",
  "..",
  ".planning",
  "quick",
  "260611-jwt-sugarcrm-openstaande-e-mails-inventarisa",
  "RAPPORT-V3.md",
);

// Case-statussen die als GESLOTEN tellen (case-insensitive).
const CLOSED_STATUSES = new Set(
  ["closed", "resolved", "duplicate", "rejected", "cancelled", "canceled", "autoclosed"].map((s) =>
    s.toLowerCase(),
  ),
);

// ── Ruis-filters ──────────────────────────────────────────────────────────────
// Afzender-adres = bot / no-reply / notificatie.
const NOISE_SENDER_RE =
  /no[._-]?reply|noreply|notification|notifications|mailer-daemon|postmaster|subscribeletter/i;
// Subject = auto-reply / out-of-office / spamtag.
const NOISE_SUBJECT_RE =
  /\[SPAM\]|automatisch antwoord|automatic reply|out of office|afwezig|réponse automatique/i;
// Subject = interne Smeba-workflowmelding (geen klantmail).
const INTERNAL_WORKFLOW_RE =
  /Afspraak maken \(Smeba\)|Niet aanwezig \(Smeba\)|Openingstijden of n\.a\.w|Inzending contactformulier/i;

// Interne afzender-domeinen (geen klantmail). `kede*` uit de opdracht is een
// per-mailbox/medewerker-account, geen domein — we matchen het als adres-prefix.
const INTERNAL_DOMAINS = ["smeba.nl", "smeba-fire.be", "moyneroberts.com", "berki.nl"];
const INTERNAL_LOCAL_PREFIX_RE = /^kede/i; // kede* accounts

// Subject-prefixen die we strippen (alleen voor leesbaarheid in het rapport).
const PREFIX_RE = /^\s*(re|fw|fwd|antw|aw|betreft|tr)\s*:\s*/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Flags ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const sinceArg = argv.find((a) => a.startsWith("--since="));
const SINCE = sinceArg ? sinceArg.split("=")[1] : "2026-05-01";
const maxArg = argv.find((a) => a.startsWith("--max="));
const MAX = maxArg ? Math.max(1, parseInt(maxArg.split("=")[1], 10) || 0) : Infinity;

const zapier = createZapierSdk();

// ── Types ──────────────────────────────────────────────────────────────────────
interface InboundMail {
  email_id: string;
  case_id: string | null;
  subject: string;
  date_sent: string | null; // ISO van Sugar
  from_email: string; // lowercased afzender-emailadres
  from_raw: string | null; // ruwe from_addr_name
  month: string; // YYYY-MM
}

type AnsweredSource = "A" | "B" | "both" | "none";

interface ClassifiedMail extends InboundMail {
  case_status: string | null;
  is_open: boolean;
  answered: AnsweredSource;
  is_noise: boolean;
  noise_reason: string | null;
  is_internal: boolean;
  is_customer: boolean; // open ∧ onbeantwoord ∧ niet-ruis ∧ extern
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Sugar via Zapier SDK met harde per-call timeout + retry (relay kan hangen). */
async function sugarFetch(
  path: string,
  init: { method: string; body?: string },
  tries = 3,
): Promise<Response | null> {
  const url = path.startsWith("http") ? path : `${SUGAR_BASE}${path}`;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SUGAR_CALL_TIMEOUT_MS);
    try {
      const res = await zapier.fetch(url, {
        method: init.method,
        connectionId: SUGAR_CONNECTION_ID,
        headers: init.body ? { "Content-Type": "application/json" } : undefined,
        body: init.body,
        signal: ac.signal,
      } as Parameters<typeof zapier.fetch>[1]);
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === tries) {
        console.log(`      ⚠️ Sugar-call faalt (${attempt}/${tries}): ${String(err).slice(0, 80)}`);
        return null;
      }
      await sleep(300 * attempt);
    }
  }
  return null;
}

const GRAPH_CALL_TIMEOUT_MS = 30_000;
/** graphFetch() met harde abort-timeout zodat een hangende relay-call niet blokkeert. */
async function graphTimed(path: string): Promise<Response | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), GRAPH_CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([graphFetch(path, { method: "GET" }), timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function monthOf(s: string | null): string {
  return s ? s.slice(0, 7) : "?";
}
function dateOnly(s: string | null): string {
  return s ? s.slice(0, 10) : "?";
}
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}
function stripSubject(s: string | null | undefined): string {
  let out = (s ?? "").trim();
  for (let i = 0; i < 6; i++) {
    const next = out.replace(PREFIX_RE, "");
    if (next === out) break;
    out = next;
  }
  return out.replace(/^\[CASE:\d+\]\s*/i, "").trim();
}
function pct(n: number, d: number): string {
  return d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "0.0%";
}
const tsLt = (a: string | null, b: string | null): boolean => {
  // true wanneer a < b (beide ISO of null). null = onbekend → niet kleiner.
  if (!a || !b) return false;
  return new Date(a).getTime() < new Date(b).getTime();
};

// ── Step 1: BX-Verkoop inbound sinds SINCE ───────────────────────────────────
async function loadInbound(): Promise<InboundMail[]> {
  const mails: InboundMail[] = [];
  let offset = 0;
  let pages = 0;
  for (;;) {
    const res = await sugarFetch(`/Emails/filter`, {
      method: "POST",
      body: JSON.stringify({
        filter: [
          { mailbox_name: SUGAR_MAILBOX_NAME },
          { type: "inbound" },
          { date_sent: { $gte: `${SINCE}T00:00:00+00:00` } },
        ],
        fields: "id,name,date_sent,from_addr_name,parent_id,parent_type",
        max_num: 1000,
        offset,
      }),
    });
    if (!res) throw new Error(`Sugar /Emails/filter (inbound) gaf geen response op offset ${offset}`);
    if (!res.ok) throw new Error(`Sugar /Emails/filter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const b = (await res.json()) as { records: Record<string, unknown>[]; next_offset: number };
    for (const r of b.records) {
      const dateSent = (r.date_sent as string | null) ?? null;
      const fromRaw = (r.from_addr_name as string | null) ?? null;
      const fromEmail = (fromRaw ?? "").trim().toLowerCase();
      mails.push({
        email_id: String(r.id ?? ""),
        case_id: String(r.parent_type ?? "") === "Cases" ? ((r.parent_id as string | null) ?? null) : null,
        subject: String(r.name ?? ""),
        date_sent: dateSent,
        from_email: EMAIL_RE.test(fromEmail) ? fromEmail : fromEmail, // gevuld, evt. niet-email → resolve later
        from_raw: fromRaw,
        month: monthOf(dateSent),
      });
    }
    pages++;
    if (pages % 2 === 0) console.log(`      …${mails.length} inbound geladen (pagina ${pages})`);
    if (b.next_offset === -1 || b.records.length === 0) break;
    offset = b.next_offset;
    if (mails.length >= MAX) break;
  }
  const out = MAX === Infinity ? mails : mails.slice(0, MAX);
  console.log(`      ${out.length} BX-Verkoop inbound-mails sinds ${SINCE}.`);
  return out;
}

/** Fallback: resolve afzender-adres via EmailParticipants `link/from` als from_addr_name geen e-mailadres is. */
async function resolveSenderAddresses(mails: InboundMail[]): Promise<void> {
  const needResolve = mails.filter((m) => !EMAIL_RE.test(m.from_email));
  if (needResolve.length === 0) {
    console.log(`      Alle afzenders zijn al e-mailadres-vorm (from_addr_name) — geen link/from nodig.`);
    return;
  }
  console.log(`      ${needResolve.length} afzenders niet in e-mailadres-vorm → link/from resolven…`);
  let done = 0;
  for (const m of needResolve) {
    const res = await sugarFetch(
      `/Emails/${m.email_id}/link/from?fields=email_address&max_num=1`,
      { method: "GET" },
    );
    if (res && res.ok) {
      const b = (await res.json()) as { records?: { email_address?: string }[] };
      const addr = (b.records?.[0]?.email_address ?? "").trim().toLowerCase();
      if (EMAIL_RE.test(addr)) m.from_email = addr;
    }
    done++;
    if (done % 50 === 0) console.log(`        …${done}/${needResolve.length} afzenders geresolved`);
  }
}

// ── Step 2: case-status per distinct case_id ─────────────────────────────────
async function loadCaseStatuses(caseIds: string[]): Promise<Map<string, string>> {
  const status = new Map<string, string>();
  const CHUNK = 50;
  let chunks = 0;
  for (let i = 0; i < caseIds.length; i += CHUNK) {
    const chunk = caseIds.slice(i, i + CHUNK);
    const res = await sugarFetch(`/Cases/filter`, {
      method: "POST",
      body: JSON.stringify({
        filter: [{ id: { $in: chunk } }],
        fields: "id,status,name",
        max_num: 1000,
      }),
    });
    if (!res || !res.ok) {
      console.log(`      ⚠️ Cases-chunk ${i / CHUNK} faalde — statussen onbekend voor die ids.`);
      continue;
    }
    const b = (await res.json()) as { records?: Record<string, unknown>[] };
    for (const r of b.records ?? []) {
      status.set(String(r.id ?? ""), String(r.status ?? ""));
    }
    chunks++;
    if (chunks % 10 === 0) console.log(`      …${status.size}/${caseIds.length} case-statussen geladen`);
  }
  console.log(`      ${status.size} case-statussen geladen voor ${caseIds.length} distinct cases.`);
  return status;
}

// ── Step 3a (signal A): Sugar-outbound per case (laatste date_sent) ──────────
async function loadOutboundByCase(): Promise<Map<string, string>> {
  // Bulk: alle type="out" met date_sent>=SINCE; groepeer op parent_id (Cases) →
  // maximaal date_sent. Veel sneller dan per-case link-calls.
  const lastOut = new Map<string, string>(); // case_id → laatste outbound date_sent
  let offset = 0;
  let total = 0;
  let pages = 0;
  for (;;) {
    const res = await sugarFetch(`/Emails/filter`, {
      method: "POST",
      body: JSON.stringify({
        filter: [{ type: "out" }, { date_sent: { $gte: `${SINCE}T00:00:00+00:00` } }],
        fields: "id,date_sent,parent_id,parent_type",
        max_num: 1000,
        offset,
      }),
    });
    if (!res) throw new Error(`Sugar /Emails/filter (out) gaf geen response op offset ${offset}`);
    if (!res.ok) throw new Error(`Sugar /Emails/filter out ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const b = (await res.json()) as { records: Record<string, unknown>[]; next_offset: number };
    for (const r of b.records) {
      if (String(r.parent_type ?? "") !== "Cases") continue;
      const cid = (r.parent_id as string | null) ?? null;
      const ds = (r.date_sent as string | null) ?? null;
      if (!cid || !ds) continue;
      const prev = lastOut.get(cid);
      if (!prev || ds > prev) lastOut.set(cid, ds);
    }
    total += b.records.length;
    pages++;
    if (pages % 3 === 0) console.log(`      …${total} outbound gescand (${lastOut.size} cases met outbound)`);
    if (b.next_offset === -1 || b.records.length === 0) break;
    offset = b.next_offset;
  }
  console.log(`      ${total} type=out gescand → ${lastOut.size} cases met outbound sinds ${SINCE}.`);
  return lastOut;
}

// ── Step 3b (signal B): Outlook Sent-Items per ontvanger-adres ───────────────
async function loadSentByAddress(): Promise<Map<string, string[]>> {
  // adres(lowercase) → gesorteerde lijst sentDateTimes (oplopend).
  const map = new Map<string, string[]>();
  const fields = "toRecipients,sentDateTime,subject";
  const filter = encodeURIComponent(`sentDateTime ge ${SINCE}T00:00:00Z`);
  let url: string | null =
    `/users/${encodeURIComponent(MAILBOX)}/mailFolders/sentitems/messages?$top=500&$select=${fields}&$filter=${filter}`;
  let page = 0;
  let msgs = 0;
  while (url) {
    await sleep(GRAPH_DELAY_MS);
    const res = await graphTimed(url);
    if (!res) throw new Error(`Sent-Items page: geen response (timeout) op pagina ${page}`);
    if (!res.ok) throw new Error(`Sent-Items page ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = (await res.json()) as {
      value?: Array<{
        sentDateTime?: string;
        toRecipients?: Array<{ emailAddress?: { address?: string } }>;
      }>;
      "@odata.nextLink"?: string;
    };
    for (const m of data.value ?? []) {
      const sent = m.sentDateTime;
      if (!sent) continue;
      for (const rec of m.toRecipients ?? []) {
        const addr = (rec.emailAddress?.address ?? "").trim().toLowerCase();
        if (!addr) continue;
        const arr = map.get(addr) ?? [];
        arr.push(sent);
        map.set(addr, arr);
      }
      msgs++;
    }
    page++;
    if (page % 4 === 0) console.log(`      …Sent-Items pagina ${page} (${msgs} mails, ${map.size} adressen)`);
    url = data["@odata.nextLink"] ?? null;
  }
  for (const arr of map.values()) arr.sort();
  console.log(`      Sent-Items: ${msgs} verzonden mails → ${map.size} distinct ontvanger-adressen sinds ${SINCE}.`);
  return map;
}

// ── Classificatie ─────────────────────────────────────────────────────────────
function detectNoise(m: InboundMail): string | null {
  if (NOISE_SENDER_RE.test(m.from_email)) return "afzender (no-reply/notificatie)";
  if (NOISE_SUBJECT_RE.test(m.subject)) return "subject (auto-reply/out-of-office/spam)";
  if (INTERNAL_WORKFLOW_RE.test(m.subject)) return "subject (interne Smeba-workflowmelding)";
  return null;
}
function isInternal(m: InboundMail): boolean {
  const at = m.from_email.lastIndexOf("@");
  if (at < 0) return false;
  const local = m.from_email.slice(0, at);
  const domain = m.from_email.slice(at + 1);
  if (INTERNAL_DOMAINS.includes(domain)) return true;
  if (INTERNAL_LOCAL_PREFIX_RE.test(local)) return true;
  return false;
}

/** Beantwoord-bron bepalen via OR-logica (A: Sugar-outbound, B: Outlook Sent-adres). */
function answeredSource(
  m: InboundMail,
  outboundByCase: Map<string, string>,
  sentByAddress: Map<string, string[]>,
): AnsweredSource {
  // (A) Sugar-outbound op de case met date_sent > inbound date_sent
  let a = false;
  if (m.case_id) {
    const lastOut = outboundByCase.get(m.case_id);
    if (lastOut && tsLt(m.date_sent, lastOut)) a = true;
  }
  // (B) Outlook Sent naar het afzender-adres met sentDateTime > inbound date_sent
  let b = false;
  if (EMAIL_RE.test(m.from_email) && m.date_sent) {
    const sents = sentByAddress.get(m.from_email);
    if (sents && sents.length > 0) {
      // gesorteerd oplopend → laatste is de nieuwste
      const newest = sents[sents.length - 1];
      if (tsLt(m.date_sent, newest)) b = true;
    }
  }
  if (a && b) return "both";
  if (a) return "A";
  if (b) return "B";
  return "none";
}

// ── Report ─────────────────────────────────────────────────────────────────────
interface Counts {
  inbound: number;
  inboundCases: number;
  openCases: number;
  openMails: number;
  unanswered: number; // open ∧ niet-beantwoord
  unansweredNonNoise: number; // + niet-ruis
  customer: number; // + extern
  answeredA: number;
  answeredB: number;
  answeredBoth: number;
}

function buildReport(rows: ClassifiedMail[], c: Counts): string {
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const L: string[] = [];
  const distinctCases = (rs: ClassifiedMail[]) =>
    new Set(rs.filter((r) => r.case_id).map((r) => r.case_id)).size;

  const open = rows.filter((r) => r.is_open);
  const unanswered = open.filter((r) => r.answered === "none");
  const customer = rows.filter((r) => r.is_customer);

  L.push(`# RAPPORT-V3 — echte onbeantwoorde klantmail op verkoop@smeba.nl`);
  L.push("");
  L.push(`> PRODUCTION -- SugarCRM (Emails+Cases, read-only) + Microsoft Graph (Sent-Items, read-only)`);
  L.push(`> Quick task 260611-jwt · gegenereerd ${now} · mailbox \`${MAILBOX}\` · vanaf ${SINCE}`);
  L.push("");
  L.push(`> **Read-only.** Geen writes naar Sugar / Outlook / productie-tabellen — alleen dit rapport + script.`);
  L.push("");

  // 1. Context & methode
  L.push(`## 1. Context & methode`);
  L.push("");
  L.push(
    `Dit rapport **vervangt RAPPORT-V2**. V2 had twee fouten die het cijfer onbruikbaar maakten:`,
  );
  L.push("");
  L.push(
    `1. **Verkeerde populatie.** V2 selecteerde Cases via een team-regex ` +
      `(\`smeba|verkoop|kede|berki|fire control\`). Sugar is een **gedeelde groep-instance**; die ` +
      `regex liet UK/Apex/Keyways-data binnen en miste tegelijk BX-Verkoop inbound. V3 scopet ` +
      `**strikt op \`mailbox_name = "${SUGAR_MAILBOX_NAME}"\`** — live geverifieerd: al die inbound ` +
      `heeft \`to_addrs_names = verkoop@smeba.nl\`. Alle andere mailboxen worden uitgesloten.`,
  );
  L.push(
    `2. **Onbetrouwbaar beantwoord-signaal.** V2 keek alleen of de Outlook-conversatie een ` +
      `Sent-Items-reply had. Maar **Sugar verstuurt antwoorden via een eigen SMTP-account** — die ` +
      `komen NIET in verkoop@ Sent Items. Daardoor telde V2 maar 3/905 als beantwoord.`,
  );
  L.push("");
  L.push(`V3 bepaalt **beantwoord** via OR van twee betrouwbare bronnen (géén subject-fuzzy):`);
  L.push("");
  L.push(
    `- **(A) Sugar-outbound op de case** — er bestaat een \`Emails\`-record met dezelfde \`parent_id\` ` +
      `(case), \`type="out"\`, en \`date_sent\` > de inbound \`date_sent\`. Dekt het mei/Sugar-tijdperk.`,
  );
  L.push(
    `- **(B) Outlook Sent op ADRES** — verkoop@ Sent Items bevat een bericht met een ` +
      `\`toRecipients\`-adres == het afzender-emailadres van de inbound, met \`sentDateTime\` > inbound ` +
      `\`date_sent\`. Dekt juni/post-cutover. Match op **e-mailadres** (betrouwbaar), niet op subject.`,
  );
  L.push("");
  L.push(
    `Het afzender-emailadres komt uit \`from_addr_name\` (op BX-Verkoop inbound is dat live ` +
      `geverifieerd het echte e-mailadres), met fallback op de \`link/from\` EmailParticipants-relate.`,
  );
  L.push("");
  L.push(
    `Een case telt als **open** wanneer zijn status niet in ` +
      `{closed, resolved, duplicate, rejected, cancelled, canceled, autoclosed} valt.`,
  );
  L.push("");

  // 2. Trechter
  L.push(`## 2. Trechter`);
  L.push("");
  L.push(`| Stap | Mails | % van inbound | Distinct cases |`);
  L.push(`| --- | ---: | ---: | ---: |`);
  L.push(`| inbound verkoop@ (BX Verkoop) | ${c.inbound} | 100% | ${c.inboundCases} |`);
  L.push(`| ↳ in een **open** case | ${c.openMails} | ${pct(c.openMails, c.inbound)} | ${c.openCases} |`);
  L.push(
    `| ↳ **onbeantwoord** (na A+B) | ${c.unanswered} | ${pct(c.unanswered, c.inbound)} | ${distinctCases(unanswered)} |`,
  );
  L.push(
    `| ↳ **niet-ruis** | ${c.unansweredNonNoise} | ${pct(c.unansweredNonNoise, c.inbound)} | ${distinctCases(unanswered.filter((r) => !r.is_noise))} |`,
  );
  L.push(
    `| ↳ **extern** = ECHTE klantmail | ${c.customer} | ${pct(c.customer, c.inbound)} | ${distinctCases(customer)} |`,
  );
  L.push("");

  // 3. Maandsplitsing op de echte-klantmail-laag
  L.push(`## 3. Maandsplitsing — echte klantmail`);
  L.push("");
  const months = [...new Set(customer.map((r) => r.month))].sort();
  L.push(`| Maand | echte klantmail | distinct cases |`);
  L.push(`| --- | ---: | ---: |`);
  for (const m of months) {
    const mr = customer.filter((r) => r.month === m);
    L.push(`| ${m} | ${mr.length} | ${distinctCases(mr)} |`);
  }
  L.push(`| **totaal** | **${customer.length}** | **${distinctCases(customer)}** |`);
  L.push("");

  // 4. Beantwoord-bron-uitsplitsing
  const answeredOpen = open.filter((r) => r.answered !== "none");
  L.push(`## 4. Beantwoord-bron (op open cases)`);
  L.push("");
  L.push(
    `Van de ${c.openMails} inbound-mails in open cases zijn er **${answeredOpen.length} beantwoord**, verdeeld over:`,
  );
  L.push("");
  L.push(`| Bron | Mails |`);
  L.push(`| --- | ---: |`);
  L.push(`| (A) alleen Sugar-outbound | ${c.answeredA} |`);
  L.push(`| (B) alleen Outlook-Sent-adres | ${c.answeredB} |`);
  L.push(`| (A+B) beide | ${c.answeredBoth} |`);
  L.push(`| **totaal beantwoord** | **${answeredOpen.length}** |`);
  L.push("");
  L.push(
    `> Ter contrast: V2's enige signaal (Outlook conversatie-reply) ving slechts 3 mails. ` +
      `De Sugar-outbound-bron (A) is wat het mei-tijdperk redt.`,
  );
  L.push("");

  // 5. Concrete lijst echte onbeantwoorde klantmail (oudste eerst)
  const list = customer.slice().sort((a, b) => (a.date_sent ?? "").localeCompare(b.date_sent ?? ""));
  const caseCount = new Map<string, number>();
  for (const r of list) if (r.case_id) caseCount.set(r.case_id, (caseCount.get(r.case_id) ?? 0) + 1);
  const dedupMark = (r: ClassifiedMail) =>
    r.case_id && (caseCount.get(r.case_id) ?? 0) > 1 ? "ja" : "—";

  L.push(`## 5. Echte onbeantwoorde klantmail — concrete lijst (oudste eerst)`);
  L.push("");
  L.push(
    `Kolom "case-genoot" = ja wanneer dezelfde case nóg een onbeantwoorde klantmail heeft ` +
      `(zelfde werk, meerdere mails).`,
  );
  L.push("");
  if (list.length === 0) {
    L.push(`_Geen — er staat geen echte onbeantwoorde klantmail open._`);
  } else {
    L.push(`| Datum | Subject | Afzender (adres) | Case-id | Case-status | case-genoot |`);
    L.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const r of list) {
      L.push(
        `| ${dateOnly(r.date_sent)} | ${esc(stripSubject(r.subject)).slice(0, 80)} | ${esc(r.from_email).slice(0, 42)} | ${(r.case_id ?? "—").slice(0, 8)} | ${esc(r.case_status) || "?"} | ${dedupMark(r)} |`,
      );
    }
  }
  L.push("");

  // 6. Outlook-locatie — bewust weggelaten
  L.push(`## 6. Outlook-locatie`);
  L.push("");
  L.push(
    `**Bewust weggelaten.** Een betrouwbare Inbox/Archive-locatie vereist een exacte koppeling op ` +
      `\`internet_message_id\` via onze eigen pipeline. Sugar's \`message_id\` is een opaque 32-hex hash ` +
      `(géén RFC Message-ID) en is niet reproduceerbaar naar Outlook. De enige resterende route is ` +
      `subject-fuzzy \`$search\` — die gaf in V2 valse zekerheid (222× "niet gevonden", veel mismatch). ` +
      `Liever géén kolom dan een onbetrouwbare. Wie de fysieke locatie wil: koppel via de pipeline ` +
      `\`internet_message_id\` (aparte vervolgstap), niet via subject.`,
  );
  L.push("");

  // 7. Kanttekeningen + beslis-opties
  L.push(`## 7. Kanttekeningen & beslis-opties`);
  L.push("");
  L.push(`**Kanttekeningen**`);
  L.push("");
  L.push(
    `- **Beantwoord (B) = adres-niveau, nieuwste Sent.** We matchen op het afzender-adres met de ` +
      `nieuwste \`sentDateTime\` ná de inbound. Bij een afzender met meerdere losse threads kan dit een ` +
      `antwoord op een ándere mail van dezelfde persoon als "beantwoord" tellen — lichte overschatting ` +
      `van beantwoord op high-volume-afzenders. Bewuste keuze: adres is betrouwbaarder dan subject.`,
  );
  L.push(
    `- **Beantwoord (A) = case-niveau.** Elke Sugar-outbound op de case ná de inbound telt als ` +
      `antwoord, ook als het een ándere mail in dezelfde case beantwoordt. Voor "is er nog werk?" is ` +
      `case-niveau het juiste aggregatieniveau.`,
  );
  L.push(
    `- **Case-status snapshot.** Statussen zijn op rapportagemoment opgehaald; een case die ná de ` +
      `inbound gesloten is, telt nu correct als niet-open.`,
  );
  L.push(
    `- **Intern vs. ruis.** Interne afzenders (${INTERNAL_DOMAINS.join(", ")}, \`kede*\`) zijn apart ` +
      `uitgesloten van "echte klantmail" maar zijn géén ruis — het kan reëel intern werk zijn.`,
  );
  L.push("");
  L.push(`**Beslis-opties**`);
  L.push("");
  L.push(
    `1. **Attentielijst** — lever §5 (echte onbeantwoorde klantmail, oudste eerst) als werkvoorraad ` +
      `aan verkoop. Dit is de feitelijke backlog.`,
  );
  L.push(
    `2. **Sugar-Archive terugzetten** — als blijkt dat een deel in Sugar weggearchiveerd is en daardoor ` +
      `onzichtbaar, een gerichte (aparte, niet-read-only) move-actie ná akkoord.`,
  );
  L.push(
    `3. **Sugar-status opschonen** — de beantwoorde-maar-"New" cases (bron A/B) zijn stale; een ` +
      `Sugar-bulkclose op die set ruimt de telling op zonder klantimpact.`,
  );
  L.push("");
  L.push(`> Elke schrijf-actie blijft buiten scope van dit rapport — dit levert de feiten.`);
  L.push("");
  return L.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `PRODUCTION -- SugarCRM (Emails+Cases) + Microsoft Graph (Sent-Items) -- Actie: echte onbeantwoorde klantmail verkoop@ (READ-ONLY)`,
  );
  console.log(
    `mode=${APPLY ? "APPLY (schrijf RAPPORT-V3.md)" : "dry-run"} · since=${SINCE}` +
      (MAX !== Infinity ? ` · max=${MAX}` : ""),
  );
  console.log("READ-ONLY: geen writes naar Sugar / Outlook / productie-tabellen.\n");

  // 1 — inbound populatie
  console.log(`[1/5] BX-Verkoop inbound laden uit Sugar (date_sent >= ${SINCE})…`);
  const inbound = await loadInbound();
  await resolveSenderAddresses(inbound);

  // 2 — case-statussen
  const caseIds = [...new Set(inbound.map((m) => m.case_id).filter((x): x is string => !!x))];
  console.log(`[2/5] Case-status laden voor ${caseIds.length} distinct cases…`);
  const caseStatus = await loadCaseStatuses(caseIds);

  // 3 — beantwoord-signalen (A bulk-outbound, B Outlook Sent-adres)
  console.log(`[3/5] Beantwoord-signalen laden — (A) Sugar-outbound + (B) Outlook Sent-adres…`);
  const [outboundByCase, sentByAddress] = await Promise.all([
    loadOutboundByCase(),
    loadSentByAddress(),
  ]);

  // 4 — classificeren
  console.log(`[4/5] Classificeren (open? · beantwoord? · ruis? · intern/extern?)…`);
  const rows: ClassifiedMail[] = inbound.map((m) => {
    const status = m.case_id ? (caseStatus.get(m.case_id) ?? null) : null;
    // Onbekende status (geen case of niet opgehaald) → behandelen als open (conservatief:
    // we willen geen openstaande mail wegmoffelen omdat de status ontbreekt).
    const is_open = !status || !CLOSED_STATUSES.has(status.toLowerCase());
    const answered = answeredSource(m, outboundByCase, sentByAddress);
    const noiseReason = detectNoise(m);
    const is_noise = noiseReason !== null;
    const internal = isInternal(m);
    const is_customer = is_open && answered === "none" && !is_noise && !internal;
    return {
      ...m,
      case_status: status,
      is_open,
      answered,
      is_noise,
      noise_reason: noiseReason,
      is_internal: internal,
      is_customer,
    } satisfies ClassifiedMail;
  });

  // tellingen
  const open = rows.filter((r) => r.is_open);
  const unanswered = open.filter((r) => r.answered === "none");
  const unansweredNonNoise = unanswered.filter((r) => !r.is_noise);
  const customer = rows.filter((r) => r.is_customer);
  const answeredOpen = open.filter((r) => r.answered !== "none");
  const distinct = (rs: ClassifiedMail[]) =>
    new Set(rs.filter((r) => r.case_id).map((r) => r.case_id)).size;

  const counts: Counts = {
    inbound: rows.length,
    inboundCases: distinct(rows),
    openCases: distinct(open),
    openMails: open.length,
    unanswered: unanswered.length,
    unansweredNonNoise: unansweredNonNoise.length,
    customer: customer.length,
    answeredA: answeredOpen.filter((r) => r.answered === "A").length,
    answeredB: answeredOpen.filter((r) => r.answered === "B").length,
    answeredBoth: answeredOpen.filter((r) => r.answered === "both").length,
  };

  // 5 — report
  console.log(
    `[5/5] Klaar. inbound=${counts.inbound} (cases=${counts.inboundCases}) → open=${counts.openMails} ` +
      `→ onbeantwoord=${counts.unanswered} → niet-ruis=${counts.unansweredNonNoise} → echte klantmail=${counts.customer}`,
  );
  console.log(
    `      beantwoord-bron: A=${counts.answeredA} B=${counts.answeredB} beide=${counts.answeredBoth} ` +
      `(totaal beantwoord op open cases = ${answeredOpen.length})`,
  );

  const report = buildReport(rows, counts);
  if (APPLY) {
    writeFileSync(REPORT_PATH, report, "utf8");
    console.log(`\n✓ RAPPORT-V3.md geschreven: ${REPORT_PATH}`);
  } else {
    console.log("\n— Dry-run: trechter-samenvatting hierboven. Re-run met --apply om RAPPORT-V3.md te schrijven. —");
  }

  // compacte machine-leesbare samenvatting (altijd, voor de aanroeper)
  console.log(
    `\nSUMMARY ${JSON.stringify({
      inbound: counts.inbound,
      open: counts.openMails,
      onbeantwoord: counts.unanswered,
      niet_ruis: counts.unansweredNonNoise,
      echte_klantmail: counts.customer,
      beantwoord_A: counts.answeredA,
      beantwoord_B: counts.answeredB,
      beantwoord_beide: counts.answeredBoth,
    })}`,
  );
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

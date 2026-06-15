/**
 * Read-only TRIAGE van de ±900 recente "New" SugarCRM-cases (mei+juni 2026,
 * Smeba/NL-teams). Vervolg op quick task 260611-jwt — zie het ADDENDUM in
 * RAPPORT.md: de eerdere DB-snapshot liep maar t/m 2026-05-06, dus we halen de
 * populatie nu RECHTSTREEKS uit Sugar (Cases = source of truth) en delen hem op
 * in drie buckets:
 *
 *   (a) BEANTWOORD  — de mail is in Outlook al beantwoord (zelfde conversatie
 *                     heeft een Sent-Items-reply NA de inbound). Sugar-status
 *                     "New" is hier stale; geen actie nodig.
 *   (b) RUIS        — geen antwoord nodig (no-reply/notificatie afzender, auto-
 *                     reply/out-of-office subject, óf onze eigen Stage-1
 *                     noise-classificatie gaf een noise-verdict).
 *   (c) ONBEANTWOORD— de rest: écht openstaand werk.
 *
 * Per mail bepalen we ook de Outlook-LOCATIE (Inbox / Sugar Archive / overig /
 * niet gevonden) zodat zichtbaar wordt welke onbeantwoorde mails in de voor het
 * team onzichtbare "Sugar Archive" zijn weggeveegd.
 *
 * Categorieën zijn EXCLUSIEF in deze volgorde: beantwoord > ruis > onbeantwoord.
 *
 * ── READ-ONLY ─────────────────────────────────────────────────────────────
 * Alle externe calls zijn reads:
 *   - Sugar Cases + Emails modules        → POST .../filter + GET .../link/emails (read)
 *   - Microsoft Graph (verkoop@smeba.nl)  → GET (Sent-Items page, message lookup, $search)
 *   - Supabase email_pipeline.emails / public.pipeline_events / outlook_folder_map → SELECT
 * GEEN writes naar Sugar, Outlook (geen move/PATCH) of productie-tabellen.
 * Output beperkt tot: RAPPORT-V2.md + dit script.
 *
 * ── AUTH ──────────────────────────────────────────────────────────────────
 *   - Sugar:    Zapier SDK connectie 58816663 ("Sugar CRM // NCrutzen").
 *   - Outlook:  graphFetch() uit lib/outlook/client.ts (Zapier conn 56014785).
 *   - Supabase: SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL uit
 *               web/.env.local (waarden mogelijk double-quoted → strip).
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────
 *   cd web && npx tsx scripts/sugar-backlog-triage.ts            # dry-run: stdout-samenvatting, schrijft niets
 *   cd web && npx tsx scripts/sugar-backlog-triage.ts --apply    # schrijf RAPPORT-V2.md
 *
 * Flags:
 *   --apply             schrijf RAPPORT-V2.md (anders alleen stdout)
 *   --since=YYYY-MM-DD   ondergrens date_entered (default 2026-05-01)
 *   --fuzzy-cap=<n>      max Graph $search lookups voor locatie (default 500)
 *   --max-cases=<n>      debug: beperk aantal verwerkte cases (default: alle)
 *
 * Verwacht ~10-20 min door de per-case Sugar link-calls + Graph-lookups.
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createZapierSdk } from "@zapier/zapier-sdk";
import { graphFetch } from "../lib/outlook/client";

// ── Config ──────────────────────────────────────────────────────────────────
const MAILBOX = "verkoop@smeba.nl";
const SUGAR_CONNECTION_ID = "58816663";
const SUGAR_BASE = "https://walkerfire.sugaropencloud.eu/rest/v11";
const SALES_SWARM = "sales-email";
const GRAPH_DELAY_MS = 110; // throttle tussen Graph-calls
const SUGAR_DELAY_MS = 40; // lichte throttle tussen per-case link-calls
// Smeba/NL-teams (zelfde regex als tmp-sugar-new-smeba.ts, live geverifieerd).
const TEAM_RE = /smeba|verkoop|kede|berki|fire control/i;

const REPORT_PATH = resolve(
  __dirname,
  "..",
  "..",
  ".planning",
  "quick",
  "260611-jwt-sugarcrm-openstaande-e-mails-inventarisa",
  "RAPPORT-V2.md",
);

// Ruis-signalen op afzender (no-reply/notificatie-bots).
const NOISE_SENDER_RE =
  /no[._-]?reply|noreply|do[._-]?not[._-]?reply|donotreply|mailer-daemon|postmaster|notification|notifications|notify|automated|auto[._-]?confirm|bounce|newsletter|nieuwsbrief/i;
// Ruis-signalen op subject (auto-replies / out-of-office).
const NOISE_SUBJECT_RE =
  /automatisch antwoord|automatische ontvangstbevestiging|auto.?reply|auto.?reactie|out of office|afwezig|afwezigheid|undeliverable|onbestelbaar|delivery (status|has failed)|read receipt|leesbevestiging/i;
// Smeba's eigen spamfilter tagt het subject met "[SPAM]" (na de optionele
// [CASE:1234]-tag die Sugar er nog voor plakt). Sterk, goedkoop ruis-signaal —
// zonder dit beland de hele spam-lichting onterecht in "onbeantwoord".
const SPAM_TAG_RE = /^\s*(\[CASE:\d+\]\s*)?\[?SPAM\]?\b/i;

// Subject-prefixen die we strippen voor fuzzy-match (RE:/FW:/Betreft:/Antw:).
const PREFIX_RE = /^\s*(re|fw|fwd|antw|aw|betreft|tr)\s*:\s*/i;

// ── Flags ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const sinceArg = argv.find((a) => a.startsWith("--since="));
const SINCE = sinceArg ? sinceArg.split("=")[1] : "2026-05-01";
const fuzzyArg = argv.find((a) => a.startsWith("--fuzzy-cap="));
const FUZZY_CAP = fuzzyArg ? Math.max(0, parseInt(fuzzyArg.split("=")[1], 10) || 0) : 500;
const maxCasesArg = argv.find((a) => a.startsWith("--max-cases="));
const MAX_CASES = maxCasesArg ? Math.max(1, parseInt(maxCasesArg.split("=")[1], 10) || 0) : Infinity;

// ── Supabase admin client ────────────────────────────────────────────────────
const supaUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
  /"/g,
  "",
);
const supaKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g, "");
if (!supaUrl || !supaKey) {
  console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreekt in web/.env.local");
  process.exit(1);
}
const admin = createClient(supaUrl, supaKey);
const ep = admin.schema("email_pipeline");
const zapier = createZapierSdk();

// ── Types ────────────────────────────────────────────────────────────────────
type Category = "beantwoord" | "ruis" | "onbeantwoord";
type Location = "inbox" | "sugar_archive" | "overig" | "niet_gevonden";
type MatchConfidence = "exact" | "fuzzy" | "none";

interface SugarMail {
  case_id: string;
  email_id: string;
  subject: string;
  date_sent: string | null;
  from_name: string | null;
  message_id: string | null;
  type: string | null; // inbound / outbound / out / in
  direction: string | null; // Inbound / Outbound / Internal
  team_primary: string | null;
  month: string; // YYYY-MM van date_sent (fallback case date_entered)
}

interface OutlookLoc {
  folder_display: string | null;
  location: Location;
  conversation_id: string | null;
  received_at: string | null;
  confidence: MatchConfidence;
}

interface TriageRow extends SugarMail, OutlookLoc {
  category: Category;
  ruis_reason: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const normId = (s: string | null | undefined): string =>
  (s ?? "").replace(/[<>]/g, "").trim().toLowerCase();

function stripSubject(s: string | null | undefined): string {
  let out = (s ?? "").trim();
  // strip herhaalde prefixen (RE: FW: Betreft: …)
  for (let i = 0; i < 6; i++) {
    const next = out.replace(PREFIX_RE, "");
    if (next === out) break;
    out = next;
  }
  // strip case-tag [CASE:1234] dat Sugar voor het subject plakt
  out = out.replace(/^\[CASE:\d+\]\s*/i, "").trim();
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sugar via Zapier SDK met harde per-call timeout + retry. De Zapier-relay kan
 * af en toe een call laten hangen zonder ooit te resolven; zonder timeout
 * blokkeert dat de hele per-case loop (waargenomen: 36 min stil op één
 * link/emails-call). AbortController kapt af; we retryen tot `tries` keer.
 */
const SUGAR_CALL_TIMEOUT_MS = 25_000;
const GRAPH_CALL_TIMEOUT_MS = 30_000;

/**
 * graphFetch() heeft eigen socket/504-retry maar geen harde abort-timeout; een
 * hangende relay-call zou de matching-loop net zo goed kunnen blokkeren. We
 * racen elke Graph-call tegen een timeout en geven null terug i.p.v. te hangen.
 */
async function graphTimed(path: string): Promise<Response | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), GRAPH_CALL_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([graphFetch(path, { method: "GET" }), timeout]);
    return res;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
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

function monthOf(s: string | null): string {
  return s ? s.slice(0, 7) : "?";
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function dateOnly(s: string | null): string {
  return s ? s.slice(0, 10) : "?";
}

// ── Step 1: Smeba/NL "New" cases sinds SINCE ─────────────────────────────────
interface CaseRef {
  id: string;
  team_primary: string | null;
  date_entered: string | null;
}
async function loadNewSmebaCases(): Promise<CaseRef[]> {
  const cases: CaseRef[] = [];
  let offset = 0;
  let scanned = 0;
  for (;;) {
    const res = await sugarFetch(`/Cases/filter`, {
      method: "POST",
      body: JSON.stringify({
        filter: [{ status: "New" }, { date_entered: { $gte: `${SINCE}T00:00:00+00:00` } }],
        fields: "id,team_name,date_entered",
        max_num: 1000,
        offset,
      }),
    });
    if (!res) throw new Error(`Sugar /Cases/filter gaf geen response (na retries) op offset ${offset}`);
    if (!res.ok) throw new Error(`Sugar /Cases/filter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const b = (await res.json()) as { records: Record<string, unknown>[]; next_offset: number };
    scanned += b.records.length;
    for (const r of b.records) {
      const teams = Array.isArray(r.team_name)
        ? (r.team_name as { name?: string; primary?: boolean }[])
        : [];
      if (!teams.some((t) => TEAM_RE.test(t.name ?? ""))) continue;
      const primary = teams.find((t) => t.primary) ?? teams[0];
      cases.push({
        id: String(r.id ?? ""),
        team_primary: primary?.name ?? null,
        date_entered: (r.date_entered as string | null) ?? null,
      });
    }
    if (b.next_offset === -1 || b.records.length === 0) break;
    offset = b.next_offset;
    if (scanned % 5000 === 0) console.log(`    …${scanned} New-cases gescand (${cases.length} Smeba/NL)`);
  }
  console.log(`      ${scanned} New-cases gescand → ${cases.length} Smeba/NL-team.`);
  return cases.slice(0, MAX_CASES === Infinity ? cases.length : MAX_CASES);
}

// ── Step 2: inbound trigger-mail per case ────────────────────────────────────
const SUGAR_CONCURRENCY = 6; // bounded pool — absorbeert relay-latency zonder Sugar te overspoelen

async function loadCaseMailsOne(c: CaseRef): Promise<SugarMail[]> {
  const res = await sugarFetch(
    `/Cases/${c.id}/link/emails?max_num=50&fields=id,name,date_sent,from_addr_name,message_id,type,direction,status`,
    { method: "GET" },
  );
  if (!res || !res.ok) return [];
  const b = (await res.json()) as { records?: Record<string, unknown>[] };
  const recs = b.records ?? [];
  // Inbound trigger-mail(s): type 'inbound'/'in' of direction 'Inbound'. Als er
  // geen inbound is, neem de OUDSTE mail van de case als trigger.
  const inbound = recs.filter((m) => {
    const t = String(m.type ?? "").toLowerCase();
    const d = String(m.direction ?? "").toLowerCase();
    return t === "inbound" || t === "in" || d === "inbound";
  });
  const chosen =
    inbound.length > 0
      ? inbound
      : recs
          .slice()
          .sort((a, b2) => String(a.date_sent ?? "").localeCompare(String(b2.date_sent ?? "")))
          .slice(0, 1);
  return chosen.map((m) => {
    const dateSent = (m.date_sent as string | null) ?? null;
    return {
      case_id: c.id,
      email_id: String(m.id ?? ""),
      subject: String(m.name ?? ""),
      date_sent: dateSent,
      from_name: (m.from_addr_name as string | null) ?? null,
      message_id: (m.message_id as string | null) ?? null,
      type: (m.type as string | null) ?? null,
      direction: (m.direction as string | null) ?? null,
      team_primary: c.team_primary,
      month: monthOf(dateSent ?? c.date_entered),
    } satisfies SugarMail;
  });
}

/** Haal per case de gekoppelde e-mails met bounded concurrency. */
async function loadCaseMails(cases: CaseRef[]): Promise<SugarMail[]> {
  const mails: SugarMail[] = [];
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= cases.length) return;
      const got = await loadCaseMailsOne(cases[i]);
      mails.push(...got);
      done++;
      if (done % 100 === 0) {
        console.log(`      …${done}/${cases.length} cases verwerkt (${mails.length} inbound-mails)`);
      }
    }
  }
  await Promise.all(Array.from({ length: SUGAR_CONCURRENCY }, () => worker()));
  return mails;
}

// ── Step 3a: Sent-Items index (conversationId → laatste sentDateTime) ─────────
async function loadSentIndex(): Promise<Map<string, string>> {
  const idx = new Map<string, string>();
  const fields = "conversationId,sentDateTime,subject";
  const filter = encodeURIComponent(`sentDateTime ge ${SINCE}T00:00:00Z`);
  let url: string | null =
    `/users/${encodeURIComponent(MAILBOX)}/mailFolders/sentitems/messages?$top=500&$select=${fields}&$filter=${filter}`;
  let page = 0;
  while (url) {
    await sleep(GRAPH_DELAY_MS);
    const res = await graphTimed(url);
    if (!res) throw new Error(`Sent-Items page: geen response (timeout) op pagina ${page}`);
    if (!res.ok) {
      throw new Error(`Sent-Items page ${res.status}: ${(await res.text()).slice(0, 160)}`);
    }
    const data = (await res.json()) as {
      value?: Array<{ conversationId?: string; sentDateTime?: string }>;
      "@odata.nextLink"?: string;
    };
    for (const m of data.value ?? []) {
      const cid = m.conversationId;
      const sent = m.sentDateTime;
      if (!cid || !sent) continue;
      const prev = idx.get(cid);
      if (!prev || sent > prev) idx.set(cid, sent);
    }
    page++;
    if (page % 4 === 0) console.log(`      …Sent-Items pagina ${page} (${idx.size} conversaties)`);
    url = data["@odata.nextLink"] ?? null;
  }
  console.log(`      Sent-Items: ${idx.size} distinct conversaties met reply sinds ${SINCE}.`);
  return idx;
}

// ── Step 3b: pipeline noise-index (internet_message_id → noise-decision) ──────
async function loadPipelineNoiseIndex(): Promise<Map<string, string>> {
  // verkoop@ emails sinds SINCE met hun internet_message_id …
  const emailIdToMsgId = new Map<string, string>(); // email_id → normId(internet_message_id)
  let from = 0;
  const size = 1000;
  for (;;) {
    const { data, error } = await ep
      .from("emails")
      .select("id,internet_message_id")
      .eq("source", "outlook")
      .eq("mailbox", MAILBOX)
      .gte("received_at", `${SINCE}T00:00:00Z`)
      .range(from, from + size - 1);
    if (error) throw new Error(`pipeline emails: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const mid = normId((r as { internet_message_id?: string }).internet_message_id);
      if (mid) emailIdToMsgId.set(String((r as { id: string }).id), mid);
    }
    if (data.length < size) break;
    from += size;
  }
  // … gekoppeld aan hun stage-1 noise-verdict (decision != unknown = ruis).
  const noise = new Map<string, string>(); // normId(message_id) → decision
  const allIds = [...emailIdToMsgId.keys()];
  for (let i = 0; i < allIds.length; i += 300) {
    const chunk = allIds.slice(i, i + 300);
    const { data, error } = await admin
      .from("pipeline_events")
      .select("email_id,decision")
      .eq("stage", 1)
      .eq("swarm_type", SALES_SWARM)
      .in("email_id", chunk);
    if (error) throw new Error(`pipeline_events: ${error.message}`);
    for (const r of data ?? []) {
      const dec = String((r as { decision?: string }).decision ?? "");
      if (!dec || dec === "unknown") continue;
      const mid = emailIdToMsgId.get(String((r as { email_id: string }).email_id));
      if (mid) noise.set(mid, dec);
    }
  }
  console.log(
    `      pipeline noise-index: ${emailIdToMsgId.size} verkoop-mails geïngest, ${noise.size} met Stage-1 noise-verdict.`,
  );
  return noise;
}

// ── Step 4: Outlook-locatie + conversatie per Sugar-mail ─────────────────────
/** folder_id → display_name + bucket-afgeleide location. */
async function loadFolderMap(): Promise<Map<string, { display: string; location: Location }>> {
  const { data, error } = await admin
    .from("outlook_folder_map")
    .select("folder_id, display_name, bucket")
    .eq("mailbox", MAILBOX);
  if (error) throw new Error(`outlook_folder_map: ${error.message}`);
  const map = new Map<string, { display: string; location: Location }>();
  for (const f of data ?? []) {
    const display = String(f.display_name ?? "?");
    const bucket = String(f.bucket ?? "other");
    let loc: Location = "overig";
    if (bucket === "inbox") loc = "inbox";
    else if (/sugar archive/i.test(display)) loc = "sugar_archive";
    else loc = "overig";
    map.set(String(f.folder_id), { display, location: loc });
  }
  return map;
}

/** Outlook-index uit eigen pipeline: normId(message-id) → graph source_id. */
async function loadOutlookExactIndex(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let from = 0;
  const size = 1000;
  for (;;) {
    const { data, error } = await ep
      .from("emails")
      .select("source_id,internet_message_id,raw_json")
      .eq("source", "outlook")
      .eq("mailbox", MAILBOX)
      .gte("received_at", `${SINCE}T00:00:00Z`)
      .range(from, from + size - 1);
    if (error) throw new Error(`outlook exact index: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const rj = ((r as { raw_json?: Record<string, unknown> }).raw_json ?? {}) as Record<string, unknown>;
      const id =
        normId((r as { internet_message_id?: string }).internet_message_id) ||
        normId(rj.internetMessageId as string | null);
      const sid = String((r as { source_id?: string }).source_id ?? "");
      if (id && sid && !map.has(id)) map.set(id, sid);
    }
    if (data.length < size) break;
    from += size;
  }
  return map;
}

const graphMetaCache = new Map<string, { parentFolderId: string | null; conversationId: string | null; receivedDateTime: string | null }>();
async function graphMeta(
  graphId: string,
): Promise<{ parentFolderId: string | null; conversationId: string | null; receivedDateTime: string | null }> {
  if (graphMetaCache.has(graphId)) return graphMetaCache.get(graphId)!;
  await sleep(GRAPH_DELAY_MS);
  const res = await graphTimed(
    `/users/${encodeURIComponent(MAILBOX)}/messages/${encodeURIComponent(
      graphId,
    )}?$select=parentFolderId,conversationId,receivedDateTime,internetMessageId`,
  );
  if (!res || !res.ok) {
    const v = { parentFolderId: null, conversationId: null, receivedDateTime: null };
    graphMetaCache.set(graphId, v);
    return v;
  }
  const d = (await res.json()) as {
    parentFolderId?: string;
    conversationId?: string;
    receivedDateTime?: string;
  };
  const v = {
    parentFolderId: d.parentFolderId ?? null,
    conversationId: d.conversationId ?? null,
    receivedDateTime: d.receivedDateTime ?? null,
  };
  graphMetaCache.set(graphId, v);
  return v;
}

/** Trap B: fuzzy $search op gestript subject; kies hit binnen ±2 dagen van date_sent. */
async function fuzzyFind(
  mail: SugarMail,
): Promise<{ parentFolderId: string | null; conversationId: string | null; receivedDateTime: string | null } | null> {
  const subject = stripSubject(mail.subject).replace(/"/g, "").trim();
  if (!subject) return null;
  const q = encodeURIComponent(`"${subject.slice(0, 120)}"`);
  await sleep(GRAPH_DELAY_MS);
  const res = await graphTimed(
    `/users/${encodeURIComponent(
      MAILBOX,
    )}/messages?$search=${q}&$top=10&$select=id,subject,receivedDateTime,parentFolderId,conversationId`,
  );
  if (!res || !res.ok) return null;
  const data = (await res.json()) as {
    value?: Array<{
      id: string;
      receivedDateTime?: string;
      parentFolderId?: string;
      conversationId?: string;
    }>;
  };
  const hits = data.value ?? [];
  if (hits.length === 0) return null;
  const target = mail.date_sent ? new Date(mail.date_sent).getTime() : null;
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  let pick = hits[0];
  if (target !== null) {
    const near = hits
      .filter((h) => h.receivedDateTime)
      .map((h) => ({ h, dt: Math.abs(new Date(h.receivedDateTime!).getTime() - target) }))
      .filter((x) => x.dt <= twoDays)
      .sort((a, b) => a.dt - b.dt)[0];
    if (!near) return null; // geen hit binnen ±2 dagen → niet betrouwbaar
    pick = near.h;
  }
  return {
    parentFolderId: pick.parentFolderId ?? null,
    conversationId: pick.conversationId ?? null,
    receivedDateTime: pick.receivedDateTime ?? null,
  };
}

// ── Classificatie ─────────────────────────────────────────────────────────────
function detectRuisPattern(mail: SugarMail): string | null {
  if (SPAM_TAG_RE.test(mail.subject ?? "")) return "subject ([SPAM]-tag)";
  if (NOISE_SENDER_RE.test(mail.from_name ?? "")) return "afzender (no-reply/notificatie)";
  if (NOISE_SUBJECT_RE.test(mail.subject ?? "")) return "subject (auto-reply/out-of-office)";
  return null;
}

// ── Report ─────────────────────────────────────────────────────────────────────
interface Agg {
  totalMails: number;
  totalCases: number;
  since: string;
  fuzzyCap: number;
  fuzzyUsed: number;
  fuzzyOverCap: number;
}

function pct(n: number, d: number): string {
  return d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "0.0%";
}

const LOC_LABEL: Record<Location, string> = {
  inbox: "Inbox",
  sugar_archive: "Sugar Archive",
  overig: "overig",
  niet_gevonden: "niet gevonden",
};

function buildReport(rows: TriageRow[], agg: Agg): string {
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const L: string[] = [];
  const cats: Category[] = ["beantwoord", "ruis", "onbeantwoord"];
  const locs: Location[] = ["inbox", "sugar_archive", "overig", "niet_gevonden"];

  const byCat = (c: Category) => rows.filter((r) => r.category === c);
  const distinctCases = (rs: TriageRow[]) => new Set(rs.map((r) => r.case_id)).size;

  L.push(`# Triage V2 — recente "New" SugarCRM-cases: beantwoord / ruis / onbeantwoord`);
  L.push("");
  L.push(`> PRODUCTION -- SugarCRM (Cases+Emails, read-only) + Microsoft Graph (read-only) + Supabase (read-only)`);
  L.push(`> Quick task 260611-jwt · gegenereerd ${now} · mailbox \`${MAILBOX}\` · vanaf ${agg.since}`);
  L.push("");

  // 1. Context & methode
  L.push(`## 1. Context & methode`);
  L.push("");
  L.push(
    `Vervolg op het ADDENDUM in RAPPORT.md: de eerdere telling werkte op een DB-snapshot ` +
      `die maar t/m 2026-05-06 liep. Dit rapport haalt de populatie **rechtstreeks uit Sugar** ` +
      `(Cases = source of truth): alle cases met status **"New"** en \`date_entered >= ${agg.since}\` ` +
      `voor de Smeba/NL-teams (\`${TEAM_RE.source}\`). Per case nemen we de **inbound trigger-mail**.`,
  );
  L.push("");
  L.push(`We delen elke mail EXCLUSIEF in (volgorde: beantwoord > ruis > onbeantwoord):`);
  L.push("");
  L.push(
    `- **beantwoord** — de Outlook-conversatie (\`conversationId\`) heeft een Sent-Items-reply ` +
      `NA de inbound. Sugar-status "New" is hier stale → geen actie.`,
  );
  L.push(
    `- **ruis** — subject draagt een \`[SPAM]\`-tag (Smeba's eigen spamfilter), afzender matcht ` +
      `no-reply/notificatie, subject matcht auto-reply/out-of-office, óf onze eigen Stage-1 ` +
      `noise-classificatie (\`pipeline_events\`, swarm \`${SALES_SWARM}\`) gaf een noise-verdict.`,
  );
  L.push(`- **onbeantwoord** — de rest: écht openstaand werk.`);
  L.push("");
  L.push(
    `Per mail bepalen we de **Outlook-locatie** (Inbox / Sugar Archive / overig / niet gevonden) ` +
      `via exact \`internetMessageId\` (Trap A) en anders fuzzy \`$search\` op gestript subject ±2 dagen ` +
      `(Trap B, gecapt op ${agg.fuzzyCap}).`,
  );
  L.push("");
  L.push(`> **Read-only.** Geen writes naar Sugar/Outlook/productie-tabellen — alleen dit rapport + script.`);
  L.push("");

  // 2. Totalen per categorie
  L.push(`## 2. Totalen per categorie`);
  L.push("");
  L.push(`| Categorie | Mails | % | Distinct cases |`);
  L.push(`| --- | ---: | ---: | ---: |`);
  for (const c of cats) {
    const rs = byCat(c);
    L.push(`| ${c} | ${rs.length} | ${pct(rs.length, agg.totalMails)} | ${distinctCases(rs)} |`);
  }
  L.push(`| **totaal** | **${agg.totalMails}** | 100% | **${agg.totalCases}** |`);
  L.push("");

  // 3. Categorie × locatie
  L.push(`## 3. Categorie × Outlook-locatie (mails)`);
  L.push("");
  L.push(`| Categorie | Inbox | Sugar Archive | overig | niet gevonden |`);
  L.push(`| --- | ---: | ---: | ---: | ---: |`);
  for (const c of cats) {
    const rs = byCat(c);
    const cell = (loc: Location) => rs.filter((r) => r.location === loc).length;
    L.push(`| ${c} | ${cell("inbox")} | ${cell("sugar_archive")} | ${cell("overig")} | ${cell("niet_gevonden")} |`);
  }
  L.push("");

  // 4. Maandsplitsing
  L.push(`## 4. Maandsplitsing (mails per categorie)`);
  L.push("");
  const months = [...new Set(rows.map((r) => r.month))].sort();
  L.push(`| Maand | ${cats.join(" | ")} | totaal |`);
  L.push(`| --- | ${cats.map(() => "---:").join(" | ")} | ---: |`);
  for (const m of months) {
    const mr = rows.filter((r) => r.month === m);
    const cells = cats.map((c) => mr.filter((r) => r.category === c).length);
    L.push(`| ${m} | ${cells.join(" | ")} | ${mr.length} |`);
  }
  L.push("");

  // 5. De onbeantwoord-lijst (oudste eerst)
  const open = byCat("onbeantwoord").sort((a, b) =>
    (a.date_sent ?? "").localeCompare(b.date_sent ?? ""),
  );
  const openExact = open.filter((r) => r.confidence !== "fuzzy");
  const openFuzzy = open.filter((r) => r.confidence === "fuzzy");

  // dedup-genoot: meer dan één onbeantwoorde mail op dezelfde case
  const caseCount = new Map<string, number>();
  for (const r of open) caseCount.set(r.case_id, (caseCount.get(r.case_id) ?? 0) + 1);
  const dedupMark = (r: TriageRow) => ((caseCount.get(r.case_id) ?? 0) > 1 ? "ja" : "—");

  L.push(`## 5. Onbeantwoord — concrete lijst (oudste eerst)`);
  L.push("");
  L.push(
    `Kolom "case-genoot" = ja wanneer dezelfde case nóg een onbeantwoorde mail heeft (zelfde werk, ` +
      `meerdere mails). Exact- en fuzzy-matches gescheiden — fuzzy NIET vermengen met exact.`,
  );
  L.push("");
  L.push(`### 5a. Exact / pipeline-locatie (betrouwbaar) — ${openExact.length}`);
  L.push("");
  if (openExact.length === 0) {
    L.push(`_Geen._`);
  } else {
    L.push(`| Datum | Subject | Afzender | Locatie | case-genoot |`);
    L.push(`| --- | --- | --- | --- | --- |`);
    for (const r of openExact) {
      L.push(
        `| ${dateOnly(r.date_sent)} | ${esc(r.subject).slice(0, 80)} | ${esc(r.from_name).slice(0, 40)} | ${LOC_LABEL[r.location]} | ${dedupMark(r)} |`,
      );
    }
  }
  L.push("");
  L.push(`### 5b. Fuzzy-match-locatie (onzeker, handmatig verifiëren) — ${openFuzzy.length}`);
  L.push("");
  if (openFuzzy.length === 0) {
    L.push(`_Geen._`);
  } else {
    L.push(`| Datum | Subject | Afzender | Locatie | case-genoot |`);
    L.push(`| --- | --- | --- | --- | --- |`);
    for (const r of openFuzzy) {
      L.push(
        `| ${dateOnly(r.date_sent)} | ${esc(r.subject).slice(0, 80)} | ${esc(r.from_name).slice(0, 40)} | ${LOC_LABEL[r.location]} | ${dedupMark(r)} |`,
      );
    }
  }
  L.push("");

  // 6. Betrouwbaarheid
  L.push(`## 6. Betrouwbaarheids-kanttekeningen`);
  L.push("");
  L.push(
    `- **Locatie-match:** Trap A (exact \`internetMessageId\` via eigen pipeline-index) is zeker; ` +
      `Trap B (fuzzy \`$search\` op gestript subject + ±2 dagen) is best-effort — fuzzy-rijen in §5b ` +
      `handmatig verifiëren vóór actie.`,
  );
  L.push(
    `- **Fuzzy-budget:** cap ${agg.fuzzyCap}, gebruikt ${agg.fuzzyUsed}. ` +
      `**${agg.fuzzyOverCap} mails vielen boven de cap** en kregen locatie "niet gevonden" zonder ` +
      `fuzzy-poging — verhoog \`--fuzzy-cap=<n>\` voor volledige dekking.`,
  );
  L.push(
    `- **Sugar-synthetische message-ids:** Sugar's outbound-mails dragen \`<…@…sugaropencloud.eu>\` ` +
      `ids die niet in Outlook bestaan; exact-match werkt vooral op de originele inbound. Daardoor ` +
      `leunt de locatie deels op fuzzy.`,
  );
  L.push(
    `- **"beantwoord" = conversatie-niveau:** een Sent-reply in dezelfde \`conversationId\` ná de ` +
      `inbound. Een reply via een NIEUWE thread (zonder reply-relatie) wordt niet als beantwoord ` +
      `herkend en valt in onbeantwoord — mogelijk lichte onderschatting van "beantwoord".`,
  );
  L.push(
    `- **Ruis vóór onbeantwoord, ná beantwoord:** een beantwoorde auto-reply telt als beantwoord, ` +
      `niet als ruis (volgorde-keuze).`,
  );
  L.push("");

  // 7. Beslis-opties
  const openSugarArchive = open.filter((r) => r.location === "sugar_archive").length;
  const openInbox = open.filter((r) => r.location === "inbox").length;
  const openNotFound = open.filter((r) => r.location === "niet_gevonden").length;
  L.push(`## 7. Beslis-opties`);
  L.push("");
  L.push(
    `De onbeantwoorde populatie (${open.length} mails) verdeelt zich over: **Inbox ${openInbox}** ` +
      `(al zichtbaar), **Sugar Archive ${openSugarArchive}** (onzichtbaar voor het team), ` +
      `**niet gevonden ${openNotFound}**.`,
  );
  L.push("");
  L.push(
    `1. **Sugar-Archive-onbeantwoorden terugzetten** naar de Inbox (${openSugarArchive} mails) — ` +
      `dit is de feitelijke verborgen werkvoorraad. Aparte move-actie, NA dit rapport.`,
  );
  L.push(
    `2. **Inbox-onbeantwoorden** (${openInbox}) zijn al zichtbaar — geen verplaatsing nodig, ` +
      `hooguit een attentielijst voor het team.`,
  );
  L.push(
    `3. **Niets doen / alleen Sugar-status opschonen** — als blijkt dat de "New"-status puur stale ` +
      `is (veel beantwoord/ruis), kan de connector-uitschakeling + een Sugar-bulkclose volstaan.`,
  );
  L.push("");
  L.push(
    `> **Verplaatsen blijft buiten scope van dit rapport.** Dit levert de feiten; de move/close is ` +
      `een aparte beslissing.`,
  );
  L.push("");
  return L.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`PRODUCTION -- SugarCRM (Cases+Emails) + Graph + Supabase -- Actie: triage New-cases (READ-ONLY)`);
  console.log(
    `mode=${APPLY ? "APPLY (schrijf RAPPORT-V2.md)" : "dry-run"} · since=${SINCE} · fuzzy-cap=${FUZZY_CAP}` +
      (MAX_CASES !== Infinity ? ` · max-cases=${MAX_CASES}` : ""),
  );
  console.log("READ-ONLY: geen writes naar Sugar / Outlook / productie-tabellen.\n");

  // 1
  console.log(`[1/5] Smeba/NL "New"-cases laden uit Sugar (date_entered >= ${SINCE})…`);
  const cases = await loadNewSmebaCases();

  // 2
  console.log(`[2/5] Inbound trigger-mail per case ophalen (${cases.length} link-calls)…`);
  const mails = await loadCaseMails(cases);
  console.log(`      ${mails.length} inbound-mails over ${cases.length} cases.`);

  // 3
  console.log(`[3/5] Sent-Items-index + pipeline noise-index + outlook exact-index laden…`);
  const [sentIndex, noiseIndex, exactIndex, folderMap] = await Promise.all([
    loadSentIndex(),
    loadPipelineNoiseIndex(),
    loadOutlookExactIndex(),
    loadFolderMap(),
  ]);
  console.log(`      folder-map: ${folderMap.size} mappen · exact-index: ${exactIndex.size} ids.`);

  // 4 — locatie + conversatie per mail, daarna classificeren (bounded concurrency)
  console.log(`[4/5] Outlook-locatie matchen (Trap A → Trap B) + classificeren…`);
  const GRAPH_CONCURRENCY = 6;
  const rows: TriageRow[] = [];
  let fuzzyUsed = 0;
  let fuzzyOverCap = 0;
  let processed = 0;
  let nBeantwoord = 0;
  let nRuis = 0;
  let nOpen = 0;

  async function triageOne(mail: SugarMail): Promise<TriageRow> {
    let loc: OutlookLoc = {
      folder_display: null,
      location: "niet_gevonden",
      conversation_id: null,
      received_at: null,
      confidence: "none",
    };

    // Trap A — exact internetMessageId via eigen pipeline-index
    const key = normId(mail.message_id);
    const graphId = key ? exactIndex.get(key) : undefined;
    if (graphId) {
      const meta = await graphMeta(graphId);
      if (meta.parentFolderId) {
        const fi = folderMap.get(meta.parentFolderId);
        loc = {
          folder_display: fi?.display ?? null,
          location: fi?.location ?? "overig",
          conversation_id: meta.conversationId,
          received_at: meta.receivedDateTime ?? mail.date_sent,
          confidence: "exact",
        };
      }
    }

    // Trap B — fuzzy $search (bounded). Reserveer het budget-slot vóór de await
    // (single-threaded JS → increment-then-check is atomair tussen awaits).
    if (loc.confidence === "none") {
      if (fuzzyUsed < FUZZY_CAP) {
        fuzzyUsed++;
        const f = await fuzzyFind(mail);
        if (f && f.parentFolderId) {
          const fi = folderMap.get(f.parentFolderId);
          loc = {
            folder_display: fi?.display ?? null,
            location: fi?.location ?? "overig",
            conversation_id: f.conversationId,
            received_at: f.receivedDateTime ?? mail.date_sent,
            confidence: "fuzzy",
          };
        }
      } else {
        fuzzyOverCap++;
      }
    }

    // ── Classificatie (beantwoord > ruis > onbeantwoord) ──
    let category: Category;
    let ruisReason: string | null = null;

    const inboundTime = loc.received_at ?? mail.date_sent;
    const repliedAt = loc.conversation_id ? sentIndex.get(loc.conversation_id) : undefined;
    const isAnswered =
      !!repliedAt && (!inboundTime || new Date(repliedAt).getTime() > new Date(inboundTime).getTime());

    if (isAnswered) {
      category = "beantwoord";
      nBeantwoord++;
    } else {
      const pat = detectRuisPattern(mail);
      const noiseDec = key ? noiseIndex.get(key) : undefined;
      if (pat) {
        category = "ruis";
        ruisReason = pat;
        nRuis++;
      } else if (noiseDec) {
        category = "ruis";
        ruisReason = `Stage-1 noise (${noiseDec})`;
        nRuis++;
      } else {
        category = "onbeantwoord";
        nOpen++;
      }
    }

    return { ...mail, ...loc, category, ruis_reason: ruisReason };
  }

  let mailIdx = 0;
  async function matchWorker(): Promise<void> {
    for (;;) {
      const i = mailIdx++;
      if (i >= mails.length) return;
      const row = await triageOne(mails[i]);
      rows.push(row);
      processed++;
      if (processed % 100 === 0) {
        console.log(
          `      …${processed}/${mails.length} (beantwoord=${nBeantwoord} ruis=${nRuis} onbeantwoord=${nOpen}, fuzzy=${fuzzyUsed})`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: GRAPH_CONCURRENCY }, () => matchWorker()));

  const agg: Agg = {
    totalMails: rows.length,
    totalCases: new Set(rows.map((r) => r.case_id)).size,
    since: SINCE,
    fuzzyCap: FUZZY_CAP,
    fuzzyUsed,
    fuzzyOverCap,
  };

  // 5 — report
  console.log(
    `[5/5] Klaar: ${rows.length} mails · beantwoord=${nBeantwoord} ruis=${nRuis} onbeantwoord=${nOpen} ` +
      `· fuzzy gebruikt=${fuzzyUsed} (over-cap=${fuzzyOverCap}).`,
  );

  const report = buildReport(rows, agg);
  if (APPLY) {
    writeFileSync(REPORT_PATH, report, "utf8");
    console.log(`\n✓ RAPPORT-V2.md geschreven: ${REPORT_PATH}`);
  } else {
    console.log("\n— Dry-run: eerste 60 regels van het rapport —\n");
    console.log(report.split("\n").slice(0, 60).join("\n"));
    console.log("\n…(re-run met --apply om RAPPORT-V2.md te schrijven)");
  }
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

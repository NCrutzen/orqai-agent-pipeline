/**
 * Read-only inventarisatie: welke SugarCRM-e-mailitems staan na de Outlook
 * cut-over nog OPEN/onafgehandeld (via een nog-open gekoppelde Case), en waar
 * staat de bijbehorende mail fysiek in `verkoop@smeba.nl` — met nadruk op de
 * items die in "Sugar Archive" of andere niet-Inbox-mappen beland zijn
 * (onzichtbaar voor het team dat nu volledig in Outlook werkt).
 *
 * QUICK TASK 260611-jwt. EXPLICIET buiten scope: het verplaatsen/terugzetten
 * van mail — dat is een aparte beslissing NA dit rapport.
 *
 * ── READ-ONLY ─────────────────────────────────────────────────────────────
 * Alle externe calls zijn reads:
 *   - Supabase email_pipeline.emails / outlook_folder_map  → SELECT
 *   - Sugar Cases module                                   → GET / POST .../filter (read)
 *   - Microsoft Graph (verkoop@smeba.nl)                   → GET (message + $search)
 * GEEN writes naar Sugar, Outlook (geen move/PATCH) of productie-tabellen.
 *
 * ── AUTH ──────────────────────────────────────────────────────────────────
 *   - Sugar:    Zapier SDK connectie 58816663 ("Sugar CRM // NCrutzen").
 *               Géén SUGARCRM_* env vars / oauth2-token nodig (checkpoint
 *               resolved: één credential-grens via Zapier, conform CLAUDE.md).
 *   - Outlook:  graphFetch() uit lib/outlook/client.ts (Zapier conn 56014785,
 *               keychain lokaal).
 *   - Supabase: SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL uit
 *               web/.env.local (waarden mogelijk double-quoted → strip).
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────
 *   cd web && npx tsx scripts/sugar-open-items-report.ts            # dry-run: print samenvatting, schrijft niets
 *   cd web && npx tsx scripts/sugar-open-items-report.ts --apply    # schrijft RAPPORT.md in de quick-task dir
 *
 * Flags:
 *   --apply            schrijf RAPPORT.md (anders alleen stdout-samenvatting)
 *   --skip-sugar       sla de live Case-status-lookup over → open_status='unknown'
 *                      (rapport levert dan alleen locatie + ouderdom)
 *   --fuzzy-cap=<n>    max aantal Trap-B (Graph $search) lookups (default 300)
 *   --team-filter      beperk tot Smeba/Brandbeveiliging-team rows (default: uit;
 *                      het toegepaste filter wordt in het rapport vermeld)
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
const CASES_CHUNK = 50; // Sugar /Cases/filter id $in chunk size (URL-/body-veilig)
const GRAPH_DELAY_MS = 120; // throttle tussen Graph-calls
const REPORT_PATH = resolve(
  __dirname,
  "..",
  "..",
  ".planning",
  "quick",
  "260611-jwt-sugarcrm-openstaande-e-mails-inventarisa",
  "RAPPORT.md",
);

// Sugar Case-statussen die als GESLOTEN tellen (al het andere = OPEN).
// Geverifieerd live (2026-06-11) — aangetroffen enumeratie:
//   New · Pending Customer Action Required · Pending Internal Resolution ·
//   In Progress · Closed. We breiden de gesloten-set defensief uit met de
//   gangbare Sugar-eindstatussen voor het geval er meer in het corpus zitten.
const CLOSED_STATUSES = new Set(
  ["closed", "resolved", "duplicate", "rejected", "cancelled", "canceled"].map((s) =>
    s.toLowerCase(),
  ),
);

// ── Flags ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const SKIP_SUGAR = argv.includes("--skip-sugar");
const TEAM_FILTER = argv.includes("--team-filter");
const fuzzyArg = argv.find((a) => a.startsWith("--fuzzy-cap="));
const FUZZY_CAP = fuzzyArg ? Math.max(0, parseInt(fuzzyArg.split("=")[1], 10) || 0) : 300;

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
type OpenStatus = "open" | "closed" | "unknown" | "no_case";
type MatchConfidence = "exact" | "fuzzy" | "none";
type Visibility = "visible" | "invisible" | "not_found";

interface SugarRow {
  source_id: string;
  subject: string;
  received_at: string | null;
  sender_name: string | null;
  internet_message_id: string | null;
  parent_id: string | null;
  parent_type: string | null;
  message_id: string | null;
  team_primary: string | null;
}

interface ResultRow {
  source_id: string;
  subject: string;
  sender: string;
  received_at: string | null;
  open_status: OpenStatus;
  outlook_folder: string | null;
  bucket: string | null;
  visibility: Visibility;
  match_confidence: MatchConfidence;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const normId = (s: string | null | undefined): string =>
  (s ?? "").replace(/[<>]/g, "").trim().toLowerCase();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Paginate over a source's emails (range-based, avoids 1k cap). */
async function pageEmails(source: string, cols: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  const size = 1000;
  for (;;) {
    const { data, error } = await ep
      .from("emails")
      .select(cols)
      .eq("source", source)
      .range(from, from + size - 1);
    if (error) throw new Error(`pageEmails(${source}): ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < size) break;
    from += size;
  }
  return rows;
}

// ── Step 1: load Sugar rows ──────────────────────────────────────────────────
async function loadSugarRows(): Promise<SugarRow[]> {
  const raw = await pageEmails(
    "sugarcrm",
    "source_id, subject, received_at, sender_name, internet_message_id, raw_json",
  );
  const rows: SugarRow[] = raw.map((r) => {
    const rj = (r.raw_json ?? {}) as Record<string, unknown>;
    const teams = Array.isArray(rj.team_name) ? (rj.team_name as Record<string, unknown>[]) : [];
    const primary = teams.find((t) => t.primary === true) ?? teams[0];
    return {
      source_id: String(r.source_id ?? ""),
      subject: String(r.subject ?? ""),
      received_at: (r.received_at as string | null) ?? null,
      sender_name: (r.sender_name as string | null) ?? null,
      internet_message_id: (r.internet_message_id as string | null) ?? null,
      parent_id: (rj.parent_id as string | null) ?? null,
      parent_type: (rj.parent_type as string | null) ?? null,
      message_id: (rj.message_id as string | null) ?? null,
      team_primary: primary ? String((primary as Record<string, unknown>).name ?? "") : null,
    };
  });
  if (TEAM_FILTER) {
    return rows.filter((r) =>
      /smeba|brandbeveiliging/i.test(`${r.team_primary ?? ""} ${r.subject}`),
    );
  }
  return rows;
}

// ── Step 2: open-status per Case (Sugar live read) ───────────────────────────
async function resolveCaseStatuses(parentIds: string[]): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  const chunks: string[][] = [];
  for (let i = 0; i < parentIds.length; i += CASES_CHUNK) {
    chunks.push(parentIds.slice(i, i + CASES_CHUNK));
  }
  console.log(
    `  → ${parentIds.length} distinct Cases over ${chunks.length} chunks (à ${CASES_CHUNK})…`,
  );
  for (let i = 0; i < chunks.length; i++) {
    const ids = chunks[i];
    const body = {
      filter: [{ id: { $in: ids } }],
      fields: ["id", "status"],
      max_num: CASES_CHUNK,
    };
    const res = await zapier.fetch(`${SUGAR_BASE}/Cases/filter`, {
      method: "POST",
      connectionId: SUGAR_CONNECTION_ID,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Sugar /Cases/filter ${res.status}: ${txt.slice(0, 200)}`);
    }
    const j = (await res.json()) as { records?: Array<{ id: string; status?: string }> };
    for (const rec of j.records ?? []) {
      statuses.set(rec.id, rec.status ?? "unknown");
    }
    if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
      console.log(`    chunk ${i + 1}/${chunks.length} (${statuses.size} cases resolved)`);
    }
  }
  return statuses;
}

function classifyOpen(row: SugarRow, caseStatuses: Map<string, string>): OpenStatus {
  if (SKIP_SUGAR) return "unknown";
  if (row.parent_type !== "Cases" || !row.parent_id) return "no_case";
  const status = caseStatuses.get(row.parent_id);
  if (status === undefined) return "unknown"; // Case niet gevonden bij lookup
  return CLOSED_STATUSES.has(status.toLowerCase()) ? "closed" : "open";
}

// ── Step 3: Outlook-locatie matchen (twee-traps) ─────────────────────────────
interface OutlookHit {
  source_id: string;
}

/** Map normId → outlook source_id (Graph message id). */
async function loadOutlookIndex(): Promise<Map<string, OutlookHit>> {
  const out = await pageEmails("outlook", "source_id, internet_message_id, raw_json");
  const map = new Map<string, OutlookHit>();
  for (const r of out) {
    const rj = (r.raw_json ?? {}) as Record<string, unknown>;
    const id =
      normId(r.internet_message_id as string | null) ||
      normId(rj.internetMessageId as string | null);
    if (id && !map.has(id)) map.set(id, { source_id: String(r.source_id ?? "") });
  }
  return map;
}

/** folder_id → {display_name, bucket} */
async function loadFolderMap(): Promise<Map<string, { display_name: string; bucket: string }>> {
  const { data, error } = await admin
    .from("outlook_folder_map")
    .select("folder_id, display_name, bucket")
    .eq("mailbox", MAILBOX);
  if (error) throw new Error(`outlook_folder_map: ${error.message}`);
  const map = new Map<string, { display_name: string; bucket: string }>();
  for (const f of data ?? []) {
    map.set(String(f.folder_id), {
      display_name: String(f.display_name ?? "?"),
      bucket: String(f.bucket ?? "other"),
    });
  }
  return map;
}

/** Resolve a Graph message id → its parentFolderId (cached). */
const folderIdCache = new Map<string, string | null>();
async function resolveParentFolder(messageId: string): Promise<string | null> {
  if (folderIdCache.has(messageId)) return folderIdCache.get(messageId)!;
  await sleep(GRAPH_DELAY_MS);
  const res = await graphFetch(
    `/users/${encodeURIComponent(MAILBOX)}/messages/${encodeURIComponent(
      messageId,
    )}?$select=parentFolderId,subject,internetMessageId`,
  );
  if (!res.ok) {
    folderIdCache.set(messageId, null);
    return null;
  }
  const data = (await res.json()) as { parentFolderId?: string };
  const pf = data.parentFolderId ?? null;
  folderIdCache.set(messageId, pf);
  return pf;
}

/** Trap B: fuzzy Graph $search on subject within the mailbox, pick first hit. */
async function fuzzyFindMessage(row: SugarRow): Promise<string | null> {
  const subject = (row.subject ?? "").replace(/"/g, "").trim();
  if (!subject) return null;
  // $search matches across the mailbox; we filter the first plausible hit by
  // received date (±1 dag) client-side. Graph requires ConsistencyLevel for
  // $search-style queries; the relay forwards the header through graphFetch.
  const q = encodeURIComponent(`"${subject.slice(0, 120)}"`);
  await sleep(GRAPH_DELAY_MS);
  const res = await graphFetch(
    `/users/${encodeURIComponent(
      MAILBOX,
    )}/messages?$search=${q}&$top=5&$select=id,subject,receivedDateTime,parentFolderId`,
    { method: "GET", prefer: 'outlook.body-content-type="text"' },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    value?: Array<{ id: string; receivedDateTime?: string; parentFolderId?: string }>;
  };
  const hits = data.value ?? [];
  if (hits.length === 0) return null;
  const target = row.received_at ? new Date(row.received_at).getTime() : null;
  if (target !== null) {
    const dayMs = 24 * 60 * 60 * 1000;
    const near = hits.find((h) => {
      if (!h.receivedDateTime) return false;
      return Math.abs(new Date(h.receivedDateTime).getTime() - target) <= dayMs;
    });
    if (near) {
      if (near.parentFolderId) folderIdCache.set(near.id, near.parentFolderId);
      return near.id;
    }
  }
  const first = hits[0];
  if (first.parentFolderId) folderIdCache.set(first.id, first.parentFolderId);
  return first.id;
}

function classifyVisibility(bucket: string | null): Visibility {
  if (bucket === null) return "not_found";
  return bucket === "inbox" ? "visible" : "invisible";
}

// ── Report rendering ─────────────────────────────────────────────────────────
interface Aggregates {
  totalSugar: number;
  totalOpen: number;
  teamFilter: string;
  skipSugar: boolean;
  fuzzyCap: number;
  fuzzyUsed: number;
  visible: number;
  invisible: number;
  notFound: number;
  byFolder: Map<string, { count: number; bucket: string; visibility: Visibility }>;
  ageInvisible: Record<string, number>;
  ageAll: Record<string, number>;
}

const AGE_BUCKETS = ["<30d", "30-90d", "90-180d", "180-365d", ">1jaar"] as const;
function ageBucket(received: string | null): (typeof AGE_BUCKETS)[number] {
  if (!received) return ">1jaar";
  const days = (Date.now() - new Date(received).getTime()) / (24 * 60 * 60 * 1000);
  if (days < 30) return "<30d";
  if (days < 90) return "30-90d";
  if (days < 180) return "90-180d";
  if (days < 365) return "180-365d";
  return ">1jaar";
}

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function dateOnly(s: string | null): string {
  return s ? s.slice(0, 10) : "?";
}

function buildReport(open: ResultRow[], agg: Aggregates): string {
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines: string[] = [];
  lines.push(`# Inventarisatie — open SugarCRM-e-mails & Outlook-locatie`);
  lines.push("");
  lines.push(`> PRODUCTION -- SugarCRM (Cases-status, read-only) + Microsoft Graph (read-only)`);
  lines.push(`> Quick task 260611-jwt · gegenereerd ${now} · mailbox \`${MAILBOX}\``);
  lines.push("");

  // 1. Context
  lines.push(`## 1. Context`);
  lines.push("");
  lines.push(
    `Na de cut-over werkt het verkoopteam volledig in Outlook (\`${MAILBOX}\`); de oude ` +
      `Power Automate / SugarCRM-sweep is uit. Dit rapport inventariseert welke van de ` +
      `reeds-geïngeste SugarCRM-e-mails nog **open/onafgehandeld** staan en **waar** die ` +
      `mail fysiek in Outlook ligt — met nadruk op items in **"Sugar Archive"** en andere ` +
      `niet-Inbox-mappen, die onzichtbaar zijn voor het team.`,
  );
  lines.push("");
  if (agg.skipSugar) {
    lines.push(
      `> ⚠️ **Beperking:** dit rapport is met \`--skip-sugar\` gedraaid. De live ` +
        `Case-status is NIET opgehaald; \`open_status\` staat overal op **onbekend**. ` +
        `Alleen de Outlook-locatie en ouderdom zijn betrouwbaar.`,
    );
  } else {
    lines.push(
      `**Open-definitie:** een SugarCRM-e-mail telt als *open* wanneer de gekoppelde ` +
        `Case (\`parent_type=Cases\`) NIET in een gesloten status staat. Gesloten = ` +
        `\`${[...CLOSED_STATUSES].join("`, `")}\` (case-insensitive). Alle andere ` +
        `statussen (New, In Progress, Pending …) tellen als open.`,
    );
  }
  lines.push("");
  lines.push(`Filter toegepast op de bron: **${agg.teamFilter}**.`);
  lines.push("");
  lines.push(
    `> **Verplaatsen is buiten scope.** Dit is een beslis-rapport; of/welke mail ` +
      `teruggezet moet worden is een aparte stap NA dit rapport.`,
  );
  lines.push("");

  // 2. Totalen
  lines.push(`## 2. Totalen`);
  lines.push("");
  const pct = agg.totalSugar > 0 ? ((agg.totalOpen / agg.totalSugar) * 100).toFixed(1) : "0.0";
  lines.push(`| Metric | Aantal |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| SugarCRM-mails bekeken | ${agg.totalSugar} |`);
  lines.push(
    `| Open items${agg.skipSugar ? " (status onbekend → alles meegenomen)" : ""} | ${agg.totalOpen} |`,
  );
  lines.push(`| % open van totaal | ${pct}% |`);
  lines.push(`| → zichtbaar (Inbox) | ${agg.visible} |`);
  lines.push(`| → **onzichtbaar (niet-Inbox)** | ${agg.invisible} |`);
  lines.push(`| → niet teruggevonden in Outlook | ${agg.notFound} |`);
  lines.push("");
  lines.push(
    `_Match-budget: Trap A (exact, message-id) gratis; Trap B (fuzzy Graph \`$search\`) ` +
      `gebruikt ${agg.fuzzyUsed}/${agg.fuzzyCap}. Items boven de cap zonder exact-hit ` +
      `vallen in "niet teruggevonden"._`,
  );
  lines.push("");

  // 3. Outlook-locatieverdeling
  lines.push(`## 3. Outlook-locatieverdeling (open items)`);
  lines.push("");
  lines.push(`| Outlook-map | Bucket | Open items | Zichtbaarheid |`);
  lines.push(`| --- | --- | ---: | --- |`);
  const folderRows = [...agg.byFolder.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [name, info] of folderRows) {
    const vis = info.visibility === "visible" ? "zichtbaar" : "**onzichtbaar**";
    lines.push(`| ${esc(name)} | ${info.bucket} | ${info.count} | ${vis} |`);
  }
  lines.push(`| _(niet teruggevonden)_ | — | ${agg.notFound} | n.v.t. |`);
  lines.push("");
  const sugarArchive = agg.byFolder.get("Sugar Archive");
  if (sugarArchive && sugarArchive.count > 0) {
    lines.push(
      `> 🔴 **Hoofd-risico:** ${sugarArchive.count} open items staan in **"Sugar Archive"** ` +
        `(bucket \`other\`) — onzichtbaar voor het team dat in de Inbox werkt.`,
    );
    lines.push("");
  }

  // 4. Ouderdom
  lines.push(`## 4. Ouderdom-verdeling`);
  lines.push("");
  lines.push(`| Bucket (op received_at) | Alle open | Onzichtbare open |`);
  lines.push(`| --- | ---: | ---: |`);
  for (const b of AGE_BUCKETS) {
    lines.push(`| ${b} | ${agg.ageAll[b] ?? 0} | ${agg.ageInvisible[b] ?? 0} |`);
  }
  lines.push("");

  // 5. Onzichtbare items (exact + fuzzy gesplitst)
  const invisible = open
    .filter((r) => r.visibility === "invisible")
    .sort((a, b) => (a.received_at ?? "").localeCompare(b.received_at ?? ""));
  const invExact = invisible.filter((r) => r.match_confidence === "exact");
  const invFuzzy = invisible.filter((r) => r.match_confidence === "fuzzy");

  lines.push(`## 5. Concrete lijst — onzichtbare open items`);
  lines.push("");
  lines.push(`Oudste eerst. Exact- en fuzzy-matches gescheiden (betrouwbaarheid niet vermengen).`);
  lines.push("");
  lines.push(`### 5a. Exact-matches (message-id, zeker) — ${invExact.length}`);
  lines.push("");
  if (invExact.length === 0) {
    lines.push(`_Geen._`);
  } else {
    lines.push(`| Datum | Subject | Afzender | Outlook-map |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const r of invExact) {
      lines.push(
        `| ${dateOnly(r.received_at)} | ${esc(r.subject).slice(0, 90)} | ${esc(r.sender)} | ${esc(r.outlook_folder)} |`,
      );
    }
  }
  lines.push("");
  lines.push(`### 5b. Fuzzy-matches (subject+datum, onzeker) — ${invFuzzy.length}`);
  lines.push("");
  if (invFuzzy.length === 0) {
    lines.push(`_Geen._`);
  } else {
    lines.push(`| Datum | Subject | Afzender | Outlook-map |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const r of invFuzzy) {
      lines.push(
        `| ${dateOnly(r.received_at)} | ${esc(r.subject).slice(0, 90)} | ${esc(r.sender)} | ${esc(r.outlook_folder)} |`,
      );
    }
  }
  lines.push("");

  // 6. Niet gevonden
  const notFound = open
    .filter((r) => r.visibility === "not_found")
    .sort((a, b) => (a.received_at ?? "").localeCompare(b.received_at ?? ""));
  lines.push(`## 6. Niet teruggevonden in Outlook — ${notFound.length}`);
  lines.push("");
  lines.push(
    `Geen exact message-id-hit én geen fuzzy Graph-hit (of boven de fuzzy-cap). ` +
      `Mogelijke oorzaken: verwijderd, in een andere mailbox, of nooit naar Outlook ` +
      `gemigreerd. Toon eerste 200 (oudste eerst).`,
  );
  lines.push("");
  if (notFound.length === 0) {
    lines.push(`_Geen._`);
  } else {
    lines.push(`| Datum | Subject | Afzender |`);
    lines.push(`| --- | --- | --- |`);
    for (const r of notFound.slice(0, 200)) {
      lines.push(`| ${dateOnly(r.received_at)} | ${esc(r.subject).slice(0, 100)} | ${esc(r.sender)} |`);
    }
    if (notFound.length > 200) lines.push(`| … | _(+${notFound.length - 200} meer)_ | |`);
  }
  lines.push("");

  // 7. Beperkingen & vervolg
  lines.push(`## 7. Beperkingen & vervolg`);
  lines.push("");
  lines.push(
    `- **Match-betrouwbaarheid:** Trap A (exact message-id) is zeker. Trap B (fuzzy ` +
      `Graph \`$search\` op subject + datum ±1 dag) is een best-effort gok — verifieer ` +
      `fuzzy-rijen handmatig vóór actie.`,
  );
  lines.push(
    `- **Fuzzy-cap:** ${agg.fuzzyCap} (gebruikt ${agg.fuzzyUsed}). Verhoog met ` +
      `\`--fuzzy-cap=<n>\` voor volledige dekking (kost meer Graph-calls/tijd).`,
  );
  if (agg.skipSugar) {
    lines.push(
      `- **Open-status onbekend:** gedraaid met \`--skip-sugar\`; her-run zonder die flag ` +
        `voor het echte open/dicht-onderscheid.`,
    );
  } else {
    lines.push(
      `- **Gesloten-statussen:** \`${[...CLOSED_STATUSES].join("`, `")}\`. Controleer of ` +
        `Sugar nog andere eindstatussen kent die hier ontbreken.`,
    );
  }
  lines.push(
    `- **Verplaatsen blijft buiten scope** — dit rapport beslist NIET; het levert de ` +
      `feiten voor een aparte terugzet-beslissing.`,
  );
  lines.push("");
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `PRODUCTION -- SugarCRM (Cases-status, read-only) -- Actie: inventarisatie open e-mails`,
  );
  console.log(
    `mode=${APPLY ? "APPLY (schrijf RAPPORT.md)" : "dry-run (alleen stdout)"} · ` +
      `skip-sugar=${SKIP_SUGAR} · team-filter=${TEAM_FILTER} · fuzzy-cap=${FUZZY_CAP}`,
  );
  console.log("READ-ONLY: geen writes naar Sugar / Outlook / productie-tabellen.\n");

  // Step 1
  console.log("[1/4] Sugar-mails laden uit email_pipeline.emails (source=sugarcrm)…");
  const sugar = await loadSugarRows();
  const teamFilterLabel = TEAM_FILTER
    ? "Smeba/Brandbeveiliging-team (subject/team_name)"
    : "geen (alle sugarcrm rows)";
  console.log(`      ${sugar.length} sugarcrm rows geladen (filter: ${teamFilterLabel}).`);

  // Step 2: open-status
  let caseStatuses = new Map<string, string>();
  if (!SKIP_SUGAR) {
    console.log("[2/4] Open-status bepalen via gekoppelde Sugar Cases (live read-only)…");
    const distinctCases = [
      ...new Set(
        sugar
          .filter((r) => r.parent_type === "Cases" && r.parent_id)
          .map((r) => r.parent_id as string),
      ),
    ];
    caseStatuses = await resolveCaseStatuses(distinctCases);
    const seen = new Set(caseStatuses.values());
    console.log(`      aangetroffen Case-statussen: ${[...seen].join(", ")}`);
  } else {
    console.log("[2/4] --skip-sugar → open_status='unknown' voor alle items.");
  }

  const classified = sugar.map((r) => ({ row: r, open_status: classifyOpen(r, caseStatuses) }));
  const openRows = SKIP_SUGAR
    ? classified // skip-sugar: behandel alles als kandidaat
    : classified.filter((c) => c.open_status === "open");
  console.log(
    `      open items: ${openRows.length}` +
      (SKIP_SUGAR ? " (status onbekend, alles meegenomen)" : ` van ${sugar.length}`),
  );

  // Step 3: Outlook-locatie matchen
  console.log("[3/4] Outlook-index + folder-map laden, daarna matchen (Trap A → Trap B)…");
  const outlookIndex = await loadOutlookIndex();
  const folderMap = await loadFolderMap();
  console.log(
    `      outlook index: ${outlookIndex.size} ids · folder-map: ${folderMap.size} mappen.`,
  );

  const results: ResultRow[] = [];
  let exactCount = 0;
  let fuzzyCount = 0;
  let fuzzyUsed = 0;
  let notFoundCount = 0;
  let processed = 0;

  for (const { row, open_status } of openRows) {
    processed++;
    if (processed % 200 === 0) {
      console.log(
        `      …${processed}/${openRows.length} (exact=${exactCount} fuzzy=${fuzzyCount} nf=${notFoundCount})`,
      );
    }

    let confidence: MatchConfidence = "none";
    let folderId: string | null = null;

    // Trap A — exact message-id
    const key = normId(row.internet_message_id) || normId(row.message_id);
    const hit = key ? outlookIndex.get(key) : undefined;
    if (hit) {
      folderId = await resolveParentFolder(hit.source_id);
      if (folderId) {
        confidence = "exact";
        exactCount++;
      }
    }

    // Trap B — fuzzy Graph $search (bounded)
    if (!folderId && fuzzyUsed < FUZZY_CAP) {
      fuzzyUsed++;
      const fuzzyId = await fuzzyFindMessage(row);
      if (fuzzyId) {
        folderId = await resolveParentFolder(fuzzyId);
        if (folderId) {
          confidence = "fuzzy";
          fuzzyCount++;
        }
      }
    }

    const folderInfo = folderId ? folderMap.get(folderId) : undefined;
    const bucket = folderInfo?.bucket ?? null;
    const visibility = classifyVisibility(folderInfo ? bucket : null);
    if (visibility === "not_found") notFoundCount++;

    results.push({
      source_id: row.source_id,
      subject: row.subject,
      sender: row.sender_name ?? row.parent_id ?? "?",
      received_at: row.received_at,
      open_status,
      outlook_folder: folderInfo?.display_name ?? null,
      bucket,
      visibility,
      match_confidence: confidence,
    });
  }

  // Aggregate
  const byFolder = new Map<string, { count: number; bucket: string; visibility: Visibility }>();
  const ageAll: Record<string, number> = {};
  const ageInvisible: Record<string, number> = {};
  let visible = 0;
  let invisible = 0;
  for (const r of results) {
    const ab = ageBucket(r.received_at);
    ageAll[ab] = (ageAll[ab] ?? 0) + 1;
    if (r.visibility === "visible") visible++;
    if (r.visibility === "invisible") {
      invisible++;
      ageInvisible[ab] = (ageInvisible[ab] ?? 0) + 1;
    }
    if (r.outlook_folder) {
      const cur = byFolder.get(r.outlook_folder) ?? {
        count: 0,
        bucket: r.bucket ?? "other",
        visibility: r.visibility,
      };
      cur.count++;
      byFolder.set(r.outlook_folder, cur);
    }
  }

  const agg: Aggregates = {
    totalSugar: sugar.length,
    totalOpen: openRows.length,
    teamFilter: teamFilterLabel,
    skipSugar: SKIP_SUGAR,
    fuzzyCap: FUZZY_CAP,
    fuzzyUsed,
    visible,
    invisible,
    notFound: notFoundCount,
    byFolder,
    ageInvisible,
    ageAll,
  };

  // Step 4: report
  console.log(
    `[4/4] Resultaat: ${results.length} open items · zichtbaar=${visible} · ` +
      `onzichtbaar=${invisible} · not_found=${notFoundCount} · ` +
      `exact=${exactCount} fuzzy=${fuzzyCount}.`,
  );

  const report = buildReport(results, agg);
  if (APPLY) {
    writeFileSync(REPORT_PATH, report, "utf8");
    console.log(`\n✓ RAPPORT.md geschreven: ${REPORT_PATH}`);
  } else {
    console.log("\n— Dry-run samenvatting (eerste 40 regels van het rapport) —\n");
    console.log(report.split("\n").slice(0, 40).join("\n"));
    console.log("\n…(re-run met --apply om RAPPORT.md te schrijven)");
  }
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

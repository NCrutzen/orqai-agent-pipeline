/**
 * Phase 112.5 Plan 03 Task 3 — swarm-agnostische delta-client.
 *
 * Dunne IO-wrapper rond de uitgebreide graphFetch (één credential-grens,
 * connection 56014785, ingebouwde socket/504-retry). GEEN step-logica hier (dat
 * is de worker, Plan 04); GEEN sales-constanten — mailbox is altijd een
 * parameter.
 *
 * Twee functies:
 *  - deltaPage(): pagineert één per-folder delta-stroom (Pattern 1). Bootstrap
 *    (deltaLinkOrNull=null) of vervolg vanaf een deltaLink. Vangt 410
 *    resyncRequired/SyncStateNotFound -> herstart als bootstrap + markeert
 *    wasBootstrap zodat de worker de signaal-emit suppress't (Pitfall 2).
 *  - resolveFolders(): enumereert mailFolders RECURSIEF (childFolders-walk over
 *    de hele boom) en geeft { folder_id, display_name, path } terug — de
 *    afgehandeld-conventie leeft in geneste jaar-submappen (112.5-01:
 *    Inbox/afgehandeld/2024 ~21.6k, /2025 ~8.3k — namen ZONDER 'afgehandeld').
 *
 * bucketForFolderPath() bucket't ancestry-aware: een pad waarvan ÉÉN segment op
 * 'afgehandeld' matcht erft de afgehandeld-bucket (overerving); anders valt het
 * terug op bucketForFolderName van het laatste segment.
 */

import { graphFetch } from "@/lib/outlook/client";
import { bucketForFolderName, type FolderBucket } from "./folder-convention-report";

const enc = encodeURIComponent;

/**
 * Eén ruw delta-event met _folderId-context (de folder waarop de call draaide),
 * zodat cross-folder correlatie in transition-extract werkt. Vorm spiegelt
 * RawDeltaEvent uit transition-extract; hier los gehouden zodat de delta-client
 * geen circulaire afhankelijkheid heeft.
 */
export interface DeltaEvent {
  id: string;
  _folderId: string;
  "@removed"?: { reason?: string };
  parentFolderId?: string;
  categories?: string[];
  isRead?: boolean;
  conversationId?: string;
  subject?: string;
  receivedDateTime?: string;
}

export interface DeltaPageOptions {
  mailbox: string;
  folderId: string;
  /** null = bootstrap (volledige enumeratie); anders begin vanaf deze deltaLink. */
  deltaLinkOrNull: string | null;
  /** Prefer-header, bv. 'IdType="ImmutableId", odata.maxpagesize=100'. */
  prefer: string;
}

export interface DeltaPageResult {
  events: DeltaEvent[];
  /** De nieuwe deltaLink om te persisteren (null als Graph er geen teruggaf). */
  deltaLink: string | null;
  /**
   * true bij een bootstrap-sync OF een 410-resync: de worker emit dan 0 signalen
   * (alleen token persisteren) omdat pre-existing state geen transitie is.
   */
  wasBootstrap: boolean;
}

interface GraphDeltaPayload {
  value?: DeltaEvent[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
  error?: { code?: string };
}

/** Bootstrap delta-URL voor een folder (volledige enumeratie). */
function bootstrapUrl(mailbox: string, folderId: string): string {
  const select =
    "id,subject,isRead,categories,parentFolderId,conversationId,receivedDateTime";
  return `/users/${enc(mailbox)}/mailFolders/${enc(folderId)}/messages/delta?$select=${select}`;
}

/** Detecteer een 410-resync (status 410 of body code resyncRequired/SyncStateNotFound). */
function isResyncRequired(status: number, code: string | undefined): boolean {
  return (
    status === 410 ||
    code === "resyncRequired" ||
    code === "SyncStateNotFound"
  );
}

/**
 * Pagineer één per-folder delta-stroom. while(url): graphFetch(url, { prefer });
 * url = @odata.nextLink ?? null; deltaLink = @odata.deltaLink ?? deltaLink.
 * Elk event krijgt _folderId-context. Bij 410 -> herstart als bootstrap.
 */
export async function deltaPage(opts: DeltaPageOptions): Promise<DeltaPageResult> {
  const { mailbox, folderId, deltaLinkOrNull, prefer } = opts;

  let wasBootstrap = deltaLinkOrNull === null;
  let url: string | null = deltaLinkOrNull ?? bootstrapUrl(mailbox, folderId);
  const events: DeltaEvent[] = [];
  let deltaLink: string | null = null;
  let didResyncRestart = false;

  while (url) {
    const res = await graphFetch(url, { method: "GET", prefer });

    if (!res.ok) {
      // Probeer de body-code te lezen voor 410-detectie.
      let code: string | undefined;
      try {
        const body = (await res.json()) as GraphDeltaPayload;
        code = body.error?.code;
      } catch {
        code = undefined;
      }

      if (isResyncRequired(res.status, code) && !didResyncRestart) {
        // Pitfall 2: gooi de oude deltaLink weg, herstart als bootstrap, en
        // markeer wasBootstrap zodat de worker signal-emit suppress't.
        didResyncRestart = true;
        wasBootstrap = true;
        events.length = 0;
        deltaLink = null;
        url = bootstrapUrl(mailbox, folderId);
        continue;
      }

      const text = await res.text().catch(() => "");
      throw new Error(`deltaPage ${res.status} on ${folderId}: ${text}`);
    }

    const data = (await res.json()) as GraphDeltaPayload;
    for (const ev of data.value ?? []) {
      events.push({ ...ev, _folderId: folderId });
    }

    deltaLink = data["@odata.deltaLink"] ?? deltaLink;
    url = data["@odata.nextLink"] ?? null;
  }

  return { events, deltaLink, wasBootstrap };
}

/** Eén folder in de resolved tree, met het volledige display-name-pad. */
export interface ResolvedFolder {
  folder_id: string;
  display_name: string;
  /** Display-name-keten, bv. "Inbox/afgehandeld/2024". */
  path: string;
}

interface GraphFolder {
  id: string;
  displayName?: string;
  childFolderCount?: number;
}

interface GraphFolderListPayload {
  value?: GraphFolder[];
  "@odata.nextLink"?: string;
}

/** Lijst de directe childFolders van een folder (gepagineerd). */
async function listChildFolders(
  mailbox: string,
  parentId: string,
): Promise<GraphFolder[]> {
  const out: GraphFolder[] = [];
  let url: string | null = `/users/${enc(mailbox)}/mailFolders/${enc(parentId)}/childFolders?$select=id,displayName,childFolderCount&$top=200`;
  while (url) {
    const res = await graphFetch(url, { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`listChildFolders ${res.status} on ${parentId}: ${text}`);
    }
    const data = (await res.json()) as GraphFolderListPayload;
    out.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
  }
  return out;
}

/** Lijst de top-level mailFolders van een mailbox (gepagineerd). */
async function listTopFolders(mailbox: string): Promise<GraphFolder[]> {
  const out: GraphFolder[] = [];
  let url: string | null = `/users/${enc(mailbox)}/mailFolders?$select=id,displayName,childFolderCount&$top=200`;
  while (url) {
    const res = await graphFetch(url, { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`listTopFolders ${res.status}: ${text}`);
    }
    const data = (await res.json()) as GraphFolderListPayload;
    out.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
  }
  return out;
}

/**
 * Enumereer de hele mailFolder-boom RECURSIEF en geef elke folder terug met z'n
 * display-name-pad (bv. "Inbox/afgehandeld/2024"). De afgehandeld-conventie
 * leeft in geneste jaar-submappen (112.5-01), dus een één-laags walk mist ~58k
 * afgehandeld-mails — daarom de volledige boom.
 */
export async function resolveFolders(mailbox: string): Promise<ResolvedFolder[]> {
  const out: ResolvedFolder[] = [];

  async function walk(folder: GraphFolder, parentPath: string): Promise<void> {
    const name = folder.displayName ?? "";
    const path = parentPath ? `${parentPath}/${name}` : name;
    out.push({ folder_id: folder.id, display_name: name, path });

    if ((folder.childFolderCount ?? 0) > 0) {
      const children = await listChildFolders(mailbox, folder.id);
      for (const child of children) {
        await walk(child, path);
      }
    }
  }

  const top = await listTopFolders(mailbox);
  for (const folder of top) {
    await walk(folder, "");
  }
  return out;
}

/**
 * Ancestry-aware bucketing: een pad waarvan ÉÉN segment als 'afgehandeld'
 * bucket't, erft de afgehandeld-bucket (overerving — jaar-submappen onder
 * Inbox/afgehandeld). Anders: bucketForFolderName van het laatste segment.
 *
 * Voorbeelden:
 *   "Inbox/afgehandeld/2024" -> "afgehandeld" (overerving)
 *   "2024"                   -> "other"       (geen afgehandeld-voorouder)
 *   "Some/Nested/Archief"    -> "archive"     (laatste segment)
 */
export function bucketForFolderPath(path: string): FolderBucket {
  const segments = (path ?? "").split("/").map((s) => s.trim()).filter((s) => s !== "");
  for (const seg of segments) {
    if (bucketForFolderName(seg) === "afgehandeld") return "afgehandeld";
  }
  const last = segments[segments.length - 1] ?? "";
  return bucketForFolderName(last);
}

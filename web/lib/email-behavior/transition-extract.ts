/**
 * Phase 112.5 Plan 03 Task 1 — swarm-agnostische PURE transition-extractor (SC-1).
 *
 * Mapt ruwe Graph delta-events -> Transition[]. Eén bron-of-waarheid voor wat
 * een gebruiker met een mail deed: verplaatst (afgehandeld / archive), hersteld
 * uit archive, category bewerkt, gelezen-en-vergrijsd, of beantwoord (sent).
 *
 * Cross-folder move-correlatie gebeurt op IMMUTABLE ID (RESEARCH Pattern 2): een
 * move levert in de BRON-folder een `@removed: { reason: "deleted" }` event en in
 * de DOEL-folder een normaal (created/updated) event met dezelfde id. We bouwen
 * `leftFolders`/`enteredFolders` Maps op id en correleren binnen één tick. Als de
 * twee helften over ticks gesplitst zijn (Pitfall 3) valt de bron terug op de
 * meegegeven `lastKnownBucket` zodat een verschijning-zonder-@removed alsnog als
 * move telt.
 *
 * SWARM-AGNOSTISCH: geen sales-constanten, geen mailbox-pin. Alle context
 * (bucketOf, lastKnownBucket, prevCategories, prevIsRead, conversationToEmailId,
 * observed_at) komt als parameter binnen.
 *
 * PUUR: geen IO, geen Date.now()/new Date()/Math.random(). `observed_at` wordt
 * door de worker meegegeven (één tick-timestamp per run) — replay-veilig onder
 * Inngest (T-111-09).
 */

/** De gesloten verzameling transitie-soorten (SC-1). */
export type TransitionKind =
  | "moved_to_afgehandeld"
  | "self_archived"
  | "restored_from_archive"
  | "category_edited"
  | "read_aged"
  | "replied"
  /**
   * Vangnet (gap-fix 2026-06-04): het bericht verdween uit een getrackte folder
   * (@removed) zonder verschijning in een andere getrackte folder binnen deze
   * tick én zonder lastKnownBucket-match. Doel onbekend — bv. een move naar een
   * niet-getrackte map (Power-Automate sweep naar "Sugar Archive", of een
   * nieuw aangemaakte afgehandeld-jaarmap die nog niet in de folder-map zit).
   * Geen verdict (observability-only); de worker kan hem later corrigeren
   * wanneer een nieuw-ontdekte folder bij bootstrap hetzelfde immutable id
   * blijkt te bevatten (bootstrap-correlatie).
   */
  | "left_to_untracked";

/**
 * Eén ruw Graph delta-event, verrijkt met `_folderId` (de folder waarop de
 * delta-call draaide — door de delta-client toegevoegd). Een move-out komt als
 * `@removed: { reason: "deleted" }`; een verschijning/update als een normaal
 * event met `parentFolderId`.
 */
export interface RawDeltaEvent {
  /** Immutable message id (Prefer: IdType="ImmutableId"). */
  id: string;
  /** De folder waarop de delta-call draaide (delta-client context). */
  _folderId: string;
  /** Aanwezig bij een move-out / verwijdering uit deze folder. */
  "@removed"?: { reason?: string };
  /** De folder waar het bericht nu in zit (verschijning/update). */
  parentFolderId?: string;
  /** Outlook-categorieën op het moment van dit event. */
  categories?: string[];
  /** Read-state op het moment van dit event. */
  isRead?: boolean;
  /** Conversatie-id (voor reply-detectie op de sent-bucket). */
  conversationId?: string;
}

/** Eén afgeleide transitie. `observed_at` is de tick-timestamp van de worker. */
export interface Transition {
  /** Immutable message id van het bewogen/bewerkte bericht. */
  immutable_id: string;
  kind: TransitionKind;
  /** Bucket waar het bericht vandaan kwam (null als onbekend, bv. in-place edit). */
  from_bucket: string | null;
  /** Bucket waar het bericht nu in zit. */
  to_bucket: string | null;
  /** Categorieën op het moment van de transitie (alleen gevuld bij category_edited). */
  categories?: string[];
  /**
   * Voor `replied`: het email_id van de INBOUND mail waarop geantwoord werd
   * (via conversationId-join). Niet het sent-bericht zelf.
   */
  matched_email_id?: string;
  /** Tick-timestamp meegegeven door de worker (geen clock-read hier). */
  observed_at: string;
}

export interface ExtractInput {
  events: RawDeltaEvent[];
  /** folder-id -> semantische bucket (worker levert bucketForFolder op de registry). */
  bucketOf: (folderId: string) => string;
  /** Laatst-bekende bucket per immutable id (split-over-ticks fallback, Pitfall 3). */
  lastKnownBucket: Map<string, string>;
  /** Tick-timestamp; elke transitie erft deze (puur — geen clock-read). */
  observed_at: string;
  /** Vorige bekende categorieën per id (diff -> category_edited). */
  prevCategories?: Map<string, string[]>;
  /** Vorige bekende read-state per id (false->true zonder move -> read_aged). */
  prevIsRead?: Map<string, boolean>;
  /** conversationId -> inbound email_id (reply-matching op sent-bucket). */
  conversationToEmailId?: Map<string, string>;
}

/** Stabiele, key-onafhankelijke vergelijking van twee categorie-lijsten. */
function categoriesDiffer(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return true;
  }
  return false;
}

/**
 * Map een bron->doel bucket-paar naar de bijbehorende move-transitie, of null.
 * Geëxporteerd (gap-fix 2026-06-04) zodat de worker bootstrap-correlaties
 * (left_to_untracked -> alsnog-bekende doel-bucket) met dezelfde semantiek kan
 * promoten naar een echte move-transitie.
 */
export function moveKind(from: string, to: string): TransitionKind | null {
  if (from === "inbox" && to === "afgehandeld") return "moved_to_afgehandeld";
  if (from === "inbox" && to === "archive") return "self_archived";
  if (from === "archive" && to === "inbox") return "restored_from_archive";
  return null;
}

/**
 * Extract Transition[] uit ruwe delta-events. Puur en deterministisch:
 * dezelfde input geeft exact dezelfde output (geen clock, geen randomness).
 */
export function extractTransitions(input: ExtractInput): Transition[] {
  const {
    events,
    bucketOf,
    lastKnownBucket,
    observed_at,
    prevCategories,
    prevIsRead,
    conversationToEmailId,
  } = input;

  // Pattern 2: correlatie-Maps op immutable id.
  const leftFolders = new Map<string, string>(); // id -> bron-folderId (@removed)
  const enteredFolders = new Map<string, string>(); // id -> doel-folderId (verschijning)

  for (const ev of events) {
    if (ev["@removed"]?.reason === "deleted") {
      leftFolders.set(ev.id, ev._folderId);
    } else {
      enteredFolders.set(ev.id, ev.parentFolderId ?? ev._folderId);
    }
  }

  const out: Transition[] = [];
  const handledAsMove = new Set<string>();

  // 1. Cross-folder moves: voor elke verschijning bepaal de bron-bucket
  //    (within-tick @removed, anders lastKnownBucket fallback).
  for (const [id, toFolder] of enteredFolders) {
    const toBucket = bucketOf(toFolder);

    const fromFolder = leftFolders.get(id);
    const fromBucket = fromFolder !== undefined ? bucketOf(fromFolder) : lastKnownBucket.get(id);

    if (fromBucket === undefined) continue; // geen bekende bron -> geen move af te leiden
    if (fromBucket === toBucket) continue; // geen daadwerkelijke bucket-verandering

    const kind = moveKind(fromBucket, toBucket);
    if (kind === null) {
      // Gap-fix variant 2 (2026-06-04): move uit een betekenisvolle bucket naar
      // een getrackte-maar-betekenisloze bestemming (bv. de Power-Automate
      // sweep inbox -> "Sugar Archive"). Geen verdict-soort, wel vastleggen —
      // anders is een bulk-leegloop van de inbox opnieuw onzichtbaar.
      if (fromBucket !== "other") {
        handledAsMove.add(id);
        out.push({
          immutable_id: id,
          kind: "left_to_untracked",
          from_bucket: fromBucket,
          to_bucket: toBucket,
          observed_at,
        });
      }
      continue;
    }

    handledAsMove.add(id);
    out.push({
      immutable_id: id,
      kind,
      from_bucket: fromBucket,
      to_bucket: toBucket,
      observed_at,
    });
  }

  // 1b. Vangnet (gap-fix 2026-06-04): @removed uit een getrackte, betekenisvolle
  //     bucket ZONDER verschijning elders in deze tick -> left_to_untracked.
  //     Zonder dit vangnet is een move naar een niet-getrackte map (Sugar-sweep,
  //     verse jaarmap) volledig onzichtbaar.
  for (const [id, fromFolder] of leftFolders) {
    if (enteredFolders.has(id)) continue; // beide helften gezien -> al behandeld
    const fromBucket = bucketOf(fromFolder);
    if (fromBucket === "other") continue; // verdwijning uit een niet-betekenisvolle bron
    out.push({
      immutable_id: id,
      kind: "left_to_untracked",
      from_bucket: fromBucket,
      to_bucket: null,
      observed_at,
    });
  }

  // 2. In-place + reply-signalen op de verschijning-events (geen move).
  for (const ev of events) {
    if (ev["@removed"]?.reason === "deleted") continue;
    if (handledAsMove.has(ev.id)) continue;

    const folderId = ev.parentFolderId ?? ev._folderId;
    const bucket = bucketOf(folderId);

    // replied: sent-bucket created-event waarvan conversationId matcht met een
    // bekende inbound mail. Geen match -> geen transitie.
    if (bucket === "sent" && ev.conversationId && conversationToEmailId) {
      const matched = conversationToEmailId.get(ev.conversationId);
      if (matched !== undefined) {
        out.push({
          immutable_id: ev.id,
          kind: "replied",
          from_bucket: null,
          to_bucket: bucket,
          matched_email_id: matched,
          observed_at,
        });
      }
      continue;
    }

    // category_edited: diff tegen vorige bekende categorieën.
    if (ev.categories !== undefined && prevCategories?.has(ev.id)) {
      const prev = prevCategories.get(ev.id) ?? [];
      if (categoriesDiffer(prev, ev.categories)) {
        out.push({
          immutable_id: ev.id,
          kind: "category_edited",
          from_bucket: bucket,
          to_bucket: bucket,
          categories: ev.categories,
          observed_at,
        });
        continue;
      }
    }

    // read_aged: isRead-flip false -> true zonder move (zwakste signaal).
    if (ev.isRead === true && prevIsRead?.get(ev.id) === false) {
      out.push({
        immutable_id: ev.id,
        kind: "read_aged",
        from_bucket: bucket,
        to_bucket: bucket,
        observed_at,
      });
    }
  }

  return out;
}

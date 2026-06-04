/**
 * Phase 112.5 Plan 03 Task 2 — swarm-agnostische PURE signal-deriver (SC-2).
 *
 * Mapt Transition[] (Task 1) + een ledger-hit-set + per-swarm weights ->
 * ReviewSignal[]. Eén verdict per transitie. De ledger-join is load-bearing
 * (RESEARCH Pitfall 5): een restore op een door-ONS-systeem (stage-4
 * auto_archived) gearchiveerde mail is een correctie van een false-positive
 * archivering — het sterkste leersignaal. Een restore zonder ledger-hit zegt
 * niets over onze classificatie (de gebruiker organiseert gewoon zelf) ->
 * restore_other.
 *
 * Operator-weging (112.5-01-SUMMARY, "weging akkoord"):
 *   moved_to_afgehandeld    = approve_handled        (sterk)
 *   restored + ledger-hit   = correctie_false_positive (sterkst)
 *   restored zonder hit     = restore_other
 *   category_edited         = reclassify             (sterk)
 *   replied                 = approve_replied        (sterk)
 *   self_archived           = weak_noise -> weak_seen-achtig (team archiveert zelf
 *                             vrijwel nooit; zwak signaal)
 *   read_aged               = weak_seen              (zwakst)
 *
 * Een swarm kan de weging overschrijven via behavior_tracking_config.weights;
 * de worker resolvet effectieve weights = { ...DEFAULT_WEIGHTS, ...override }.
 *
 * SWARM-AGNOSTISCH + PUUR: ledgerHits, weights, observedTickIso, swarmType en
 * emailIdOf zijn parameters; geen IO, geen clock, geen randomness, geen
 * sales-constanten.
 */

import type { Transition, TransitionKind } from "./transition-extract";

/** De verdicts die een ReviewSignal kan dragen. */
export type SignalVerdict =
  | "correctie_false_positive"
  | "restore_other"
  | "reclassify"
  | "approve_handled"
  | "approve_replied"
  | "weak_seen"
  | "suppressed";

/**
 * Per-transitie-soort weging. Een "weight" is hier een semantisch label dat de
 * verdict-afleiding stuurt (geen numerieke schaal — de operator-weging is
 * categorisch). `self_archived` en `read_aged` zijn de overschrijfbare zwakke
 * signalen; de sterke signalen liggen vast aan hun semantiek.
 */
export interface SignalWeights {
  /** weak_noise = zwak signaal -> weak_seen; strong_noise = sterk -> approve_handled-achtig; suppress = geen signaal. */
  self_archived: "weak_noise" | "strong_noise" | "suppress";
  /** weak -> weak_seen; suppress -> geen signaal. */
  read_aged: "weak" | "suppress";
}

/**
 * Default-weging uit het 112.5-01 operator-besluit. self_archived is een ZWAK
 * noise-signaal (het verkoopteam archiveert zelf vrijwel nooit; Archief ≈
 * exclusief systeem-noise), read_aged is het zwakste signaal. Een swarm kan dit
 * via behavior_tracking_config.weights overschrijven.
 */
export const DEFAULT_WEIGHTS: SignalWeights = {
  self_archived: "weak_noise",
  read_aged: "weak",
};

/** Eén afgeleid review-signaal, klaar voor swarm_review_signals (Plan 02). */
export interface ReviewSignal {
  swarm_type: string;
  email_id: string;
  category_key: string | null;
  verdict: SignalVerdict;
  transition_kind: TransitionKind;
  observed_at: string;
  /** Deterministisch: `${swarm_type}|${email_id}|${verdict}|${observedTickIso}`. */
  dedupe_key: string;
}

export interface DeriveInput {
  transitions: Transition[];
  /** email_ids die ONS systeem stage-4 auto_archived (worker levert de SELECT). */
  ledgerHits: Set<string>;
  swarmType: string;
  /**
   * Mapt een transition naar het email_id dat het signaal draagt. Voor de meeste
   * transities is dat het immutable_id; voor `replied` is dat het matched inbound
   * email_id. De worker geeft een resolver mee (immutable_id -> email_id) zodat
   * deze helper geen DB-kennis nodig heeft.
   */
  emailIdOf: (immutableId: string) => string;
  /** Tick-timestamp; gaat in dedupe_key + observed_at (puur — geen clock-read). */
  observedTickIso: string;
  /** Optionele per-swarm override; gemerged over DEFAULT_WEIGHTS. */
  weights?: SignalWeights;
}

/** Bepaal het email_id dat een transitie draagt (replied -> matched inbound). */
function emailIdForTransition(
  tr: Transition,
  emailIdOf: (im: string) => string,
): string {
  if (tr.kind === "replied" && tr.matched_email_id) return tr.matched_email_id;
  return emailIdOf(tr.immutable_id);
}

/**
 * Map een transitie + ledger-hit + effectieve weights naar een verdict, of null
 * (gesuppressed). Order is load-bearing: restore checkt de ledger-hit eerst.
 */
function verdictFor(
  tr: Transition,
  hasLedgerHit: boolean,
  weights: SignalWeights,
): SignalVerdict | null {
  switch (tr.kind) {
    case "restored_from_archive":
      return hasLedgerHit ? "correctie_false_positive" : "restore_other";
    case "category_edited":
      return "reclassify";
    case "moved_to_afgehandeld":
      return "approve_handled";
    case "replied":
      return "approve_replied";
    case "self_archived":
      if (weights.self_archived === "suppress") return null;
      if (weights.self_archived === "strong_noise") return "approve_handled";
      return "weak_seen"; // weak_noise (default)
    case "read_aged":
      if (weights.read_aged === "suppress") return null;
      return "weak_seen";
    default:
      return null;
  }
}

/**
 * Derive ReviewSignal[] uit transities. Puur en deterministisch: dezelfde input
 * geeft exact dezelfde output (geen clock, geen randomness).
 */
export function deriveSignals(input: DeriveInput): ReviewSignal[] {
  const { transitions, ledgerHits, swarmType, emailIdOf, observedTickIso } = input;
  const weights: SignalWeights = { ...DEFAULT_WEIGHTS, ...(input.weights ?? {}) };

  const out: ReviewSignal[] = [];
  for (const tr of transitions) {
    const emailId = emailIdForTransition(tr, emailIdOf);
    const hasLedgerHit = ledgerHits.has(emailId);
    const verdict = verdictFor(tr, hasLedgerHit, weights);
    if (verdict === null) continue;

    const categoryKey =
      tr.kind === "category_edited"
        ? (tr.categories?.[0] ?? null)
        : null;

    out.push({
      swarm_type: swarmType,
      email_id: emailId,
      category_key: categoryKey,
      verdict,
      transition_kind: tr.kind,
      observed_at: observedTickIso,
      // swarm_type in de key: twee swarms die dezelfde message observeren
      // dedupliceren niet samen (Plan 02 T-112.5-14).
      dedupe_key: `${swarmType}|${emailId}|${verdict}|${observedTickIso}`,
    });
  }
  return out;
}

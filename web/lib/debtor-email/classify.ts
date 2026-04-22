/**
 * Debtor-email classifier.
 *
 * Pure, deterministic, language-aware (NL / FR / EN) rule set for first-pass
 * triage of incoming debtor mail. Output:
 *
 *   {
 *     category:    "auto_reply" | "ooo_temporary" | "ooo_permanent"
 *                | "payment_admittance" | "unknown",
 *     confidence:  0–1 (hand-assigned from observed precision),
 *     matchedRule: identifier of the rule that fired (for audit trails)
 *   }
 *
 * Rules are ordered; first match wins. Threshold + shadow-mode gating are
 * decisions for the orchestrator, NOT this function. See
 * docs/debtor-email-swarm-roadmap.md and docs/debtor-email-patterns.md.
 */

export type Category =
  | "auto_reply"
  | "ooo_temporary"
  | "ooo_permanent"
  | "payment_admittance"
  | "unknown";

export interface ClassifyInput {
  subject: string;
  from: string;
  bodySnippet?: string;
}

export interface ClassifyResult {
  category: Category;
  confidence: number;
  matchedRule: string;
}

// ───────────────────────────────────────────────────────────────── regexes ──

// `no-reply@` with a hyphen was not matched by the old `no\.?reply` form —
// observed miss: `no-reply@brocacef.nl` fell through to `unknown`. Allow
// dot, dash, or underscore between the two halves.
const SENDER_SYSTEM =
  /^(no[-._]?reply|donotreply|mailer[-_]?daemon|postmaster|automailer|autoreply)@/i;

// Trailing `[a-z0-9._-]*` allows suffixes after the role keyword. Observed:
// `PaymentNotification@inditex.com`, `betaalspecificatie@unica.nl`. Also
// added `specificatie`, `crediteuren`, `debiteuren` which appeared in the
// 2026-04-22 hand-labeled batch.
const SENDER_PAYMENT_ROLE =
  /^(payment|invoice|factu(?:ur|ratie)|facturen|billing|accounting|accounts?[._-]?payable|betaal|betalingen|specificatie|crediteuren|debiteuren|compte[._-]?client)[a-z0-9._-]*@/i;

/** Detects a human-shape sender (firstname.lastname@ or firstname-lastname@). */
const SENDER_HUMAN_SHAPE = /^[a-z][a-z'-]*[._-][a-z][a-z'-]*@/i;

const SUBJECT_AUTO_REPLY =
  /(automatisch(?:e)?\s+antwoord|automatic\s+reply|auto[-\s]?reply|réponse\s+automatique|out\s+of\s+office|absence\s*:|afwezigheidsbericht|abwesenheits)/i;

/**
 * SUBJECT_PAYMENT is deliberately narrow: it must match only confirmation /
 * advice / receipt of payment, not the word "betaling" in any context. A
 * previous broader regex (just `betaling`) caught MR's own outbound dunning
 * template "VERZOEK TOT BETALING" (replies/forwards of it) and crashed
 * precision to 19%. Each term below was verified on the historical corpus.
 */
const SUBJECT_PAYMENT =
  /(betalingsadvies|betaal[-\s]?advies|betaalbevestiging|betalingsbevestiging|betaalspecificatie|betaling(?:s)?specificatie|geregistreerde\s+betaling(?:en)?|betaling\s+ontvangen|ontvangen\s+betaling|payment\s+(?:advice|confirmation|details|notice|received|notification|reference)|remittance\s+advice|avis\s+de\s+paiement|confirmation\s+de\s+paiement|zahlungsavis|zahlungsbest(?:ä|ae)tigung|zahlungseingang)/i;

/**
 * Customer-side "I have approved / marked paid" notifications. Observed on
 * CBRE portal forwards: "FW: Factuur 17340374 gemarkeerd als Betaald door CBRE"
 * and "FW: Factuur 17340342 is goedgekeurd voor betaling door CBRE". 18/29
 * of the 2026-04-22 hand-labeled batch fell into this shape.
 *
 * Must fire BEFORE SUBJECT_REFUND_BLOCK because some of these carry
 * "Creditnota" in the subject ("FW: Creditnota 17339697 gemarkeerd als
 * Betaald door CBRE") — the credit-note is itself being settled, so this is
 * still a payment admittance from MR's perspective.
 */
const SUBJECT_PAID_MARKER =
  /(gemarkeerd\s+als\s+betaald|goedgekeurd\s+voor\s+betaling|marked\s+as\s+paid|approved\s+for\s+payment|released\s+for\s+payment)/i;

/**
 * Subjects that look payment-related but are OUTBOUND dunning templates (or
 * replies to them). We must never classify these as payment_admittance —
 * they're the original payment REQUEST, not a confirmation.
 */
const SUBJECT_PAYMENT_REQUEST_BLOCK =
  /(verzoek\s+tot\s+betaling|request\s+for\s+payment|payment\s+request|rappel\s+de\s+paiement|demande\s+de\s+paiement|herinnering|reminder|mahnung|ingebreke)/i;

/**
 * Subjects that indicate refund / return of invoice — not an admittance of
 * incoming payment.
 */
const SUBJECT_REFUND_BLOCK =
  /(retour\s+van\s+factuur|creditnota|credit\s+note|refund|terugbetaling|terugstorting|remboursement)/i;

/** Mandatory exclusion — prevents payment_dispute from matching payment_admittance. */
const BODY_DISPUTE =
  /\b(dispute|disputed|complaint|missing|incorrect|betwist|contesteren|klacht|reclamatie|réclamation|contestation|foutief|onjuist|ontbreekt|error\s+in|wrong\s+amount)\b/i;

/** Subject-level dispute signals (can fire even if body is empty). */
const SUBJECT_DISPUTE =
  /(contesteren|betwisten|dispute|klacht|réclamation)/i;

/**
 * Body signals — employee is temporarily away + will return.
 * Covers explicit dates ("terug op 5/5", "tot 21 april"), weekday returns
 * ("vanaf maandag"), back-at-office phrasing ("weer op kantoor"), and
 * vacation/leave keywords.
 *
 * Date patterns require either a month name or a full DD-MM-YYYY form.
 * A previous looser form `van\s+\d{1,2}[-./]\d{1,2}` false-matched
 * office-hours ranges like "van 8.30 uur t/m 17.00 uur" and labeled plain
 * auto-replies as ooo_temporary.
 */
const BODY_OOO_TEMPORARY =
  /\b(terug\s+op|terug\s+vanaf|back\s+on|return\s+on|i\s+will\s+return|de\s+retour\s+le|je\s+serai\s+de\s+retour|vacation|congé|vacances|verlof|afwezig\s+(?:van|tot)|from\s+\d|van\s+\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|van\s+\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)|tot\s+\d{1,2}[-./]\d{1,2}(?:[-./]\d{2,4})?|tot\s+\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)|until\s+\d{1,2}[-./]\d{1,2}|until\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d|between\s+\d|vanaf\s+(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|morgen|overmorgen|volgende\s+week|volgende\s+maand)|(?:weer|terug)\s+(?:op\s+kantoor|in\s+dienst|beschikbaar|aanwezig)|ben\s+ik\s+weer|from\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+week|next\s+month)|à\s+partir\s+(?:de|du)|ab\s+(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|(?:nä|nae)chste\s+woche))/i;

/** Body signals — employee has left / redirect to a new person permanently. */
const BODY_OOO_PERMANENT =
  /\b(no\s+longer\s+(?:works?|employed)|has\s+left\s+the\s+(?:company|organization)|niet\s+meer\s+(?:werkzaam|actief|in\s+dienst)|heeft\s+het\s+bedrijf\s+verlaten|ne\s+(?:travaille|fait)\s+plus\s+partie|please\s+(?:contact|redirect|reach\s+out\s+to)|gelieve\s+contact\s+op\s+te\s+nemen\s+met|veuillez\s+contacter)/i;

/**
 * Body signals — mailbox itself is retired / redirect future mail to a new
 * address. Distinct from BODY_OOO_PERMANENT (which covers person-has-left
 * cases). Both map to `ooo_permanent` from the caller's perspective — both
 * mean "update vendor master, do not resend here".
 *
 * Observed triggers on the real corpus: KPMG "niet langer gebruikt … stuur
 * naar nl-fmrbainvoiceprocessing@kpmg.nl"; KWC "alle toekomstige facturen
 * te verzenden naar facturen@kwc-culemborg.nl".
 */
const BODY_MAILBOX_RETIRED =
  /\b(dit\s+e-?mail(?:adres)?\s+(?:wordt\s+)?niet\s+(?:meer|langer)|niet\s+(?:meer|langer)\s+(?:gebruikt|in\s+gebruik|actief|beschikbaar|gebruikt\s+voor)|(?:alle\s+(?:toekomstige\s+)?|gelieve\s+|graag\s+)?(?:facturen|invoices)\s+(?:te\s+)?(?:verzenden|versturen|sturen|mailen)\s+(?:naar|to)\s+(?:het\s+)?(?:volgende\s+)?(?:e-?mail)?|(?:gelieve\s+|graag\s+)?(?:voortaan|in\s+het\s+vervolg)\s+(?:mailen|versturen|sturen|te\s+sturen)\s+naar|no\s+longer\s+(?:in\s+use|used|monitored|active|valid)|this\s+(?:email|mailbox|address)\s+(?:is\s+)?no\s+longer|please\s+send\s+(?:all\s+)?(?:future\s+)?(?:invoices|emails?)\s+to|veuillez\s+(?:désormais|à\s+l['’]avenir)\s+envoyer)/i;

/** Generic OoO body signal (used to promote a subject-only auto_reply to OoO). */
const BODY_OOO_GENERIC =
  /\b(afwezig|ik\s+ben\s+afwezig|uit\s+kantoor|out\s+of\s+office|i\s+am\s+(?:away|out)|currently\s+out|absent\s+du|je\s+suis\s+absent|en\s+congé|in\s+vergadering|in\s+meeting)\b/i;

/**
 * Broader subject hint for payment — matches "betaling", "betaal", "payment",
 * "factuur", "remittance" as standalone words, *not* tied to a specific
 * confirmation phrase. Used ONLY together with other payment signals (sender
 * is noreply/payment-role, AND body looks like a payment confirmation).
 */
const SUBJECT_PAYMENT_HINT =
  /\b(betaling(?:en|s)?|betaal|betaalspecificatie|payment|remittance|zahlung|paiement|creditnota\s+(?:voor|van))\b/i;

/**
 * Body signals that confirm a payment notification (vs request or dispute).
 * "betaalspecificatie", "bankafschrift", "overgemaakt", "remitted" — these
 * are near-definitive of an incoming payment.
 */
const BODY_PAYMENT_CONFIRMATION =
  /\b(betaalspecificatie|betalingsspecificatie|bankafschrift|(?:hebben|zijn)\s+overgemaakt|betaling(?:en)?\s+(?:van|voor|overgemaakt|gedaan)|betaalbewijs|(?:payment|remittance)\s+(?:advice|details|notification|specification|has\s+been\s+made|was\s+made|remitted|enclosed)|amount\s+(?:credited|paid|remitted)|avis\s+de\s+paiement|betaalinstructie)\b/i;

// ─────────────────────────────────────────────────────────────── classify ──

export function classify(input: ClassifyInput): ClassifyResult {
  const subject = input.subject ?? "";
  const from = input.from ?? "";
  const body = input.bodySnippet ?? "";

  // Strip leading Re:/Fw:/Tr: prefixes so subject regexes match.
  const normSubject = subject.replace(/^(?:(?:re|fw|fwd|tr|aw|sv|antw)\s*:\s*)+/i, "").trim();

  const isSystemSender = SENDER_SYSTEM.test(from);
  const isHumanSender = SENDER_HUMAN_SHAPE.test(from);
  const subjectIsAutoReply = SUBJECT_AUTO_REPLY.test(normSubject);
  const subjectIsPayment = SUBJECT_PAYMENT.test(normSubject);
  const subjectIsPaymentHint = SUBJECT_PAYMENT_HINT.test(normSubject);
  const senderIsPaymentRole = SENDER_PAYMENT_ROLE.test(from);
  const bodyDispute = BODY_DISPUTE.test(body);
  const bodyIsPaymentConfirmation = BODY_PAYMENT_CONFIRMATION.test(body);
  const subjectIsPaymentRequest = SUBJECT_PAYMENT_REQUEST_BLOCK.test(normSubject);
  const subjectIsRefund = SUBJECT_REFUND_BLOCK.test(normSubject);
  const subjectIsDispute = SUBJECT_DISPUTE.test(normSubject);
  const subjectIsPaidMarker = SUBJECT_PAID_MARKER.test(normSubject);

  // ── Hard blocks (anything payment-like but clearly NOT payment_admittance) ──

  if (subjectIsPaymentRequest) {
    return { category: "unknown", confidence: 0, matchedRule: "payment_blocked_request_template" };
  }
  // Paid-marker wins over refund block: a credit note "gemarkeerd als Betaald"
  // is still an incoming-payment confirmation, not a refund.
  if (subjectIsPaidMarker) {
    return { category: "payment_admittance", confidence: 0.96, matchedRule: "subject_paid_marker" };
  }
  if (subjectIsRefund) {
    return { category: "unknown", confidence: 0, matchedRule: "payment_blocked_refund" };
  }
  if (subjectIsDispute || bodyDispute) {
    if (senderIsPaymentRole || subjectIsPayment || subjectIsPaymentHint) {
      return { category: "unknown", confidence: 0, matchedRule: "payment_blocked_by_dispute" };
    }
  }

  // ── PAYMENT_ADMITTANCE (checked BEFORE auto-reply/sender_system) ──────────
  //
  // Historical bug: sender_system was matched first and short-circuited to
  // auto_reply, so payment advices from noreply@jumbo.com (and similar) were
  // mislabeled. Payment signals are stronger evidence and now win.

  if (senderIsPaymentRole && subjectIsPayment) {
    return { category: "payment_admittance", confidence: 0.94, matchedRule: "payment_sender+subject" };
  }
  if (subjectIsPayment) {
    return { category: "payment_admittance", confidence: 0.9, matchedRule: "payment_subject" };
  }
  // noreply / payment-role sender + broader payment hint in subject AND body
  // confirms payment → strong match. This catches "Betaling BAM Bedrijf …"
  // kind of subjects that lack the specific confirmation phrase but come
  // bundled with a "betaalspecificatie" body from a system address.
  if ((isSystemSender || senderIsPaymentRole) && subjectIsPaymentHint && bodyIsPaymentConfirmation) {
    return { category: "payment_admittance", confidence: 0.9, matchedRule: "payment_sender+hint+body" };
  }
  // Body-only confirmation from a payment-role sender (no payment subject).
  if (senderIsPaymentRole && bodyIsPaymentConfirmation) {
    return { category: "payment_admittance", confidence: 0.85, matchedRule: "payment_sender+body" };
  }
  // Body-only confirmation from a system/noreply sender. Catches cases like
  // `noreply@jumbo.com` + "Excel specificatie 2000095879" + body containing
  // "betaalspecificatie"/"overgemaakt" — the subject has no payment keyword
  // but the body is definitively a payment advice from an automated system.
  if (isSystemSender && bodyIsPaymentConfirmation) {
    return { category: "payment_admittance", confidence: 0.85, matchedRule: "payment_system_sender+body" };
  }

  // ── AUTO-REPLY / OoO family ───────────────────────────────────────────────

  if (subjectIsAutoReply) {
    if (BODY_MAILBOX_RETIRED.test(body)) {
      return { category: "ooo_permanent", confidence: 0.94, matchedRule: "subject_autoreply+body_mailbox_retired" };
    }
    if (BODY_OOO_PERMANENT.test(body)) {
      return { category: "ooo_permanent", confidence: 0.96, matchedRule: "subject_autoreply+body_permanent" };
    }
    if (BODY_OOO_TEMPORARY.test(body)) {
      return { category: "ooo_temporary", confidence: 0.96, matchedRule: "subject_autoreply+body_temporary" };
    }
    if (BODY_OOO_GENERIC.test(body) && isHumanSender) {
      return { category: "ooo_temporary", confidence: 0.88, matchedRule: "subject_autoreply+body_ooo_generic+human_sender" };
    }
    // Subject alone is already a very strong signal — these are server-set
    // vacation responders. Observed precision ≈ 97% on historical corpus.
    return { category: "auto_reply", confidence: 0.95, matchedRule: "subject_autoreply" };
  }

  // Body-only OoO signal (subject is generic): only accept if sender is human.
  if (isHumanSender && BODY_OOO_GENERIC.test(body)) {
    if (BODY_OOO_PERMANENT.test(body)) {
      return { category: "ooo_permanent", confidence: 0.85, matchedRule: "body_permanent+human_sender" };
    }
    if (BODY_OOO_TEMPORARY.test(body)) {
      return { category: "ooo_temporary", confidence: 0.8, matchedRule: "body_temporary+human_sender" };
    }
  }

  // System sender as a LAST-resort auto_reply fallback. Payment/dispute/
  // OoO checks already ran; if we're still here, a noreply address is
  // almost always a transactional notification (receipt, error, bounce).
  // Lower confidence (0.8) — human review below this threshold is fine.
  if (isSystemSender) {
    return { category: "auto_reply", confidence: 0.8, matchedRule: "sender_system_fallback" };
  }

  return { category: "unknown", confidence: 0, matchedRule: "no_match" };
}

// Phase 60-09 — TDD coverage for classify().
//
// Two narrow regex changes:
//   1. SUBJECT_TICKET_REF must NOT match factuurportal-style invoice IDs
//      (`FP-2026-270485:`). These come from `no-reply@factuurportal.eu` and
//      are invoice-portal references, not ticket-system acks.
//   2. BODY_OOO_TEMPORARY must catch the 6 patterns surfaced by the 60-08
//      spot-check (NL t/m, op <weekday>, tot en met, French absent du X au Y,
//      single-word momenteel afwezig, niet aanwezig op <weekday>).
//
// All other classify() behaviour MUST remain unchanged.

import { describe, it, expect } from "vitest";
import { classify } from "../classify";

describe("60-09 SUBJECT_TICKET_REF — exclude factuurportal IDs", () => {
  it("FP-2026-270485 (invoice rejection) does NOT match subject_ticket_ref", () => {
    const result = classify({
      subject:
        "FP-2026-270485: Uw factuur voor de gemeente Overbetuwe kan helaas niet worden verwerkt door de crediteurenadministratie.",
      from: "no-reply@factuurportal.eu",
      bodySnippet:
        "Helaas kan uw factuur niet door ons verwerkt worden om een van de volgende redenen: 1. Er staat geen bedrag exclusief btw vermeld...",
    });
    expect(result.matchedRule).not.toBe("subject_ticket_ref");
  });

  it("FP-2026-XXXXXX 'is ontvangen' falls through to no_match (not subject_ticket_ref)", () => {
    // The 'is ontvangen' variant no longer matches subject_ticket_ref. The
    // subject_acknowledgement regex requires `uw factuur (is ontvangen|wordt
    // verwerkt)` adjacent and does NOT cover the `voor de gemeente X is
    // ontvangen` form (extra noun phrase between 'factuur' and 'is'). Per
    // 60-09 D-22 boundary we do not extend subject_acknowledgement here —
    // the row falls to `unknown` for human review, which is the correct
    // safety posture: a human confirms it's a benign ack before any future
    // promotion. A follow-up plan can broaden the ack regex if telemetry
    // shows this pattern adding queue volume.
    const result = classify({
      subject: "FP-2026-177324: Uw factuur voor de gemeente Overbetuwe is ontvangen.",
      from: "no-reply@factuurportal.eu",
      bodySnippet: "",
    });
    expect(result.matchedRule).not.toBe("subject_ticket_ref");
    expect(result.category).toBe("unknown");
  });

  it("legitimate Coop ticket subject still matches subject_ticket_ref", () => {
    const result = classify({
      subject:
        'Aanmelding van melding C2603 00090: "Rapport n.a.v. werkzaamheden 1572649 op locatie 637245"',
      from: "facilitair.winkelorganisatie@coop.nl",
      bodySnippet: "",
    });
    expect(result.matchedRule).toBe("subject_ticket_ref");
    expect(result.category).toBe("auto_reply");
  });

  it("legitimate CBRE GCS ticket still matches subject_ticket_ref", () => {
    const result = classify({
      subject: "GCS0113543 is resolved: 527656 - Rekeningoverzicht / vooraankondiging",
      from: "BSOServiceDesk@cbre.com",
      bodySnippet: "",
    });
    expect(result.matchedRule).toBe("subject_ticket_ref");
  });

  it("legitimate Minor Hotels ticket subject still matches subject_ticket_ref", () => {
    const result = classify({
      subject:
        "Minor Hotels Europe and Americas - Query reception feedback - Ticket number :564592 *** 529087",
      from: "ne.ptp@minor-hotels.com",
      bodySnippet: "",
    });
    expect(result.matchedRule).toBe("subject_ticket_ref");
  });

  it("bracketed AAC ticket still matches subject_ticket_ref via bracket branch", () => {
    // Strictly the bracket prefix [AAC#...] — sender is human-shaped so we
    // route via auto_reply path. We just need the rule to fire.
    const result = classify({
      subject: "[AAC#2026031910035] Iets",
      from: "info@aacadministraties.nl",
      bodySnippet: "",
    });
    expect(result.matchedRule).toBe("subject_ticket_ref");
  });
});

describe("60-09 BODY_OOO_TEMPORARY — extended coverage", () => {
  const autoReplySubject = "Automatisch antwoord: Uw bericht";

  it("pattern 1: 'vanaf 26 maart t/m 29 maart 2026 niet aanwezig'", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "jan.de.vries@example.nl",
      bodySnippet:
        "Bedankt voor uw bericht. Ik ben vanaf 26 maart t/m 29 maart 2026 niet aanwezig.",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
    expect(result.category).toBe("ooo_temporary");
  });

  it("pattern 2: 'Op woensdag 11 mrt en donderdag 12 mrt ben ik vrij'", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "anna.bakker@example.nl",
      bodySnippet: "Op woensdag 11 mrt en donderdag 12 mrt ben ik vrij.",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
  });

  it("pattern 3: 'Tot en met 9 maart ben ik vrij'", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "piet.jansen@example.nl",
      bodySnippet: "Tot en met 9 maart ben ik vrij.",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
  });

  it("pattern 4: 'ik ben niet aanwezig op dinsdag 17/02/2026'", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "marie.dupont@example.nl",
      bodySnippet: "ik ben niet aanwezig op dinsdag 17/02/2026",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
  });

  it("pattern 5: 'Ik ben momenteel afwezig' (single-word local-part sender)", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "axel@seandicus.be",
      bodySnippet: "Ik ben momenteel afwezig.",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
  });

  it("pattern 6: French 'Je suis absente du 15/11 au 25/11'", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "claire.martin@example.fr",
      bodySnippet: "Je suis absente du 15/11 au 25/11.",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
  });

  it("pattern 6 (variant): French 'absent du 1 mars au 15 mars'", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "paul.bernard@example.fr",
      bodySnippet: "Je suis absent du 1 mars au 15 mars.",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
  });

  it("existing 'terug op 5 mei' temporary pattern still matches", () => {
    const result = classify({
      subject: autoReplySubject,
      from: "human.sender@example.nl",
      bodySnippet: "Ik ben terug op 5 mei.",
    });
    expect(result.matchedRule).toBe("subject_autoreply+body_temporary");
  });
});

describe("subject_spam_prefix — Exchange `[SPAM]` tag", () => {
  it("plain `[SPAM] ...` subject classifies as spam", () => {
    const result = classify({
      subject: "[SPAM] Open duizenden kanalen met één apparaat",
      from: "smart.tv.usb@example.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("spam");
    expect(result.matchedRule).toBe("subject_spam_prefix");
  });

  it("`RE: [SPAM] ...` subject still classifies as spam", () => {
    const result = classify({
      subject: "RE: [SPAM] Modelle für Ihr Verkaufsnetz",
      from: "dirk.dietrich@example.de",
      bodySnippet: "",
    });
    expect(result.category).toBe("spam");
    expect(result.matchedRule).toBe("subject_spam_prefix");
  });

  it("fires before auto_reply/payment heuristics", () => {
    // Even if the body looks like a payment confirmation, `[SPAM]` wins.
    const result = classify({
      subject: "[SPAM] Betaalbevestiging",
      from: "payment@example.com",
      bodySnippet: "betaalspecificatie overgemaakt",
    });
    expect(result.category).toBe("spam");
  });

  it("case-insensitive match", () => {
    const result = classify({
      subject: "[spam] anything",
      from: "x@example.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("spam");
  });

  it("`[SPAM]` not at the start does NOT match", () => {
    const result = classify({
      subject: "Factuur 17338747 [SPAM] discussion",
      from: "human.sender@example.com",
      bodySnippet: "",
    });
    expect(result.matchedRule).not.toBe("subject_spam_prefix");
  });
});

describe("60-09 regression — non-ooo bodies still fall through to subject_autoreply", () => {
  it("auto-reply subject without OoO body keeps matchedRule='subject_autoreply'", () => {
    const result = classify({
      subject: "Automatic reply: hello",
      from: "someone@example.com",
      bodySnippet: "Bedankt voor uw bericht.",
    });
    expect(result.matchedRule).toBe("subject_autoreply");
  });

  it("office-hours range 'van 8.30 uur t/m 17.00 uur' does NOT match temporary OoO", () => {
    // Guards against the t/m pattern accidentally matching office-hour ranges
    // (the pre-existing comment in classify.ts warns of this prior false-match).
    const result = classify({
      subject: "Automatisch antwoord",
      from: "info@example.nl",
      bodySnippet:
        "Ons kantoor is bereikbaar van 8.30 uur t/m 17.00 uur op werkdagen.",
    });
    expect(result.matchedRule).toBe("subject_autoreply");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Phase 84 D-01 — Stage 1 noise rules for AP-automation FYI traffic.
//
// 7 new in-classifier matchers (loopback rule belongs in the screen-worker,
// per PATTERNS.md). All 7 describe-groups below are RED today: the matchers
// do not exist in classify.ts yet — Wave 2 (84-03) implements them. Each
// group covers positive / negative / boundary fixtures, with the boundary
// case proving discriminator anchoring (e.g. `betwist` ≠ `betaald`).
//
// Reference: .planning/phases/84-.../84-CONTEXT.md D-01 (8 locked keys).
// ───────────────────────────────────────────────────────────────────────────

// Phase 84 D-01 — coupa_invoice_paid_notification
describe("Phase 84 D-01 — coupa_invoice_paid_notification", () => {
  it("positive (corpus 39f17226): Factuur 17332578 gemarkeerd als Betaald door ISS", () => {
    const result = classify({
      subject: "Factuur 17332578 gemarkeerd als Betaald door ISS",
      from: "do_not_reply@issworld.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("coupa_invoice_paid_notification");
    expect(result.matchedRule).toBe("coupa_invoice_paid_notification");
  });

  it("positive (corpus f33c0c32): Factuur 17332579 gemarkeerd als Betaald door ISS", () => {
    const result = classify({
      subject: "Factuur 17332579 gemarkeerd als Betaald door ISS",
      from: "do_not_reply@issworld.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("coupa_invoice_paid_notification");
    expect(result.matchedRule).toBe("coupa_invoice_paid_notification");
  });

  it("positive: synthetic invoice-number variant", () => {
    const result = classify({
      subject: "Factuur 12345678 gemarkeerd als Betaald door ISS",
      from: "do_not_reply@issworld.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("coupa_invoice_paid_notification");
    expect(result.matchedRule).toBe("coupa_invoice_paid_notification");
  });

  it("negative: broad 'gemarkeerd als Betaald' without 'door ISS' anchor falls through", () => {
    // Without the `door ISS` vendor anchor, this is a generic paid-marker
    // (existing payment_admittance) — not the Phase 84 Coupa-specific noise.
    const result = classify({
      subject: "Factuur 99999 gemarkeerd als Betaald",
      from: "human.sender@some-customer.nl",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("coupa_invoice_paid_notification");
  });

  it("boundary (corpus 'Dropped from scope'): 'gemarkeerd als betwist door ISS' MUST NOT match", () => {
    // CONTEXT.md `<domain>` block 'Dropped from scope': dispute templates
    // (`Factuurnummer # is gemarkeerd als betwist door ISS`) MUST stay in
    // Stage 3 — they are NOT paid-notifications.
    const result = classify({
      subject: "Factuurnummer 12345 is gemarkeerd als betwist door ISS",
      from: "do_not_reply@issworld.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("coupa_invoice_paid_notification");
  });
});

// Phase 84 D-01 — coupa_invoice_approved_notification
describe("Phase 84 D-01 — coupa_invoice_approved_notification", () => {
  it("positive (corpus c415624d): Factuur 17332578 is goedgekeurd voor betaling door ISS", () => {
    const result = classify({
      subject: "Factuur 17332578 is goedgekeurd voor betaling door ISS",
      from: "do_not_reply@issworld.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("coupa_invoice_approved_notification");
    expect(result.matchedRule).toBe("coupa_invoice_approved_notification");
  });

  it("positive (corpus 7ff782a0): Factuur 17332579 is goedgekeurd voor betaling door ISS", () => {
    const result = classify({
      subject: "Factuur 17332579 is goedgekeurd voor betaling door ISS",
      from: "do_not_reply@issworld.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("coupa_invoice_approved_notification");
    expect(result.matchedRule).toBe("coupa_invoice_approved_notification");
  });

  it("positive: synthetic invoice-number variant", () => {
    const result = classify({
      subject: "Factuur 12345678 is goedgekeurd voor betaling door ISS",
      from: "do_not_reply@issworld.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("coupa_invoice_approved_notification");
    expect(result.matchedRule).toBe("coupa_invoice_approved_notification");
  });

  it("negative: generic 'goedgekeurd' without 'voor betaling door ISS' anchor falls through", () => {
    const result = classify({
      subject: "Uw offerte is goedgekeurd",
      from: "sales@some-customer.nl",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("coupa_invoice_approved_notification");
  });

  it("boundary: CBRE-variant 'goedgekeurd voor betaling door CBRE' MUST NOT match (D-06 ISS-only)", () => {
    // RESEARCH Open Q #2: Phase 84 ships `door ISS` ONLY; CBRE-variants
    // stay in Stage 3 (dispute risk in CONTEXT.md `<domain>`).
    const result = classify({
      subject: "Factuur 17340342 is goedgekeurd voor betaling door CBRE",
      from: "do_not_reply@cbre.coupahost.com",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("coupa_invoice_approved_notification");
  });
});

// Phase 84 D-01 — iss_ptp_autoreply
describe("Phase 84 D-01 — iss_ptp_autoreply", () => {
  it("positive (corpus 74008945): Invoice-PtP@nl.issworld.com — Factuur 25122603", () => {
    const result = classify({
      subject:
        "Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 25122603",
      from: "Invoice-PtP@nl.issworld.com",
      bodySnippet:
        "Dit mailadres is uitsluitend bedoeld voor het automatisch verwerken van facturen.",
    });
    expect(result.category).toBe("iss_ptp_autoreply");
    expect(result.matchedRule).toBe("iss_ptp_autoreply");
  });

  it("positive (corpus 204952d2): Invoice-PtP@nl.issworld.com — Factuur 17341747", () => {
    const result = classify({
      subject:
        "Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17341747",
      from: "Invoice-PtP@nl.issworld.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("iss_ptp_autoreply");
    expect(result.matchedRule).toBe("iss_ptp_autoreply");
  });

  it("positive (corpus e80e084f): Invoice-PtP@nl.issworld.com — Factuur 17341439", () => {
    const result = classify({
      subject:
        "Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17341439",
      from: "Invoice-PtP@nl.issworld.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("iss_ptp_autoreply");
    expect(result.matchedRule).toBe("iss_ptp_autoreply");
  });

  it("negative: ISS PtP sender but generic subject (no Documenten anchor) falls through", () => {
    const result = classify({
      subject: "Vraag over factuur",
      from: "Invoice-PtP@nl.issworld.com",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("iss_ptp_autoreply");
  });

  it("boundary: generic 'Automatisch antwoord: Out of office' from random sender MUST match auto_reply (existing), NOT iss_ptp_autoreply", () => {
    // Pitfall 2 (regex specificity ordering): the new ISS-PtP rule must NOT
    // swallow the generic SUBJECT_AUTO_REPLY branch.
    const result = classify({
      subject: "Automatisch antwoord: Out of office",
      from: "jan.de.vries@example.nl",
      bodySnippet: "",
    });
    expect(result.category).toBe("auto_reply");
    expect(result.matchedRule).not.toBe("iss_ptp_autoreply");
  });
});

// Phase 84 D-01 — frieslandcampina_portal_reject
describe("Phase 84 D-01 — frieslandcampina_portal_reject", () => {
  it("positive: Robbie.Robot@frieslandcampina.com 'FINAL_REMINDER_Invoice received for Candex'", () => {
    const result = classify({
      subject:
        "FINAL_REMINDER_Invoice received for Candex related purchase(s)_PO12345_20260520",
      from: "Robbie.Robot@frieslandcampina.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("frieslandcampina_portal_reject");
    expect(result.matchedRule).toBe("frieslandcampina_portal_reject");
  });

  it("positive (variant): different PO number, same template", () => {
    const result = classify({
      subject:
        "FINAL_REMINDER_Invoice received for Candex related purchase(s)_PO99999_20260415",
      from: "Robbie.Robot@frieslandcampina.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("frieslandcampina_portal_reject");
    expect(result.matchedRule).toBe("frieslandcampina_portal_reject");
  });

  it("positive (variant): subject without trailing date", () => {
    const result = classify({
      subject: "FINAL_REMINDER_Invoice received for Candex related purchase(s)",
      from: "Robbie.Robot@frieslandcampina.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("frieslandcampina_portal_reject");
    expect(result.matchedRule).toBe("frieslandcampina_portal_reject");
  });

  it("negative: frieslandcampina human sender (not Robbie.Robot) falls through", () => {
    const result = classify({
      subject: "Vraag over factuur 12345",
      from: "anna.bakker@frieslandcampina.com",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("frieslandcampina_portal_reject");
  });

  it("boundary: Robbie.Robot sender with a generic subject (no Candex anchor) does NOT match", () => {
    const result = classify({
      subject: "Robbie test message",
      from: "Robbie.Robot@frieslandcampina.com",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("frieslandcampina_portal_reject");
  });
});

// Phase 84 D-01 — m365_quarantine
describe("Phase 84 D-01 — m365_quarantine", () => {
  it("positive (corpus 676adada): q2q@apexfire.ie 'Microsoft 365 security: You have messages in quarantine'", () => {
    const result = classify({
      subject: "Microsoft 365 security: You have messages in quarantine",
      from: "q2q@apexfire.ie",
      bodySnippet: "",
    });
    expect(result.category).toBe("m365_quarantine");
    expect(result.matchedRule).toBe("m365_quarantine");
  });

  it("positive (corpus e3d6add8): q2q@apexfire.ie variant, different mailbox", () => {
    const result = classify({
      subject: "Microsoft 365 security: You have messages in quarantine",
      from: "q2q@apexfire.ie",
      bodySnippet: "Review and release your quarantined messages.",
    });
    expect(result.category).toBe("m365_quarantine");
    expect(result.matchedRule).toBe("m365_quarantine");
  });

  it("positive (synthetic): Microsoft 365 quarantine notice from any apexfire-style sender", () => {
    const result = classify({
      subject: "Microsoft 365 security: You have messages in quarantine",
      from: "q2q@example-tenant.com",
      bodySnippet: "",
    });
    expect(result.category).toBe("m365_quarantine");
    expect(result.matchedRule).toBe("m365_quarantine");
  });

  it("negative: random subject without 'quarantine' keyword falls through", () => {
    const result = classify({
      subject: "Status update",
      from: "q2q@apexfire.ie",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("m365_quarantine");
  });

  it("boundary: '[SPAM] You have messages in quarantine' prefers spam (Exchange upstream-tag wins)", () => {
    // The pre-existing subject_spam_prefix branch fires FIRST. m365_quarantine
    // must not override it — corpus shows real `[SPAM] You have messages in
    // quarantine` rows (Dmayer36@Prairieinet.Net) that should stay spam.
    const result = classify({
      subject: "[SPAM] You have messages in quarantine",
      from: "Dmayer36@Prairieinet.Net",
      bodySnippet: "",
    });
    expect(result.category).toBe("spam");
    expect(result.matchedRule).toBe("subject_spam_prefix");
  });
});

// Phase 84 D-01 — sender_phishing_notice
describe("Phase 84 D-01 — sender_phishing_notice", () => {
  it("positive (corpus 6ca61888): melanie@rskinstallatie.nl 'Uitleg pishing mail'", () => {
    const result = classify({
      subject: "Uitleg pishing mail",
      from: "melanie@rskinstallatie.nl",
      bodySnippet: "",
    });
    expect(result.category).toBe("sender_phishing_notice");
    expect(result.matchedRule).toBe("sender_phishing_notice");
  });

  it("positive (corpus e4afd80b): melanie@rskinstallatie.nl 'Voorgaande mail niet openen'", () => {
    const result = classify({
      subject: "Voorgaande mail niet openen",
      from: "melanie@rskinstallatie.nl",
      bodySnippet: "",
    });
    expect(result.category).toBe("sender_phishing_notice");
    expect(result.matchedRule).toBe("sender_phishing_notice");
  });

  it("positive (variant): combined 'pishing' subject from rskinstallatie sender", () => {
    const result = classify({
      subject: "Phishing mail — niet openen",
      from: "melanie@rskinstallatie.nl",
      bodySnippet: "Voorgaande mail was phishing, niet openen.",
    });
    expect(result.category).toBe("sender_phishing_notice");
    expect(result.matchedRule).toBe("sender_phishing_notice");
  });

  it("negative: rskinstallatie sender with normal business subject does NOT match", () => {
    const result = classify({
      subject: "RSK-FACT-DOC-26198",
      from: "melanie@rskinstallatie.nl",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("sender_phishing_notice");
  });

  it("boundary: 'pishing' subject from unrelated sender does NOT match (R-03 narrow pattern)", () => {
    // R-03: rule is one-supplier-narrow today. A pishing keyword alone from
    // a random sender stays unknown until corpus broadens.
    const result = classify({
      subject: "Uitleg pishing mail",
      from: "stranger@somewhere.com",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("sender_phishing_notice");
  });
});

// Phase 84 D-01 — supplier_bank_change_notification
describe("Phase 84 D-01 — supplier_bank_change_notification", () => {
  it("positive (corpus 1b668e99): info@farmplus.nl 'Wijziging huisbankier en betaalgegevens'", () => {
    const result = classify({
      subject: "FarmPlus Wijziging huisbankier en betaalgegevens FarmPlus",
      from: "info@farmplus.nl",
      bodySnippet: "Onze nieuwe IBAN is NL12ABNA0123456789.",
    });
    expect(result.category).toBe("supplier_bank_change_notification");
    expect(result.matchedRule).toBe("supplier_bank_change_notification");
  });

  it("positive (variant): info@farmplus.nl with shorter subject + IBAN body", () => {
    const result = classify({
      subject: "Wijziging huisbankier FarmPlus",
      from: "info@farmplus.nl",
      bodySnippet: "Per direct gebruiken wij een nieuw IBAN voor alle betalingen.",
    });
    expect(result.category).toBe("supplier_bank_change_notification");
    expect(result.matchedRule).toBe("supplier_bank_change_notification");
  });

  it("positive (variant): info@farmplus.nl announcing betaalgegevens change", () => {
    const result = classify({
      subject: "Belangrijke wijziging betaalgegevens",
      from: "info@farmplus.nl",
      bodySnippet: "Onze nieuwe huisbankier is ING; IBAN NL98INGB0123456789.",
    });
    expect(result.category).toBe("supplier_bank_change_notification");
    expect(result.matchedRule).toBe("supplier_bank_change_notification");
  });

  it("negative: farmplus.nl sender with unrelated subject falls through", () => {
    const result = classify({
      subject: "Vraag over levering",
      from: "info@farmplus.nl",
      bodySnippet: "",
    });
    expect(result.category).not.toBe("supplier_bank_change_notification");
  });

  it("boundary: 'IBAN' mention from a non-supplier sender does NOT match", () => {
    const result = classify({
      subject: "Mijn IBAN is gewijzigd",
      from: "klant@external.nl",
      bodySnippet: "Mijn IBAN is gewijzigd.",
    });
    expect(result.category).not.toBe("supplier_bank_change_notification");
  });
});

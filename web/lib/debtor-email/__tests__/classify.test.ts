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

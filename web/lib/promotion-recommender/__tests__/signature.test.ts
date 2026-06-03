import { describe, it, expect } from "vitest";
import { renderDisplaySignature } from "../signature";
import type { RefinementPayload } from "../types";

const FORBIDDEN_JARGON = [
  "regex",
  "eval_type",
  "wilson",
  "llm tiebreaker",
  "coordinator_runs",
  "swarm_intents",
  "swarm_noise_categories",
  "confirm_rate",
  "pipeline_events",
];

describe("renderDisplaySignature (P4-D-10 server-side plain-English)", () => {
  it("Filter rule renders 'Out-of-office replies in subject'-style copy without regex syntax", () => {
    const out = renderDisplaySignature({
      kind: "regex_rule",
      subject_pattern: "out of office",
    });
    expect(out.toLowerCase()).toContain("out of office");
    expect(out.toLowerCase()).toContain("in subject");
  });

  it("Known sender renders the routing sentence with sender + customer", () => {
    const out = renderDisplaySignature({
      kind: "sender_mapping",
      sender_pattern: "konstantijn.example",
      customer_account_id: "C-1042",
    });
    expect(out).toContain("konstantijn.example");
    expect(out).toContain("C-1042");
    expect(out.toLowerCase()).toContain("always route");
  });

  it("AI tuning / New topic / Draft style render kind-specific copy without leaking eval_type / intent_key keys", () => {
    const payloads: RefinementPayload[] = [
      {
        kind: "prompt_tune_stage_3",
        eval_type_seed: "intent-correction",
        sender_domain: "vendor.example",
        intent_key: "credit_request",
      },
      {
        kind: "new_intent",
        intent_key_candidate: "freight_dispute",
        handler_event: "debtor-email/freight_dispute.requested",
        handler_status: "placeholder",
      },
      {
        kind: "prompt_tune_stage_4",
        sender_domain: "customer.example",
        verdict_category: "tone_mismatch",
      },
    ];
    for (const p of payloads) {
      const out = renderDisplaySignature(p);
      expect(out.length).toBeGreaterThan(0);
      const lower = out.toLowerCase();
      for (const banned of FORBIDDEN_JARGON) {
        expect(lower).not.toContain(banned);
      }
    }
  });

  it("output never contains forbidden internal jargon for ANY representative payload", () => {
    const all: RefinementPayload[] = [
      { kind: "regex_rule", subject_pattern: "out of office" },
      {
        kind: "regex_rule",
        subject_pattern: "automatisch antwoord",
        sender_filter: ["vendor.example", "noreply.example"],
      },
      {
        kind: "sender_mapping",
        sender_pattern: "billing.example",
        customer_account_id: "C-9001",
      },
      {
        kind: "prompt_tune_stage_3",
        eval_type_seed: "intent-correction",
        sender_domain: "vendor.example",
        intent_key: "general_inquiry",
      },
      {
        kind: "new_intent",
        intent_key_candidate: "freight_dispute",
        handler_event: "debtor-email/freight_dispute.requested",
        handler_status: "placeholder",
      },
      { kind: "prompt_tune_stage_4", sender_domain: "x.example" },
    ];
    for (const p of all) {
      const lower = renderDisplaySignature(p).toLowerCase();
      for (const banned of FORBIDDEN_JARGON) {
        expect(lower, `payload kind=${p.kind} leaked '${banned}'`).not.toContain(banned);
      }
    }
  });
});

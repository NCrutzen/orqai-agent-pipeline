// Phase 69 Wave 6 (CANO-01, CANO-04). Shared fixture harness for the
// canonicalisation regression suite.
//
// Mock-mode helpers assert the agent input contract (entity_brand +
// brand_register, body_version 2026-05-04.v2, no legacy email_entity /
// email_language). Live-mode helper (runLiveFixture) is consumed by
// live-smoke.test.ts and only runs under LIVE_SMOKE=1.

import { vi, expect } from "vitest";
import type { BrandRegister } from "@/lib/swarms/brand-register";

export interface FixtureInput {
  brand_code: string;
  email_subject: string;
  email_body_text: string;
  email_sender_email: string;
  email_sender_first_name: string | null;
  email_mailbox: string;
}

export interface FixtureExpectation {
  expected_register_language: "nl" | "fr" | "en";
  // Exact string the rendered body must contain (e.g. "Met vriendelijke groet").
  expected_signoff: string;
  expected_formal_address: "u" | "vous" | "you";
  // Additional phrases verified in live mode (e.g. invoice id, "factuur").
  expected_body_contains?: string[];
}

export interface Fixture extends FixtureInput, FixtureExpectation {
  // Defaults to "debtor-email". Sales-stub fixtures override to "sales-email-stub".
  swarm_type?: string;
  // Optional inline brand_register. When supplied, no DB lookup is required —
  // used by sales-stub + UK fixtures to keep CANO-04 zero-DB-write semantics.
  brand_register?: BrandRegister;
}

/**
 * Mock-mode invoker assertion. Validates that an `invokeOrqAgent` mock was
 * called with the canonical Phase 69 input shape for the given fixture.
 *
 * NOTE: full handler-level integration (event → handler → invokeOrqAgent) is
 * exercised by classifier-invoice-copy-handler-isolation.test.ts (Plan 04).
 * This helper is the single point of contract for "what the agent receives";
 * fixture-level suites use it to assert per-brand inputs when they wire the
 * full handler. The standalone fixture suites in this directory currently
 * focus on data-shape validation (no handler invocation), so they typically
 * do not call this helper directly.
 */
export function assertMockedAgentInputs(
  invokeOrqAgentMock: ReturnType<typeof vi.fn>,
  fixture: Fixture,
): void {
  const calls = invokeOrqAgentMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const lastCall = calls[calls.length - 1];
  const [agentKey, inputs] = lastCall as [string, Record<string, unknown>];
  expect(agentKey).toBe("debtor-copy-document-body-agent");
  expect(inputs).toMatchObject({
    entity_brand: fixture.brand_code,
    language: fixture.expected_register_language,
    brand_register: {
      code: fixture.brand_code,
      register_language: fixture.expected_register_language,
      signoff_phrase: fixture.expected_signoff,
      formal_address: fixture.expected_formal_address,
    },
    body_version: "2026-05-04.v2",
  });
  // Negative: must NOT carry the legacy Phase 68 input shape.
  expect(inputs).not.toHaveProperty("email_entity");
  expect(inputs).not.toHaveProperty("email_language");
}

/**
 * Live-mode invoker. Calls real Orq via invokeOrqAgent, validates the
 * response shape, and asserts language-appropriate signoff. Used by
 * live-smoke.test.ts under LIVE_SMOKE=1 only.
 */
export async function runLiveFixture(
  fixture: Fixture,
): Promise<{ body_html: string; detected_tone: string; body_version: string }> {
  const { invokeOrqAgent } = await import("@/lib/automations/orq-agents/client");
  const { loadBrandRegister } = await import("@/lib/swarms/brand-register");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { bodyAgentOutputSchema } = await import(
    "@/lib/automations/debtor-email/coordinator/types"
  );

  const admin = createAdminClient();
  const brandReg =
    fixture.brand_register ??
    (await loadBrandRegister(
      admin,
      fixture.swarm_type ?? "debtor-email",
      fixture.brand_code,
    ));

  const inputs = {
    customer_id: `live-smoke-${fixture.brand_code}`,
    customer_name: fixture.email_sender_email,
    language: brandReg.register_language,
    entity_brand: brandReg.code,
    recent_documents: [],
    context_version: 1,
    brand_register: {
      code: brandReg.code,
      display_name: brandReg.display_name,
      register_language: brandReg.register_language,
      register_dialect: brandReg.register_dialect,
      signoff_phrase: brandReg.signoff_phrase,
      formal_address: brandReg.formal_address,
    },
    intent_result_intent: "copy_document_request",
    intent_result_sub_type: "invoice",
    intent_result_document_reference: `INV-LIVE-${fixture.brand_code}`,
    intent_result_confidence: "high",
    fetched_document_invoice_id: `INV-LIVE-${fixture.brand_code}`,
    fetched_document_filename: "test.pdf",
    fetched_document_document_type: "invoice",
    fetched_document_created_on: "2026-05-05",
    email_subject: fixture.email_subject,
    email_body_text: fixture.email_body_text,
    email_sender_email: fixture.email_sender_email,
    email_sender_first_name: fixture.email_sender_first_name,
    email_mailbox: fixture.email_mailbox,
    email_id: `live-smoke-${fixture.brand_code}`,
    inngest_run_id: `live-smoke-${Date.now()}`,
    stage: "generate_body",
    body_version: "2026-05-04.v2",
    emotion_trigger_match: false,
  };

  const { raw } = await invokeOrqAgent(
    "debtor-copy-document-body-agent",
    inputs,
    { jsonSchemaName: "debtor_copy_document_body_result" },
  );
  const parsed = bodyAgentOutputSchema.parse(raw);

  expect(parsed.body_version).toBe("2026-05-04.v2");
  expect(parsed.body_html).toContain(fixture.expected_signoff);
  for (const phrase of fixture.expected_body_contains ?? []) {
    expect(parsed.body_html).toContain(phrase);
  }
  return parsed;
}

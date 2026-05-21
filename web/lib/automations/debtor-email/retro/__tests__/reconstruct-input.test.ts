/**
 * Phase 87 Plan 02 Task 2 — RED → GREEN for `reconstructInput`.
 *
 * Helper reads a persisted email row + label + conversation_context and
 * returns the InvokeIntentInput the live Stage 3 would have built. The
 * `assembled_input` field is byte-identical to a direct `assembleInput()`
 * call with the same inputs — that's the comparison-validity invariant.
 */
import { describe, it, expect } from "vitest";
import {
  SAMPLE_EMAILS,
  SAMPLE_LABELS,
  SAMPLE_CONVERSATION_CONTEXT,
  buildMockAdmin,
} from "./fixtures/sample-emails";
import { reconstructInput } from "../reconstruct-input";
import { assembleInput } from "../../coordinator/assemble-input";
import { TENANT_DOMAINS_BY_SWARM } from "../../coordinator/tenant-domains.generated";

const RETRO_RUN_ID = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";
const EMAIL_ID = SAMPLE_EMAILS[0].id;

function adminFor(opts?: {
  emails?: typeof SAMPLE_EMAILS;
  labels?: typeof SAMPLE_LABELS;
  ctx?: typeof SAMPLE_CONVERSATION_CONTEXT;
}) {
  return buildMockAdmin({
    emails: opts?.emails ?? SAMPLE_EMAILS,
    email_labels: opts?.labels ?? SAMPLE_LABELS,
    conversation_context: opts?.ctx ?? SAMPLE_CONVERSATION_CONTEXT,
  });
}

describe("Phase 87 reconstructInput", () => {
  it("assembled_input is byte-identical to live assembleInput() for the same fixture", async () => {
    const admin = adminFor();
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      EMAIL_ID,
      RETRO_RUN_ID,
    );

    const expected = assembleInput({
      subject: SAMPLE_EMAILS[0].subject,
      bodyFull: SAMPLE_EMAILS[0].body_full_text!,
      priors: SAMPLE_CONVERSATION_CONTEXT.filter(
        (r) => r.email_id === EMAIL_ID,
      )
        .sort((a, b) => a.position - b.position)
        .map((r) => ({
          position: r.position,
          senderEmail: r.sender_email,
          subject: r.subject,
          receivedAt: r.received_at,
          bodyText: r.body_text,
        })),
      tenantDomains: [...TENANT_DOMAINS_BY_SWARM["debtor-email"]],
      capChars: 8000,
    });

    expect(out.assembled_input).toBe(expected.text);
  });

  it("passes scalar fields through verbatim", async () => {
    const admin = adminFor();
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      EMAIL_ID,
      RETRO_RUN_ID,
    );

    expect(out.email_id).toBe(EMAIL_ID);
    expect(out.inngest_run_id).toBe(RETRO_RUN_ID);
    expect(out.subject).toBe(SAMPLE_EMAILS[0].subject);
    expect(out.sender_email).toBe(SAMPLE_EMAILS[0].sender_email);
    expect(out.mailbox).toBe(SAMPLE_EMAILS[0].mailbox);
    expect(out.received_at).toBe(SAMPLE_EMAILS[0].received_at);
  });

  it("derives sender_domain from sender_email", async () => {
    const admin = adminFor();
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      EMAIL_ID,
      RETRO_RUN_ID,
    );
    expect(out.sender_domain).toBe("example.nl");
  });

  it("entity defaults from mailbox map (debiteuren@smeba-fire.be → smeba-fire)", async () => {
    const admin = adminFor();
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      SAMPLE_EMAILS[2].id, // mailbox: debiteuren@smeba-fire.be
      RETRO_RUN_ID,
    );
    expect(out.entity).toBe("smeba-fire");
  });

  it("entity falls back to 'smeba' for unknown mailbox", async () => {
    const admin = buildMockAdmin({
      emails: [
        {
          ...SAMPLE_EMAILS[0],
          id: "99999999-9999-9999-9999-999999999999",
          mailbox: "unknown-mailbox@nowhere.example",
        },
      ],
      email_labels: [],
      conversation_context: [],
    });
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      "99999999-9999-9999-9999-999999999999",
      RETRO_RUN_ID,
    );
    expect(out.entity).toBe("smeba");
  });

  it("prefers body_full_text over body_text", async () => {
    const admin = adminFor();
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      EMAIL_ID,
      RETRO_RUN_ID,
    );
    expect(out.body_text).toBe(SAMPLE_EMAILS[0].body_full_text);
    // Sanity: body_full_text differs from body_text in the fixture.
    expect(SAMPLE_EMAILS[0].body_full_text).not.toBe(SAMPLE_EMAILS[0].body_text);
  });

  it("falls back to body_text when body_full_text is null", async () => {
    const admin = buildMockAdmin({
      emails: [
        { ...SAMPLE_EMAILS[1], body_full_text: null },
      ],
      email_labels: [],
      conversation_context: [],
    });
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      SAMPLE_EMAILS[1].id,
      RETRO_RUN_ID,
    );
    expect(out.body_text).toBe(SAMPLE_EMAILS[1].body_text);
  });

  it("orders priors by position ASC into assembled_input", async () => {
    const admin = adminFor();
    const out = await reconstructInput(
      admin as unknown as Parameters<typeof reconstructInput>[0],
      EMAIL_ID,
      RETRO_RUN_ID,
    );
    const pos1Idx = out.assembled_input.indexOf('position="1"');
    const pos2Idx = out.assembled_input.indexOf('position="2"');
    expect(pos1Idx).toBeGreaterThan(-1);
    expect(pos2Idx).toBeGreaterThan(-1);
    expect(pos1Idx).toBeLessThan(pos2Idx);
  });
});

// Plan 01-02 Task 1 — types.ts behavior tests.
// Validates that USER_CHOSEN_TYPES mirrors the SQL CHECK enum from
// 20260526a_support_tickets_phase1.sql, and that ingestBodySchema enforces the
// Phase 1 ingest contract (strict — unknown fields rejected).

import { describe, it, expect } from "vitest";
import {
  USER_CHOSEN_TYPES,
  ingestBodySchema,
} from "../types";

describe("USER_CHOSEN_TYPES (mirror of SQL CHECK on support_tickets.user_chosen_type)", () => {
  it("contains exactly the five values from the migration in alphabetical order", () => {
    expect(USER_CHOSEN_TYPES).toEqual([
      "bug",
      "feature-request",
      "info-request",
      "other",
      "question",
    ]);
    expect(USER_CHOSEN_TYPES.length).toBe(5);
  });
});

describe("ingestBodySchema", () => {
  it("accepts a minimal valid body", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "bug",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects body missing submitter_id", () => {
    const parsed = ingestBodySchema.safeParse({ user_chosen_type: "bug" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["submitter_id"]);
    }
  });

  it("rejects user_chosen_type='nonsense'", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "nonsense",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["user_chosen_type"]);
    }
  });

  it("rejects unknown top-level fields (strict mode — prevents privilege injection)", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "bug",
      submission_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts optional video_size_bytes and video_storage_url", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "bug",
      video_storage_url: "https://supabase.example/storage/v1/object/x.mp4",
      video_size_bytes: 12345,
      device_fingerprint: "fp-abc",
    });
    expect(parsed.success).toBe(true);
  });
});

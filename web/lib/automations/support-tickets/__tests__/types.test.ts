// Plan 01-02 Task 1 — types.ts behavior tests.
// Validates that USER_CHOSEN_TYPES mirrors the SQL CHECK enum from
// 20260526a_support_tickets_phase1.sql, and that ingestBodySchema enforces the
// Phase 1 ingest contract (strict — unknown fields rejected).
//
// Plan 02-01 Task 1 additions — CONTRACT-01 + CONTRACT-02 contract tweaks:
//   - external_task_id is now optional (CONTRACT-02)
//   - systeem field added as optional (CONTRACT-01)
//   - .strict() still rejects unknown fields
//   - external_task_id still enforces .min(1) when present

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
      external_task_id: "CU-TEST-001",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects body missing submitter_id", () => {
    const parsed = ingestBodySchema.safeParse({
      user_chosen_type: "bug",
      external_task_id: "CU-TEST-001",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["submitter_id"]);
    }
  });

  // CONTRACT-02 (Phase 2): external_task_id is now optional — body without it is valid.
  // (Phase 1 had this as required; CONTRACT-02 / D-03 changed it to optional.)
  it("accepts body missing external_task_id (CONTRACT-02: optional since Phase 2)", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "bug",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty external_task_id", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "bug",
      external_task_id: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["external_task_id"]);
    }
  });

  it("rejects user_chosen_type='nonsense'", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "nonsense",
      external_task_id: "CU-TEST-001",
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
      external_task_id: "CU-TEST-001",
      submission_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts optional video_size_bytes and video_storage_url", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "u1",
      user_chosen_type: "bug",
      external_task_id: "CU-TEST-001",
      video_storage_url: "https://supabase.example/storage/v1/object/x.mp4",
      video_size_bytes: 12345,
      device_fingerprint: "fp-abc",
    });
    expect(parsed.success).toBe(true);
  });

  // Plan 02-01 Task 1 — CONTRACT-02: external_task_id is now optional
  it("CONTRACT-02: accepts body WITHOUT external_task_id (app-origin submission)", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "user@moyneroberts.com",
      user_chosen_type: "bug",
    });
    expect(parsed.success).toBe(true);
  });

  // Plan 02-01 Task 1 — CONTRACT-01: optional systeem field
  it("CONTRACT-01: accepts body WITH systeem field and parsed result contains systeem", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "user@moyneroberts.com",
      user_chosen_type: "bug",
      systeem: "some-key",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.systeem).toBe("some-key");
    }
  });

  // Plan 02-01 Task 1 — .strict() still rejects unknown fields
  it(".strict() still rejects unknown field (evil field injected)", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "user@moyneroberts.com",
      user_chosen_type: "bug",
      evil: "x",
    });
    expect(parsed.success).toBe(false);
  });

  // Plan 02-01 Task 1 — external_task_id .min(1) floor preserved when present
  it("CONTRACT-02: rejects external_task_id='' (empty string) — .min(1) preserved when field IS present", () => {
    const parsed = ingestBodySchema.safeParse({
      submitter_id: "user@moyneroberts.com",
      user_chosen_type: "bug",
      external_task_id: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(["external_task_id"]);
    }
  });
});

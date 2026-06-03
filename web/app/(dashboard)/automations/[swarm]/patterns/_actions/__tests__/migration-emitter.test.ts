// Phase 4 Plan 03 Task 1 — migration-emitter pure-function tests.
//
// Threat T-04-03-09: SQL injection via subject_pattern / sender_email /
// customer_account_id. Defense = PostgreSQL dollar-quoting + strict regex
// validation for identifier-shaped fields (candidate_id, swarm_type,
// timestamp, customer_account_id).

import { describe, it, expect } from "vitest";
import {
  emitFilterRuleMigration,
  emitKnownSenderMigration,
  MIGRATION_DIR,
} from "../migration-emitter";

const CANDIDATE_ID = "abcdef12-3456-7890-abcd-ef1234567890";
const SWARM = "debtor-email";
const TS = "202605250930";

describe("emitFilterRuleMigration", () => {
  it("returns file_path under MIGRATION_DIR with promotion_<shortid>_filter_rule.sql shape", () => {
    const { file_path } = emitFilterRuleMigration({
      candidate_id: CANDIDATE_ID,
      swarm_type: SWARM,
      subject_pattern: "invoice copy",
      sender_filter: null,
      timestamp_utc: TS,
    });
    expect(file_path).toBe(
      `${MIGRATION_DIR}/${TS}_promotion_abcdef12_filter_rule.sql`,
    );
  });

  it("emits BEGIN/COMMIT wrapped INSERT INTO public.classifier_rules", () => {
    const { file_content } = emitFilterRuleMigration({
      candidate_id: CANDIDATE_ID,
      swarm_type: SWARM,
      subject_pattern: "invoice copy",
      timestamp_utc: TS,
    });
    expect(file_content).toMatch(/^BEGIN;/);
    expect(file_content).toMatch(/COMMIT;\s*$/);
    expect(file_content).toMatch(/INSERT INTO public\.classifier_rules/);
    expect(file_content).toMatch(/promo_abcdef12/);
  });

  it("uses dollar-quoting (NOT single-quote string concat) for operator-controlled values", () => {
    const malicious = "'; DROP TABLE users; --";
    const { file_content } = emitFilterRuleMigration({
      candidate_id: CANDIDATE_ID,
      swarm_type: SWARM,
      subject_pattern: malicious,
      timestamp_utc: TS,
    });
    // Verify dollar-tag wraps the value, not bare single quotes.
    expect(file_content).toContain(`$promo_payload$${malicious}$promo_payload$`);
    // The single-quote run from the payload must not break out of a SQL string
    // — there is no occurrence of `'${malicious}'` style.
    expect(file_content).not.toContain(`'${malicious}'`);
  });

  it("rejects invalid candidate_id / swarm_type / timestamp identifiers", () => {
    expect(() =>
      emitFilterRuleMigration({
        candidate_id: "../etc/passwd",
        swarm_type: SWARM,
        subject_pattern: "x",
        timestamp_utc: TS,
      }),
    ).toThrow(/candidate_id/);
    expect(() =>
      emitFilterRuleMigration({
        candidate_id: CANDIDATE_ID,
        swarm_type: "DROP TABLE",
        subject_pattern: "x",
        timestamp_utc: TS,
      }),
    ).toThrow(/swarm_type/);
    expect(() =>
      emitFilterRuleMigration({
        candidate_id: CANDIDATE_ID,
        swarm_type: SWARM,
        subject_pattern: "x",
        timestamp_utc: "bad",
      }),
    ).toThrow(/timestamp/);
  });

  it("emits ARRAY[...] dollar-quoted entries when sender_filter is provided", () => {
    const { file_content } = emitFilterRuleMigration({
      candidate_id: CANDIDATE_ID,
      swarm_type: SWARM,
      subject_pattern: "x",
      sender_filter: ["a@x.com", "b@y.com"],
      timestamp_utc: TS,
    });
    expect(file_content).toMatch(/ARRAY\[/);
    expect(file_content).toContain(`$promo_payload$a@x.com$promo_payload$`);
    expect(file_content).toContain(`$promo_payload$b@y.com$promo_payload$`);
  });
});

describe("emitKnownSenderMigration", () => {
  it("returns file_path with _known_sender.sql suffix", () => {
    const { file_path } = emitKnownSenderMigration({
      candidate_id: CANDIDATE_ID,
      swarm_type: SWARM,
      sender_pattern: "ap@vendor.com",
      customer_account_id: "1234",
      operator_id: "11111111-1111-1111-1111-111111111111",
      timestamp_utc: TS,
    });
    expect(file_path).toBe(
      `${MIGRATION_DIR}/${TS}_promotion_abcdef12_known_sender.sql`,
    );
  });

  it("emits INSERT INTO debtor.sender_customer_map with ON CONFLICT (sender_email) DO UPDATE", () => {
    const { file_content } = emitKnownSenderMigration({
      candidate_id: CANDIDATE_ID,
      swarm_type: SWARM,
      sender_pattern: "ap@vendor.com",
      customer_account_id: "1234",
      operator_id: "11111111-1111-1111-1111-111111111111",
      timestamp_utc: TS,
    });
    expect(file_content).toMatch(/INSERT INTO debtor\.sender_customer_map/);
    expect(file_content).toMatch(/ON CONFLICT \(sender_email\) DO UPDATE/);
    expect(file_content).toMatch(/source = 'promotion_recommender'/);
  });

  it("dollar-quotes the sender_pattern (defense vs injection)", () => {
    const malicious = "x'; DROP--";
    const { file_content } = emitKnownSenderMigration({
      candidate_id: CANDIDATE_ID,
      swarm_type: SWARM,
      sender_pattern: malicious,
      customer_account_id: "1234",
      operator_id: "11111111-1111-1111-1111-111111111111",
      timestamp_utc: TS,
    });
    expect(file_content).toContain(`$promo_payload$${malicious}$promo_payload$`);
  });

  it("throws on non-numeric customer_account_id", () => {
    expect(() =>
      emitKnownSenderMigration({
        candidate_id: CANDIDATE_ID,
        swarm_type: SWARM,
        sender_pattern: "ap@vendor.com",
        customer_account_id: "1234; DROP--",
        operator_id: "11111111-1111-1111-1111-111111111111",
        timestamp_utc: TS,
      }),
    ).toThrow(/customer_account_id/);
  });

  it("throws on non-UUID operator_id", () => {
    expect(() =>
      emitKnownSenderMigration({
        candidate_id: CANDIDATE_ID,
        swarm_type: SWARM,
        sender_pattern: "ap@vendor.com",
        customer_account_id: "1234",
        operator_id: "not-a-uuid",
        timestamp_utc: TS,
      }),
    ).toThrow(/operator_id/);
  });
});

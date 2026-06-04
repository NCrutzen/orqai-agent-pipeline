/**
 * Phase 111 Plan 03 Task 2 — RED → GREEN for the sales-email Stage-1 retro
 * candidate selector.
 *
 * `selectCandidates` reads email_pipeline.emails across BOTH Smeba corpora —
 * live Outlook (source='outlook' mailbox='verkoop@smeba.nl') AND historic
 * (source='sugarcrm', filtered on source ALONE — its mailbox is a SugarCRM
 * bean label, Pitfall 5) — normalizes direction across the two source
 * vocabularies (Pitfall 4: {inbound,incoming}→inbound, {sent,outbound}→outbound),
 * and fails loud over a hard cap.
 *
 * Pure (no Date.now / no random) — safe under Inngest replay.
 */
import { describe, it, expect, vi } from "vitest";
import {
  selectCandidates,
  normalizeDirection,
  STAGE_1_RETRO_HARD_CAP,
  SALES_OUTLOOK_MAILBOX,
  type SelectCandidatesArgs,
} from "../select-candidates";

type EmailRow = {
  id: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  sender_email: string | null;
  source: string;
  mailbox: string | null;
  direction: string | null;
  received_at: string | null;
};

const ARGS: SelectCandidatesArgs = {
  swarm_type: "sales-email",
  since: "2026-01-01T00:00:00Z",
  until: "2026-12-31T00:00:00Z",
};

/**
 * Two-corpus chainable mock. Each `.schema("email_pipeline").from("emails")`
 * call records its `.eq` filters and resolves only the rows matching them —
 * so a query that filters source='outlook'+mailbox returns only Outlook rows,
 * and a source='sugarcrm'-only query returns the full sugarcrm set regardless
 * of mailbox.
 */
function buildMockAdmin(rows: EmailRow[]) {
  const eqCalls: Array<{ col: string; val: unknown }> = [];

  function builder() {
    const filters: Array<{ col: keyof EmailRow; val: unknown }> = [];
    let cap = Infinity;
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn((col: keyof EmailRow, val: unknown) => {
      eqCalls.push({ col: col as string, val });
      filters.push({ col, val });
      return b;
    });
    b.gte = vi.fn(() => b);
    b.lt = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.limit = vi.fn((n: number) => {
      cap = n;
      return b;
    });
    b.then = (resolve: (v: { data: EmailRow[]; error: null }) => unknown) => {
      let out = rows.filter((r) =>
        filters.every((f) => r[f.col] === f.val),
      );
      out = out.slice(0, cap);
      return resolve({ data: out, error: null });
    };
    return b;
  }

  const from = vi.fn(() => builder());
  const schema = vi.fn(() => ({ from }));
  return { schema, from, _eqCalls: eqCalls };
}

const OUTLOOK_INCOMING: EmailRow = {
  id: "11111111-1111-1111-1111-111111111111",
  subject: "Offerte aanvraag",
  body_text: "Graag een offerte",
  body_html: null,
  sender_email: "lead@klant.nl",
  source: "outlook",
  mailbox: SALES_OUTLOOK_MAILBOX,
  direction: "incoming",
  received_at: "2026-03-01T08:00:00Z",
};
const OUTLOOK_SENT: EmailRow = {
  id: "22222222-2222-2222-2222-222222222222",
  subject: "RE: Offerte",
  body_text: "Hierbij de offerte",
  body_html: null,
  sender_email: "verkoop@smeba.nl",
  source: "outlook",
  mailbox: SALES_OUTLOOK_MAILBOX,
  direction: "sent",
  received_at: "2026-03-02T09:00:00Z",
};
const SUGAR_INBOUND: EmailRow = {
  id: "33333333-3333-3333-3333-333333333333",
  subject: "Vraag",
  body_text: "Hebben jullie dit op voorraad?",
  body_html: null,
  sender_email: "oud@klant.be",
  source: "sugarcrm",
  mailbox: "Smeba Brandbeveiliging BV", // bean label, NOT an email address
  direction: "inbound",
  received_at: "2025-06-01T10:00:00Z",
};
const SUGAR_OUTBOUND: EmailRow = {
  id: "44444444-4444-4444-4444-444444444444",
  subject: "Antwoord",
  body_text: "Ja, op voorraad",
  body_html: null,
  sender_email: "verkoop@smeba.nl",
  source: "sugarcrm",
  mailbox: "INFO@Smeba New Cases, Smeba Brandbeveiliging BV",
  direction: "outbound",
  received_at: "2025-06-02T11:00:00Z",
};

describe("Phase 111 sales-email selectCandidates", () => {
  it("normalizeDirection maps both source vocabularies", () => {
    expect(normalizeDirection("inbound")).toBe("inbound");
    expect(normalizeDirection("incoming")).toBe("inbound");
    expect(normalizeDirection("sent")).toBe("outbound");
    expect(normalizeDirection("outbound")).toBe("outbound");
  });

  it("spans BOTH corpora — outlook (verkoop@smeba.nl) AND sugarcrm", async () => {
    const admin = buildMockAdmin([
      OUTLOOK_INCOMING,
      OUTLOOK_SENT,
      SUGAR_INBOUND,
      SUGAR_OUTBOUND,
    ]);
    const out = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      ARGS,
    );
    const ids = out.map((r) => r.email_id).sort();
    expect(ids).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
      "44444444-4444-4444-4444-444444444444",
    ]);
    const sources = new Set(out.map((r) => r.source));
    expect(sources).toEqual(new Set(["outlook", "sugarcrm"]));
  });

  it("normalizes direction across both source vocabularies on the returned rows", async () => {
    const admin = buildMockAdmin([
      OUTLOOK_INCOMING,
      OUTLOOK_SENT,
      SUGAR_INBOUND,
      SUGAR_OUTBOUND,
    ]);
    const out = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      ARGS,
    );
    const byId = new Map(out.map((r) => [r.email_id, r.normalized_direction]));
    expect(byId.get("11111111-1111-1111-1111-111111111111")).toBe("inbound"); // incoming
    expect(byId.get("22222222-2222-2222-2222-222222222222")).toBe("outbound"); // sent
    expect(byId.get("33333333-3333-3333-3333-333333333333")).toBe("inbound"); // inbound
    expect(byId.get("44444444-4444-4444-4444-444444444444")).toBe("outbound"); // outbound
  });

  it("filters sugarcrm on source ALONE (no mailbox filter — Pitfall 5)", async () => {
    const admin = buildMockAdmin([SUGAR_INBOUND, SUGAR_OUTBOUND]);
    const out = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      ARGS,
    );
    // Both bean-labelled sugarcrm rows come through despite non-email mailbox.
    expect(out.map((r) => r.email_id).sort()).toEqual([
      "33333333-3333-3333-3333-333333333333",
      "44444444-4444-4444-4444-444444444444",
    ]);
    // No eq on "mailbox" was ever combined with a sugarcrm source eq:
    const mailboxEqs = admin._eqCalls.filter((c) => c.col === "mailbox");
    for (const m of mailboxEqs) {
      expect(m.val).toBe(SALES_OUTLOOK_MAILBOX); // mailbox is only ever pinned to the outlook box
    }
  });

  it("throws fail-loud when a single corpus truncates at readCap (WR-05)", async () => {
    // readCap = cap+1 = STAGE_1_RETRO_HARD_CAP+1 sugarcrm rows. A single
    // corpus returning >= readCap is indistinguishable from a truncated read,
    // so we fail loud naming the corpus (per WR-05) rather than the merged cap.
    const many: EmailRow[] = Array.from(
      { length: STAGE_1_RETRO_HARD_CAP + 1 },
      (_, i) => ({
        ...SUGAR_INBOUND,
        id: `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`,
      }),
    );
    const admin = buildMockAdmin(many);
    await expect(
      selectCandidates(
        admin as unknown as Parameters<typeof selectCandidates>[0],
        ARGS,
      ),
    ).rejects.toThrow(/SUGARCRM corpus truncated/i);
  });

  it("throws cap-exceeded on the merged total when neither corpus truncates (WR-05)", async () => {
    // cap = 6 → readCap = 7. Each corpus returns 4 rows (< readCap, so no
    // per-corpus truncation throw), but merged = 8 > cap → merged cap-exceeded.
    const mk = (base: EmailRow, n: number): EmailRow[] =>
      Array.from({ length: n }, (_, i) => ({
        ...base,
        id: `${base.source}-${String(i).padStart(4, "0")}-0000-0000-000000000000`,
      }));
    const admin = buildMockAdmin([
      ...mk(OUTLOOK_INCOMING, 4),
      ...mk(SUGAR_INBOUND, 4),
    ]);
    await expect(
      selectCandidates(
        admin as unknown as Parameters<typeof selectCandidates>[0],
        { ...ARGS, cap: 6 },
      ),
    ).rejects.toThrow(/cap exceeded/i);
  });

  it("dedups by email_id across the two corpora (WR-05)", async () => {
    // Same email_id present as both an outlook and a sugarcrm row — must
    // appear exactly once in the result (first occurrence = outlook wins).
    const DUP_ID = "99999999-9999-9999-9999-999999999999";
    const dupOutlook: EmailRow = { ...OUTLOOK_INCOMING, id: DUP_ID };
    const dupSugar: EmailRow = { ...SUGAR_INBOUND, id: DUP_ID };
    const admin = buildMockAdmin([dupOutlook, dupSugar, SUGAR_OUTBOUND]);
    const out = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      ARGS,
    );
    const ids = out.map((r) => r.email_id);
    expect(ids.filter((id) => id === DUP_ID)).toHaveLength(1);
    // Outlook occurrence wins (source='outlook').
    expect(out.find((r) => r.email_id === DUP_ID)?.source).toBe("outlook");
  });

  it("is pure — selecting twice yields identical results (no Date.now/random)", async () => {
    const admin = buildMockAdmin([OUTLOOK_INCOMING, SUGAR_INBOUND]);
    const a = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      ARGS,
    );
    const b = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      ARGS,
    );
    expect(a).toEqual(b);
  });
});

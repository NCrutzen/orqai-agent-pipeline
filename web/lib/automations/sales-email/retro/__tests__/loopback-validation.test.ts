/**
 * Phase 111 Plan 04 Task 2 — RED → GREEN for the D-09 loopback false-archive
 * measurement.
 *
 * `evaluateLoopback` measures `own_outbound_invoice_loopback`'s predicted
 * false-archive rate over NORMALIZED-INBOUND mail only (mirroring the live
 * worker's `effectiveDirection === 'inbound'` check), and returns a
 * data-driven enable/disable recommendation against a documented threshold —
 * NOT a preset (D-09; the ~40% debtor mis-archive is the cautionary precedent).
 *
 * Outbound/sent mail is excluded from the denominator (loopback only applies to
 * inbound, Pitfall 4). Pure — no Date.now / no random.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateLoopback,
  LOOPBACK_FALSE_ARCHIVE_MAX,
  LOOPBACK_RULE_KEY,
  type LoopbackVerdict,
} from "../loopback-validation";

function v(p: Partial<LoopbackVerdict>): LoopbackVerdict {
  return {
    predicted_category_key: LOOPBACK_RULE_KEY,
    normalized_direction: "inbound",
    would_archive: true,
    false_archive_suspect: false,
    ...p,
  };
}

describe("evaluateLoopback (D-09)", () => {
  it("recommends 'disable' when the inbound false-archive rate exceeds the threshold", () => {
    // 10 inbound loopback would-archive rows; 5 are false-archive suspects (50%
    // > threshold) — the debtor ~40% over-fire precedent reproduced.
    const verdicts: LoopbackVerdict[] = [
      ...Array.from({ length: 5 }, () => v({ false_archive_suspect: true })),
      ...Array.from({ length: 5 }, () => v({ false_archive_suspect: false })),
    ];
    const res = evaluateLoopback(verdicts);
    expect(res.n).toBe(10);
    expect(res.falseArchiveRate).toBeCloseTo(0.5, 5);
    expect(res.falseArchiveRate).toBeGreaterThan(LOOPBACK_FALSE_ARCHIVE_MAX);
    expect(res.recommendation).toBe("disable");
  });

  it("recommends 'enable' on a clean inbound fixture (rate at/under threshold)", () => {
    // 20 clean inbound loopback rows, 0 false-archive → rate 0 ≤ threshold.
    const verdicts: LoopbackVerdict[] = Array.from({ length: 20 }, () =>
      v({ false_archive_suspect: false }),
    );
    const res = evaluateLoopback(verdicts);
    expect(res.n).toBe(20);
    expect(res.falseArchiveRate).toBe(0);
    expect(res.recommendation).toBe("enable");
  });

  it("excludes outbound rows from the denominator (Pitfall 4 — loopback is inbound-only)", () => {
    // 3 inbound would-archive (0 false) + 5 OUTBOUND would-archive false-archive
    // suspects. The outbound rows must NOT count: n=3, rate=0 → 'enable'.
    const verdicts: LoopbackVerdict[] = [
      ...Array.from({ length: 3 }, () =>
        v({ normalized_direction: "inbound", false_archive_suspect: false }),
      ),
      ...Array.from({ length: 5 }, () =>
        v({ normalized_direction: "outbound", false_archive_suspect: true }),
      ),
    ];
    const res = evaluateLoopback(verdicts);
    expect(res.n).toBe(3);
    expect(res.falseArchiveRate).toBe(0);
    expect(res.recommendation).toBe("enable");
  });

  it("only counts the loopback rule's would-archive rows (ignores other categories)", () => {
    const verdicts: LoopbackVerdict[] = [
      ...Array.from({ length: 4 }, () => v({ false_archive_suspect: true })), // loopback, inbound, would-archive
      // noise from other categories must not affect the loopback measurement:
      v({ predicted_category_key: "auto_reply", false_archive_suspect: true }),
      v({ predicted_category_key: "unknown", false_archive_suspect: true }),
      // a loopback row that would NOT archive (not a noise verdict) is out of denom:
      v({ would_archive: false, false_archive_suspect: true }),
    ];
    const res = evaluateLoopback(verdicts);
    expect(res.n).toBe(4);
    expect(res.falseArchiveRate).toBe(1);
    expect(res.recommendation).toBe("disable");
  });

  it("recommends 'disable' on an empty/zero-signal inbound set (fail-safe; no data to justify enable)", () => {
    const res = evaluateLoopback([]);
    expect(res.n).toBe(0);
    expect(res.falseArchiveRate).toBe(0);
    // No measured evidence → do not auto-enable a rule that mis-archived ~40% on
    // debtor. Fail-closed to 'disable' (D-09: enable only from measured data).
    expect(res.recommendation).toBe("disable");
  });

  it("is pure — repeated calls on the same input return identical results", () => {
    const verdicts: LoopbackVerdict[] = Array.from({ length: 6 }, () =>
      v({ false_archive_suspect: true }),
    );
    const a = evaluateLoopback(verdicts);
    const b = evaluateLoopback(verdicts);
    expect(a).toEqual(b);
  });
});

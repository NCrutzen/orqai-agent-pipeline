// Pins resolveSurvivors: returns the subset of email_ids that have a
// debtor.email_labels row (= Stage-1 survivors), chunks the read under the
// PostgREST header cap, and is empty-safe.

import { describe, it, expect, vi } from "vitest";
import { resolveSurvivors } from "../resolve-survivors";

type LabelRow = { email_id: string };

/** Minimal admin stub: schema().from().select().in() resolving to label rows. */
function makeAdmin(labelRows: LabelRow[], spy?: (ids: string[]) => void) {
  return {
    schema: () => ({
      from: () => ({
        select: () => ({
          in: (_col: string, ids: string[]) => {
            spy?.(ids);
            const data = labelRows.filter((r) => ids.includes(r.email_id));
            return Promise.resolve({ data, error: null });
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof resolveSurvivors>[0];
}

describe("resolveSurvivors", () => {
  it("returns only ids with a label row", async () => {
    const admin = makeAdmin([{ email_id: "a" }, { email_id: "c" }]);
    const out = await resolveSurvivors(admin, ["a", "b", "c"]);
    expect(out.has("a")).toBe(true);
    expect(out.has("b")).toBe(false);
    expect(out.has("c")).toBe(true);
    expect(out.size).toBe(2);
  });

  it("is empty-safe (no ids → no query, empty set)", async () => {
    const spy = vi.fn();
    const admin = makeAdmin([], spy);
    const out = await resolveSurvivors(admin, []);
    expect(out.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("chunks the read at 150 ids per request", async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `id-${i}`);
    const chunkSizes: number[] = [];
    const admin = makeAdmin(
      ids.map((email_id) => ({ email_id })),
      (chunk) => chunkSizes.push(chunk.length),
    );
    const out = await resolveSurvivors(admin, ids);
    expect(chunkSizes).toEqual([150, 150, 20]);
    expect(out.size).toBe(320);
  });

  it("throws when the DB read errors", async () => {
    const admin = {
      schema: () => ({
        from: () => ({
          select: () => ({
            in: () => Promise.resolve({ data: null, error: new Error("boom") }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof resolveSurvivors>[0];
    await expect(resolveSurvivors(admin, ["a"])).rejects.toThrow(/boom/);
  });
});

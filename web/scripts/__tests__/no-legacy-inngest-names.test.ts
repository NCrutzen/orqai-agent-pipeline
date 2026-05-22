/**
 * Phase 88.1 Plan 02 — RED grep guard.
 *
 * Asserts that the seven legacy function-id and event-name strings from
 * the pre-88.1 Inngest registry never appear under `web/` (modulo this
 * test file itself, which has to mention them as needles).
 *
 * Plus a defense-in-depth assertion (Phase 65 lesson): no destructured
 * `inngest.send` anywhere — destructuring loses the `this`-binding and
 * the first call throws TypeError at runtime.
 *
 * Implementation: in-process Node `fs.readdir({ recursive: true })`. We
 * avoid shelling out to ripgrep so the test runs portably across dev
 * machines and CI without relying on the host PATH.
 *
 * This test is RED today and stays RED through Wave 3. Wave 4 (Plan 06)
 * is the GREEN gate; the cutover plan depends on this test passing.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const LEGACY_STRINGS = [
  "classifier/label-resolver",
  "automations/debtor-email-icontroller-tagger",
  "automations/debtor-email-icontroller-shard-worker",
  "automations/debtor-email-icontroller-dispatch",
  "debtor-email/label-resolve.requested",
  "debtor-email/icontroller-tag.requested",
  "icontroller/cleanup.shard.requested",
] as const;

const DESTRUCTURE_RE = /const\s+send\s*=\s*inngest\.send/;

// Tests run from web/ root via vitest.
const WEB_ROOT = path.resolve(__dirname, "../..");
const SELF_ABS = __filename;

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "coverage",
  ".vercel",
]);

const INCLUDE_EXT = new Set([".ts", ".tsx", ".md"]);

function walk(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: ReturnType<typeof readdirSync>;
    try {
      // Cast through unknown: with { withFileTypes, encoding } Node's
      // overloads resolve to Dirent<string>[] at runtime but TS picks the
      // generic Buffer-flavoured overload. The cast keeps the test typed
      // without losing the runtime guarantee.
      entries = readdirSync(dir, {
        withFileTypes: true,
        encoding: "utf8",
      }) as unknown as ReturnType<typeof readdirSync>;
    } catch {
      continue;
    }
    for (const e of entries) {
      const entryName = String(e.name);
      const full = path.join(dir, entryName);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(entryName)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(entryName);
        if (!INCLUDE_EXT.has(ext)) continue;
        out.push(full);
      } else if (e.isSymbolicLink()) {
        try {
          const s = statSync(full);
          if (s.isFile() && INCLUDE_EXT.has(path.extname(entryName))) out.push(full);
        } catch {
          /* dangling — skip */
        }
      }
    }
  }
  return out;
}

type Hit = { file: string; lineNo: number; line: string };

function scanFiles(predicate: (line: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(WEB_ROOT)) {
    if (file === SELF_ABS) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (predicate(lines[i])) {
        hits.push({
          file: path.relative(WEB_ROOT, file),
          lineNo: i + 1,
          line: lines[i].trim().slice(0, 200),
        });
      }
    }
  }
  return hits;
}

describe("no legacy Inngest names", () => {
  it("web/ is free of pre-Phase-88.1 function ids and event names", () => {
    const offenders: Array<{ needle: string } & Hit> = [];
    for (const needle of LEGACY_STRINGS) {
      const hits = scanFiles((l) => l.includes(needle));
      for (const h of hits) offenders.push({ needle, ...h });
    }
    if (offenders.length > 0) {
      const summary = offenders
        .map(({ needle, file, lineNo, line }) => `  [${needle}] ${file}:${lineNo} — ${line}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} legacy Inngest name occurrence(s) under web/. ` +
          `These MUST be renamed per Phase 88.1:\n${summary}`,
      );
    }
    expect(offenders.length).toBe(0);
  });

  // Defense-in-depth (Phase 65 lesson — commits dae6276/dd2583a).
  it("no destructured inngest.send anywhere under web/", () => {
    const hits = scanFiles((l) => DESTRUCTURE_RE.test(l));
    if (hits.length > 0) {
      throw new Error(
        `Found destructured inngest.send (loses this-binding — see Phase 65 lesson):\n` +
          hits.map((h) => `  ${h.file}:${h.lineNo} — ${h.line}`).join("\n"),
      );
    }
    expect(hits.length).toBe(0);
  });
});

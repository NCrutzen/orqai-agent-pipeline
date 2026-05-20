/**
 * Probe: kan Browserless Prototyping tier meerdere tabs in één
 * BrowserContext parallel aan?
 *
 * Run:
 *   cd web && npx tsx lib/automations/debtor-email-cleanup/probe-multitab.ts
 */
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const TOKEN = process.env.BROWSERLESS_API_TOKEN;
if (!TOKEN) {
  console.error("BROWSERLESS_API_TOKEN missing in web/.env.local");
  process.exit(1);
}

const WS = `wss://production-ams.browserless.io?token=${TOKEN}&timeout=180000`;

async function runTabs(context: BrowserContext, n: number) {
  const results: Array<{ i: number; ms: number; title: string; ok: boolean; err?: string }> = [];
  const pages = await Promise.all(Array.from({ length: n }, () => context.newPage()));
  const t0 = Date.now();
  const navs = pages.map(async (page, i) => {
    const s = Date.now();
    try {
      await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30_000 });
      const title = await page.title();
      results.push({ i, ms: Date.now() - s, title, ok: true });
    } catch (err) {
      results.push({ i, ms: Date.now() - s, title: "", ok: false, err: String(err) });
    }
  });
  await Promise.all(navs);
  const wall = Date.now() - t0;
  for (const p of pages) await p.close().catch(() => {});
  return { wall, results };
}

async function main() {
  const counts = [3, 5];
  let browser: Browser | null = null;
  try {
    console.log(`[connect] ${WS.replace(TOKEN!, "<token>")}`);
    const tc = Date.now();
    browser = await chromium.connectOverCDP(WS, { timeout: 120_000 });
    console.log(`[connect] ok in ${Date.now() - tc}ms`);

    const context = browser.contexts()[0] ?? (await browser.newContext());
    console.log(`[context] using ${browser.contexts().length} existing context(s)`);

    for (const n of counts) {
      console.log(`\n--- probing ${n} tabs ---`);
      try {
        const { wall, results } = await runTabs(context, n);
        console.log(`[tabs=${n}] wall=${wall}ms`);
        for (const r of results.sort((a, b) => a.i - b.i)) {
          console.log(
            `  tab#${r.i} ok=${r.ok} ms=${r.ms} title="${r.title}"${r.err ? " err=" + r.err : ""}`,
          );
        }
        const allOk = results.every((r) => r.ok);
        console.log(`[tabs=${n}] ${allOk ? "PASS" : "FAIL"}  (browser still connected: ${browser.isConnected()})`);
        if (!allOk) break;
      } catch (err) {
        console.log(`[tabs=${n}] CRASH ${String(err)}`);
        break;
      }
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.log(`[close] ${String(e)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});

// One-shot smoke for the iController From-mailbox fix.
//
// Hits POST /api/automations/debtor/create-draft directly (skips the full
// invoice-copy handler chain — we only want to exercise the new
// `selectFromMailbox` step in drafter.ts against production iController).
//
// Effects on production:
//   - Creates ONE iController draft reply on messageId 1389715 (smeba),
//     From = debiteuren@smeba.nl. Operator deletes after smoke.
//   - Tiny placeholder PDF + body — content is irrelevant; we're verifying
//     the From dropdown gets selected and Save-as-draft no longer fails with
//     "save_failed: Selecteer een item in de lijst".
//
// Usage:
//   tsx web/scripts/from-mailbox-smoke.ts

import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({ path: "/tmp/phase-66-vercel-prod.env" });
loadDotenv({ path: path.resolve(__dirname, "..", ".env.local") });

const APP_URL = process.env.SMOKE_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
const SECRET = process.env.AUTOMATION_WEBHOOK_SECRET;

if (!APP_URL || !SECRET) {
  throw new Error("Missing NEXT_PUBLIC_APP_URL or AUTOMATION_WEBHOOK_SECRET");
}

const MESSAGE_ID = "1389715";
const FROM_MAILBOX = "debiteuren@smeba.nl";

// Minimal valid 1-page PDF ("hello") — base64 encoded.
const TINY_PDF_BASE64 =
  "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PC9MZW5ndGggNDQ+PnN0cmVhbQpCVAovRjEgMTggVGYK" +
  "MTAwIDcwMCBUZAooU21va2UgdGVzdCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoxIDAgb2JqCjw8" +
  "L1R5cGUvUGFnZS9NZWRpYUJveFswIDAgNTk1IDg0Ml0vUmVzb3VyY2VzPDwvRm9udDw8L0YxIDIg" +
  "MCBSPj4+Pi9Db250ZW50cyAzIDAgUi9QYXJlbnQgNCAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9U" +
  "eXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PgplbmRvYmoKNCAwIG9i" +
  "ago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1sxIDAgUl0+PgplbmRvYmoKNSAwIG9iago8PC9U" +
  "eXBlL0NhdGFsb2cvUGFnZXMgNCAwIFI+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUz" +
  "NSBmIAowMDAwMDAwMDk1IDAwMDAwIG4gCjAwMDAwMDAxOTQgMDAwMDAgbiAKMDAwMDAwMDAxNSAw" +
  "MDAwMCBuIAowMDAwMDAwMjU1IDAwMDAwIG4gCjAwMDAwMDAzMDIgMDAwMDAgbiAKdHJhaWxlcgo8" +
  "PC9TaXplIDYvUm9vdCA1IDAgUj4+CnN0YXJ0eHJlZgozNDcKJSVFT0YK";

async function main(): Promise<void> {
  const url = `${APP_URL}/api/automations/debtor/create-draft`;
  console.log(
    `[smoke] POST ${url}\n  messageId=${MESSAGE_ID}\n  fromMailbox=${FROM_MAILBOX}\n  env=production`,
  );

  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "reply",
      messageId: MESSAGE_ID,
      bodyHtml:
        "<p>From-mailbox smoke test &mdash; please delete this draft.</p>",
      pdfBase64: TINY_PDF_BASE64,
      filename: "smoke-test.pdf",
      env: "production",
      fromMailbox: FROM_MAILBOX,
    }),
  });
  const elapsedMs = Date.now() - t0;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`[smoke] status=${res.status} (${elapsedMs}ms)`);
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok || json.success === false) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`[smoke] FAILED: ${(e as Error).message}`);
  process.exit(1);
});

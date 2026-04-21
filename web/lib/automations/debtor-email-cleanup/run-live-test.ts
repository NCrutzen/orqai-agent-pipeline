/**
 * One-shot live test runner for the debtor-email-cleanup automation.
 *
 * Usage:
 *   ICONTROLLER_ENV=production npx tsx web/lib/automations/debtor-email-cleanup/run-live-test.ts preview
 *   ICONTROLLER_ENV=production npx tsx web/lib/automations/debtor-email-cleanup/run-live-test.ts delete
 *
 * `preview` = login + find + before-screenshot, no delete. Use this first.
 * `delete`  = full flow including delete. Only after visual confirmation.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../../.env.local") });

import { findAndPreviewEmail, deleteEmailFromIController, type EmailIdentifiers } from "./browser";

const EMAIL: EmailIdentifiers = {
  company: "smebabrandbeveiliging",
  from: "Detuinen Accounts",
  subject: "Automatic reply: Documenten n.a.v. uitgevoerde werkzaamheden",
  receivedAt: "2026-04-20T13:18:56",
};

async function main() {
  const mode = process.argv[2];
  if (mode !== "preview" && mode !== "delete") {
    console.error("Usage: run-live-test.ts <preview|delete>");
    process.exit(1);
  }

  const env = process.env.ICONTROLLER_ENV ?? "acceptance";
  console.log(`\n=== ENVIRONMENT: ${env.toUpperCase()} ===`);
  console.log(`Target: ${JSON.stringify(EMAIL, null, 2)}\n`);

  if (mode === "preview") {
    console.log("Running PREVIEW (no delete)...\n");
    const result = await findAndPreviewEmail(EMAIL);
    console.log("Result:", JSON.stringify(result, null, 2));
    if (result.emailFound) {
      console.log("\n✓ Email found. Row preview:");
      console.log(`  ${result.rowPreview}`);
      console.log(`\nScreenshot: ${result.screenshot?.url ?? result.screenshot?.path}`);
      console.log("\nInspect the screenshot, then re-run with `delete` to confirm.");
    }
    return;
  }

  console.log("Running DELETE...\n");
  const result = await deleteEmailFromIController(EMAIL);
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

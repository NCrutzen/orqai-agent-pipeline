// Phase 132 — BLOCKING live send-scope smoke (Task 1, checkpoint:human-verify).
//
// Proves the D-01 three-call forward draft flow works against an info@ TEST
// mailbox on Outlook connection 56014785, and — critically — that the tenant
// grants Mail.Send scope (the single unverified capability per RESEARCH A1 /
// Environment Availability). If any call 403s, the phase falls back to the
// single-shot `/forward` + sender-in-comment path (D-01 fallback) and the SPEC
// must be revised BEFORE Plan 02 ships the 3-call helper as primary.
//
// The three calls (all routed through the single graphFetch credential
// boundary — never a hand-rolled Graph client; CLAUDE.md "één credential-grens"):
//   1) POST /users/{infoMailbox}/messages/{messageId}/createForward
//        body { message: { toRecipients: [{ emailAddress: { address: TEST_TARGET } }] } }
//        → expect 201 draft { id, isDraft:true }
//        (Pitfall 1: pass ONLY message.toRecipients — never the top-level
//         toRecipients param, and never both `comment` and `message.body`.)
//   2) PATCH /users/{infoMailbox}/messages/{draftId}
//        body { replyTo: [{ emailAddress: { address: ORIGINAL_SENDER } }] }
//        → expect 200
//   3) POST /users/{infoMailbox}/messages/{draftId}/send
//        → expect 202
//
// Pitfall 3: the Graph message id lives in the info@ SOURCE mailbox's id space
// (emails.mailbox / emails.source_id), NOT the target box. Issue every call
// against {infoMailbox} = the info@ SOURCE box. `--confirm-test-mailbox <addr>`
// is the info@ SOURCE box; --target is only the toRecipients value.
//
// PRODUCTION-WRITE DISCIPLINE (CLAUDE.md §Test-First Pattern):
//   A forward is an irreversible production side-effect (no un-send). This
//   script is MANUAL-ONLY and arg-guarded: it refuses to run without an
//   explicit `--confirm-test-mailbox <addr>`. Operator MUST point it at a
//   DISPOSABLE TEST info@ mailbox + a disposable test message id — NEVER a
//   live customer mail. The threat register (T-132-01) gates this behind the
//   arg guard + the checkpoint:human-verify.
//
// Usage (run from the repo's web/ workspace so tsx resolves the web deps that
// graphFetch pulls in — @zapier/zapier-sdk etc.):
//   cd web && npx tsx ../scripts/smoke/info-routing-forward-scope.ts \
//     --confirm-test-mailbox info-test@smeba.nl \
//     --message <graph-immutable-message-id> \
//     --target  test-target@smeba.nl \
//     --original-sender customer@example.com \
//     [--comment "Phase 132 send-scope smoke"]
//
// Verify after running (operator):
//   1) All three calls return 201 / 200 / 202 (send scope present).
//   2) The TEST TARGET mailbox received the forwarded mail.
//   3) Reply to the forwarded mail from the target box → the reply addresses
//      the ORIGINAL sender (replyTo honored), NOT info@.
//   On ANY 403 / policy rejection: STOP, record the status+body, and resume
//   the checkpoint with the fallback decision.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Path alias `@/` is configured in web/tsconfig.json — outside that compile
// unit we use a relative path (mirrors scripts/phase-89-shadow-eval.ts).
import { graphFetch } from "../../web/lib/outlook/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

// Env loader (web/.env.local, no dotenv dep — minimal parser). The Zapier SDK
// auto-detects ZAPIER_CREDENTIALS_* from env / keychain; .env.local supplies
// the rest locally. Copied from scripts/phase-89-shadow-eval.ts.
function loadEnvLocal(): void {
  const envPath = resolve(REPO_ROOT, "web/.env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

const enc = encodeURIComponent;

interface SmokeArgs {
  infoMailbox: string;
  messageId: string;
  target: string;
  originalSender: string;
  comment?: string;
}

/** Parse `--flag value` pairs; fail loudly on the arg guard. */
function parseArgs(argv: string[]): SmokeArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const infoMailbox = get("--confirm-test-mailbox");
  const messageId = get("--message");
  const target = get("--target");
  const originalSender = get("--original-sender");
  const comment = get("--comment");

  if (!infoMailbox) {
    throw new Error(
      "ARG GUARD: refusing to run without --confirm-test-mailbox <addr>.\n" +
        "  This issues a LIVE, irreversible forward+send. Point it ONLY at a\n" +
        "  DISPOSABLE TEST info@ mailbox + a disposable test message id.\n" +
        "  Usage:\n" +
        "    cd web && npx tsx ../scripts/smoke/info-routing-forward-scope.ts \\\n" +
        "      --confirm-test-mailbox info-test@smeba.nl \\\n" +
        "      --message <graph-immutable-message-id> \\\n" +
        "      --target  test-target@smeba.nl \\\n" +
        "      --original-sender customer@example.com \\\n" +
        '      [--comment "Phase 132 send-scope smoke"]',
    );
  }
  if (!messageId) throw new Error("ARG GUARD: missing --message <graph-immutable-message-id>");
  if (!target) throw new Error("ARG GUARD: missing --target <test-target-mailbox>");
  if (!originalSender) throw new Error("ARG GUARD: missing --original-sender <customer-address>");

  return { infoMailbox, messageId, target, originalSender, comment };
}

/** Print HTTP status + body for a call; returns the parsed JSON (or null). */
async function logResponse(label: string, res: Response): Promise<unknown> {
  const text = await res.text();
  console.log(`\n[${label}] HTTP ${res.status} ${res.ok ? "OK" : "!!"}`);
  console.log(text || "(empty body)");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("PRODUCTION -- MS Graph (Outlook conn 56014785) -- Action: live forward+send send-scope smoke");
  console.log(`  info@ SOURCE mailbox (Pitfall 3): ${args.infoMailbox}`);
  console.log(`  message id:                       ${args.messageId}`);
  console.log(`  target (toRecipients only):       ${args.target}`);
  console.log(`  replyTo = original sender:        ${args.originalSender}`);
  if (args.comment) console.log(`  comment:                          ${args.comment}`);
  console.log(
    "\n>>> This will create a forward draft, set replyTo, and SEND it (irreversible).",
  );
  console.log(">>> Confirm the mailbox above is a DISPOSABLE TEST box before continuing.\n");

  // 1) createForward → expect 201 draft { id, isDraft:true }.
  //    Pitfall 1: ONLY message.toRecipients; never the top-level toRecipients
  //    param, and never both `comment` and `message.body`.
  const fwdRes = await graphFetch(
    `/users/${enc(args.infoMailbox)}/messages/${enc(args.messageId)}/createForward`,
    {
      method: "POST",
      body: {
        message: { toRecipients: [{ emailAddress: { address: args.target } }] },
        ...(args.comment ? { comment: args.comment } : {}),
      },
    },
  );
  const draft = (await logResponse("1/3 createForward", fwdRes)) as
    | { id?: string; isDraft?: boolean }
    | null;
  if (!fwdRes.ok || !draft?.id) {
    console.error(
      "\nFAIL: createForward did not return a 201 draft with an id.\n" +
        "If this is a 403, send/createForward scope is NOT granted on conn 56014785 →\n" +
        'resume the checkpoint with "fallback: single-shot /forward" + this status/body.',
    );
    process.exit(1);
  }
  console.log(`  → draft.id = ${draft.id} (isDraft=${String(draft.isDraft)})`);

  // 2) PATCH the draft to set replyTo = original customer sender → expect 200.
  const patchRes = await graphFetch(`/users/${enc(args.infoMailbox)}/messages/${enc(draft.id)}`, {
    method: "PATCH",
    body: { replyTo: [{ emailAddress: { address: args.originalSender } }] },
  });
  await logResponse("2/3 PATCH replyTo", patchRes);
  if (!patchRes.ok) {
    console.error(
      "\nFAIL: PATCH replyTo rejected. If this is a tenant mail-flow policy rejection,\n" +
        'resume the checkpoint with "fallback: single-shot /forward" + this status/body.\n' +
        "NOTE: the draft was created but NOT sent — delete it from the info@ box.",
    );
    process.exit(1);
  }

  // 3) Send the draft → expect 202.
  const sendRes = await graphFetch(`/users/${enc(args.infoMailbox)}/messages/${enc(draft.id)}/send`, {
    method: "POST",
  });
  await logResponse("3/3 send", sendRes);
  if (!sendRes.ok) {
    console.error(
      "\nFAIL: send rejected. If this is a 403, Mail.Send scope is NOT granted →\n" +
        'resume the checkpoint with "fallback: single-shot /forward" + this status/body.',
    );
    process.exit(1);
  }

  console.log("\nPASS: createForward=201, PATCH=200, send=202. Send scope confirmed.");
  console.log("Now verify by hand:");
  console.log(`  - The forwarded mail arrived in the TARGET box (${args.target}).`);
  console.log(
    `  - Replying to it from the target box addresses ${args.originalSender} (replyTo honored), NOT ${args.infoMailbox}.`,
  );
  console.log('If both hold, resume the checkpoint with "send-scope confirmed".');
}

main().catch((err) => {
  console.error("\nSMOKE ERROR:", err);
  process.exit(1);
});

---
created: 2026-04-23T09:30:00.000Z
title: Verify CREDENTIAL_ENCRYPTION_KEY integrity (Vercel prod env)
area: infra
files:
  - web/lib/credentials/crypto.ts
  - web/lib/credentials/proxy.ts
---

## Problem

On 2026-04-23, while building the debtor `createIcontrollerDraft` tool, the drafter failed at login with:

```
Error: Unsupported state or unable to authenticate data
```

This is Node's AES-GCM `decipher.final()` rejection — the auth tag doesn't verify. Three possible causes:

1. **`CREDENTIAL_ENCRYPTION_KEY` value has embedded quotes.** `vercel env pull` showed length 66 for the pulled `CREDENTIAL_ENCRYPTION_KEY=...` line — the value portion parses as 66 chars of non-hex. A 64-hex key wrapped in `"..."` would produce 66 chars. `Buffer.from(value, "hex")` silently ignores non-hex chars, yielding a different 32-byte buffer than expected. Symptom: existing encrypted credentials cannot be decrypted; new ones encrypted under the quoted-key can be decrypted by the same quoted-key. Not obvious in local dev.
2. **Key was rotated** without re-encrypting stored credentials. `credentials.key_version` is 1 for both iController rows, but `crypto.ts` doesn't consult version — it just uses whatever is in env. If someone changed the env value, all v1 records become undecryptable.
3. **Different env var got mangled** during today's frequent `vercel env add/rm/pull` cycles (`DEBTOR_FETCH_WEBHOOK_SECRET`, `DEBTOR_FETCH_WEBHOOK_URL_INVOICE` were both added, one was temporarily swapped with the other). Ripple effect is possible.

The iController cleanup cron (`web/lib/automations/debtor-email-cleanup/browser.ts`) uses the exact same `resolveCredentials` flow. If the key is genuinely broken, cleanup is broken too — the owner said "cron works" but most recent successful cleanup run must be checked (maybe it was before today's env frobbing).

## Impact

- Drafter (`POST /api/automations/debtor/create-draft`) unusable until fixed.
- Cleanup cron may be silently failing (check `automation_runs` table for latest `debtor-email-cleanup` rows and their `error_message`).
- Fetcher (`POST /api/automations/debtor/fetch-document`) unaffected — no credential decrypt in its path.

## Verification steps

1. **Inspect the stored value in Vercel Dashboard** (Settings → Environment Variables → `CREDENTIAL_ENCRYPTION_KEY`). Click "Edit" and reveal. Expected: exactly 64 lowercase hex chars, no quotes, no whitespace.
2. **Compare to what was originally used to encrypt** — if we still have the original 32-byte random hex anywhere (password manager, deploy notes), confirm it matches.
3. **Test decrypt locally**:
   ```bash
   cd web
   CREDENTIAL_ENCRYPTION_KEY=<value-from-vercel> npx tsx -e '
   import { decryptCredential } from "./lib/credentials/crypto.ts";
   // Paste one of the encrypted_values from supabase credentials table:
   console.log(decryptCredential("+euYdEO4FY0bikgp:tNmGVa2q66vuS23Ze2/zIQ==:a1RiTrv...SNIP..."));
   '
   ```
   If this throws → key mismatch. If it prints JSON `{"username":"...","password":"..."}` → key is correct, problem is elsewhere.
4. **Check recent automation_runs for `debtor-email-cleanup`**:
   ```sql
   select created_at, status, error_message
   from public.automation_runs
   where automation = 'debtor-email-cleanup'
   order by created_at desc
   limit 20;
   ```
   If failures also started today → env-side problem. If cleanup still runs clean → something drafter-specific (unlikely given identical code path).

## Fix (if key is indeed corrupted)

Option A (preferred — lossless): find the correct value of the original key, re-enter in Vercel Dashboard without quotes, redeploy, retest.

Option B (destructive): generate a new key, re-encrypt all existing credentials:
```bash
NEW_KEY=$(openssl rand -hex 32)
# update Vercel env CREDENTIAL_ENCRYPTION_KEY=$NEW_KEY
# then for each credential: decrypt with OLD key, encrypt with NEW key, UPDATE row
```
Needs a migration script. Only do this if Option A fails.

## Sequencing

Blocking: drafter E2E testing (acceptance + production). Not blocking: fetcher, Orq.ai swarm design, intent agent build.

Fix this before the copy-document sub-agent goes live end-to-end (the sub-agent's drafter tool-call is useless without working decryption).

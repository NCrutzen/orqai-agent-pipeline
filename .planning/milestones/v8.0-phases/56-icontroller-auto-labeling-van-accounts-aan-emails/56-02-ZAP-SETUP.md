# 56-02 — NXT Generic Lookup Zap Setup

**Status:** PENDING — operator action
**Owner:** Nick Crutzen
**Pickup time:** 2026-04-29 ~09:30 CEST (after 3-hour break)
**Pattern revision (2026-04-29):** sync → **async_callback** (Zapier doesn't support Custom Response on any plan)

---

## Goal

Create one Zapier Zap that lets Vercel ask NXT three kinds of questions, all parameterized by `nxt_database` so we can hit Benelux / Ireland / UK from the same wiring.

## Why this shape

- **Single Zap** instead of three separate Zaps = one auth surface, one URL to remember, one credential to rotate.
- **`lookup_kind` discriminator** = adding a fourth lookup later is a Zapier branch, not a new Vercel env var.
- **Parameterized `nxt_database`** = future-proof for Ireland/UK without code changes. Vercel reads `debtor.labeling_settings.nxt_database` per mailbox and forwards it.

---

## Step-by-step Zap construction

### 1. Create the Zap

Zapier → **Create Zap** → name: **"MR — NXT Generic Lookup"**

### 2. Trigger — Catch Hook

- App: **Webhooks by Zapier**
- Event: **Catch Hook**
- Click **Continue** without filtering payload → Zapier shows you the catch URL.
  - Copy it. This is `NXT_ZAPIER_WEBHOOK_URL` (one of the two env vars).
- Test: leave a sample payload empty for now (we'll send a real one in step 8).

### 3. Auth filter (so random callers can't hit the Zap)

- Add: **Filter by Zapier**
- Condition: `Authorization (Text) Exactly matches  Bearer YOUR_SECRET_HERE`
  - Pick a long random secret (32+ chars). This is `NXT_ZAPIER_WEBHOOK_SECRET`.
  - The header arrives in Zapier as `Authorization`; map to that.

### 4. Whitelist `nxt_database` (security gate)

Before branching, add a **Filter by Zapier** to whitelist allowed database names. Database names are STRUCTURAL identifiers in SQL Server and CANNOT be parameterized — they must be string-substituted into the query, which means we MUST whitelist allowed values to prevent injection.

- Condition: `nxt_database (Text) Exactly matches  nxt_benelux_prod`
- OR: `nxt_database (Text) Exactly matches  nxt_ireland_prod`
- OR: `nxt_database (Text) Exactly matches  nxt_uk_prod`

(Zapier filter "Only continue if" with OR-chain.) Anything else → block.

### 5. Branch on `lookup_kind`

Add **Paths by Zapier** (cleaner than 3 nested filters). Three paths:

| Path name | Filter |
|---|---|
| Sender → Account | `lookup_kind  Exactly matches  sender_to_account` |
| Identifier → Account | `lookup_kind  Exactly matches  identifier_to_account` |
| Candidate Details | `lookup_kind  Exactly matches  candidate_details` |

### 6. Inside each path — SQL query (DYNAMIC database)

**App:** Microsoft SQL Server (the existing connection used by invoice-fetch).

**Action:** "Find Multiple Rows via Custom Query"

**Database name handling:** Every `[NXT_DATABASE_FROM_PAYLOAD]` placeholder in the SQL below becomes a Zapier field-mapping → pick the catch-hook's `nxt_database` value. Zapier substitutes the literal string before sending the query to SQL Server.

⚠ The whitelist filter from step 4 makes this substitution safe (only known DB names can pass). If you skip the whitelist, the Zap is open to SQL injection via the `nxt_database` field.

⚠ The connection user must have access to all 3 NXT databases. If the existing invoice-fetch connection only has Benelux access, IE/UK paths will fail at runtime — confirm with the DBA before going live with non-Benelux mailboxes.

**Path 1 — Sender → Account:**

> ⚠ Updated 2026-04-29 per operator: resolve to the **top-level (paying) customer** by walking `customer.parent_id` chain. Phase 56 stores and assigns the top-level customer_id, never the sub-entity.

```sql
WITH cp AS (
  SELECT
    id            AS contact_id,
    customer_id   AS direct_customer_id,
    source_type, source_id,
    firstname, lastname, email, type, job_title
  FROM [NXT_DATABASE_FROM_PAYLOAD].dbo.contact_person
  WHERE email = @sender_email
),
chain AS (
  -- start at the contact's direct customer
  SELECT c.id, c.parent_id, c.name, c.brand_id, c.status,
         cp.contact_id, cp.firstname, cp.lastname, cp.type, cp.job_title,
         0 AS depth
  FROM cp
  JOIN [NXT_DATABASE_FROM_PAYLOAD].dbo.customer c ON c.id = cp.direct_customer_id
  UNION ALL
  -- walk up parent_id until null
  SELECT c.id, c.parent_id, c.name, c.brand_id, c.status,
         chain.contact_id, chain.firstname, chain.lastname, chain.type, chain.job_title,
         chain.depth + 1
  FROM chain
  JOIN [NXT_DATABASE_FROM_PAYLOAD].dbo.customer c ON c.id = chain.parent_id
  WHERE chain.depth < 10  -- safety cap
)
SELECT TOP 100
  contact_id,
  id            AS top_level_customer_id,
  name          AS top_level_customer_name,
  brand_id, status,
  firstname, lastname, type, job_title,
  depth
FROM chain
WHERE parent_id IS NULL  -- only the top-level row(s)
ORDER BY depth DESC
```

Map `@sender_email` ← `payload__sender_email` from the catch hook.

**Why the recursive CTE:** if `contact_person.email = alice@x.com` points at customer `123`, and `123.parent_id = 456`, and `456.parent_id = NULL`, then the row Phase 56 actually wants to label-target in iController is **456** (the paying entity), not 123. The CTE walks up to `parent_id IS NULL` and returns that row.

**Path 2 — Identifier → Account:**

> Returns `paying_customer_id` directly (already top-level on the invoice row — that's the entity actually being billed). No CTE needed.

```sql
SELECT
  id              AS invoice_id,
  invoice_number,
  customer_id,
  paying_customer_id   AS top_level_customer_id,
  site_id, job_id, invoice_date, status
FROM [NXT_DATABASE_FROM_PAYLOAD].dbo.invoice
WHERE invoice_number IN (@invoice_numbers)
```
Map `@invoice_numbers` ← `payload__invoice_numbers` (a comma-separated list — Zapier handles `IN` clause expansion). Phase 56 uses `top_level_customer_id` (= `paying_customer_id`) as the iController assignment target.

**Path 3 — Candidate Details:**
```sql
SELECT
  id, name, status, brand_id, country_id,
  city, classification, email, modified_on
FROM [NXT_DATABASE_FROM_PAYLOAD].dbo.customer
WHERE id IN (@customer_ids)
```
Map `@customer_ids` ← `payload__customer_ids`.

### 6. Final action per path — POST callback (async pattern)

> ⚠ **Updated 2026-04-29:** Custom Response is NOT supported on any Zapier plan (verified via Zapier community + product docs). Catch Hook always returns 200 immediately and runs the Zap async. We use the same async-callback pattern as the existing invoice-fetch Zap.

**App:** Webhooks by Zapier
**Action:** **POST**

| Field | Value |
|---|---|
| **URL** | map to catch-hook field `callback_url` (Vercel sends this per request — never hardcode) |
| **Payload Type** | `json` |
| **Wrap Request In Array** | `false` |
| **Headers** | (none — auth goes in body) |

**Data fields:**
- `requestId` ← catch-hook `requestId`
- `secret` ← catch-hook `auth` (re-emit the same secret Vercel sent in)
- `lookup_kind` ← catch-hook `lookup_kind`
- `matches` ← SQL step's `rows` array (whole array, not per-field)

The Vercel callback route (`/api/automations/debtor/nxt-lookup/callback`) validates `secret`, looks up the pending row by `requestId`, stores `matches`, and unblocks the original caller.

**Why `secret` and not `auth` in the callback body:** the invoice-fetch callback already uses `secret`. Same env var (`DEBTOR_FETCH_WEBHOOK_SECRET`), same constant-time check. Keeping the field name aligned across both Zaps means one less divergence.

### 7. Turn the Zap ON

After all 3 paths are configured + tested.

### 8. Vercel env vars — NONE NEW (registry-backed)

This is the future-proof shape: the catch-hook URL lives in the **`public.zapier_tools` registry table** (`supabase/migrations/20260429_zapier_tools_registry.sql`, applied 2026-04-29), not in Vercel env. Three rows are already seeded (`nxt.contact_lookup`, `nxt.identifier_lookup`, `nxt.candidate_details`), all pointing at this Zap.

**You do NOT add a new env var for this Zap.** Adding any future Zap also doesn't need a new env var — just a new row in `zapier_tools`.

**Auth secret reuse:** all 3 seeded rows reference `auth_secret_env: 'DEBTOR_FETCH_WEBHOOK_SECRET'`, which is already set in Vercel from the invoice-fetch automation. The lookup Zap reads `auth` from the request body (because Catch Hook hides Authorization headers); the invoice-fetch Zap reads `secret` from the body too. Same secret value, different transport per registry config.

### 9. Local `.env.local` — already in good shape

`DEBTOR_FETCH_WEBHOOK_SECRET` is already present (we populated the real value when the secret was provided). Nothing further to add for the lookup Zap.

### 10. Smoke test (async path — call via Vercel, not Zapier directly)

The Zap no longer returns the matches inline, so curling the catch hook only proves it accepted the request. To smoke the full round-trip, hit the Vercel endpoint that drives `callNxtTool` (Phase 56-03 wires up). Or for now, manually verify by:

1. POST to the catch-hook URL with a valid body containing `requestId`, `callback_url`, `auth`, `nxt_database`, `lookup_kind`, `payload`.
2. Watch `debtor.nxt_lookup_requests` row transition `pending → complete` with `result.matches` populated.

```bash
REQUEST_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')

curl -X POST "https://hooks.zapier.com/hooks/catch/15380147/uv5ju6h/" \
  -H "Content-Type: application/json" \
  -d "{
    \"requestId\": \"$REQUEST_ID\",
    \"callback_url\": \"https://agent-workforce.vercel.app/api/automations/debtor/nxt-lookup/callback\",
    \"auth\": \"$DEBTOR_FETCH_WEBHOOK_SECRET\",
    \"nxt_database\": \"nxt_benelux_prod\",
    \"lookup_kind\": \"sender_to_account\",
    \"payload\": { \"sender_email\": \"jvanschaijk@voslogistics.com\" }
  }"
```

⚠ You must INSERT a pending row in `debtor.nxt_lookup_requests` first (id = `$REQUEST_ID`, status='pending'), otherwise the callback returns 404 `unknown_request`. The real driver does this insert automatically via `callNxtTool`.

Expected after a few seconds: row updated to `status='complete'`, `result.matches[0].top_level_customer_id = '506909'`.

---

## Failure-mode design (already locked)

| Failure | Vercel behavior |
|---|---|
| Zap returns 200 with empty matches | Fall through to next pipeline layer (identifier-parse → unresolved → manual review) |
| Zap timeout or 5xx | Vercel retries once after 1s; if still failing → write `email_labels` row with `method='nxt_error'`, surface in dashboard "Failed lookups" filter |
| Zapier reaches plan limits / disabled | Same as 5xx path — fail-open, never label wrong customer |
| NXT SQL slow but eventually returns | Up to Zapier's 30s timeout; sync POST uses the full window |

The email STAYS unlabeled in iController on any error path. That's deliberately safe — operator retries from the dashboard once Zap/NXT is healthy.

---

## Open question (for v2, not blocking)

The customer table has its own `email` column too. Some senders (e.g., billing-bucket emails at a corporate parent) might be on the customer record but NOT in contact_person. If sender_to_account misses are common in production, add `customer.email` UNION to the contact_person query. Defer until telemetry shows it's needed.

---

## Closeout

After steps 1-9 are done:

- [ ] Zap is **ON**, all 3 paths filled
- [ ] Vercel has `NXT_ZAPIER_WEBHOOK_URL` + `NXT_ZAPIER_WEBHOOK_SECRET` set (Production)
- [ ] Local `.env.local` has both vars
- [ ] You've pinged Claude with the values for smoke-test
- [ ] Smoke test returns expected shape
- [ ] Phase 56-02 marked complete; Wave 2 unblocked

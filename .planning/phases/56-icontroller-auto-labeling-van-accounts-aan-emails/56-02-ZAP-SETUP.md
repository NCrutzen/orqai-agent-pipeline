# 56-02 — NXT Generic Lookup Zap Setup

**Status:** PENDING — operator action
**Owner:** Nick Crutzen
**Pickup time:** 2026-04-29 ~09:30 CEST (after 3-hour break)

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

### 6. Final action per path — Custom Response

**App:** Webhooks by Zapier
**Action:** **Custom Request** with method `Custom Response` (Zapier returns the response body to the original POST caller)

**Body (raw JSON):**
```json
{ "matches": [SQL_STEP_OUTPUT_HERE] }
```

Use Zapier's "Use a Custom Value" → map the SQL action's `rows` array. The SQL action returns each row as a separate item; you want them as a JSON array under `matches`.

**Status:** 200

### 7. Turn the Zap ON

After all 3 paths are configured + tested.

### 8. Add ONE env var to Vercel (reuses existing secret)

The Vercel env already has `DEBTOR_FETCH_WEBHOOK_SECRET` from the invoice-fetch Zap. Both Zaps share that secret — no new secret var needed.

Add ONE new var in Production:

| Key | Value | Notes |
|---|---|---|
| `DEBTOR_FETCH_WEBHOOK_URL_LOOKUP` | The catch-hook URL from step 2 | Parallel naming to existing `DEBTOR_FETCH_WEBHOOK_URL_INVOICE` |

Also Preview env if you want preview deploys to work with NXT lookups.

**Auth transport detail:** the two Zaps share the same secret value but consume it differently. The invoice-fetch Zap reads `Authorization: Bearer <secret>` from the request HEADER. The lookup Zap (this one) reads `auth: "<secret>"` from the request BODY (because Zapier's Catch Hook trigger doesn't reliably expose the Authorization header in the field picker). Vercel will format each request appropriately for its target.

### 9. Mirror to local `.env.local`

The shared secret is already there from the invoice-fetch setup (may show empty if marked Sensitive — that's fine; Vercel runtime has the real value). Append the new URL only:

```
DEBTOR_FETCH_WEBHOOK_URL_LOOKUP="https://hooks.zapier.com/hooks/catch/.../<id>/"
```

### 10. Smoke test

When you're back, ping me. I'll run a curl like:

```bash
curl -X POST "$NXT_ZAPIER_WEBHOOK_URL" \
  -H "Authorization: Bearer $NXT_ZAPIER_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "nxt_database": "nxt_benelux_prod",
    "lookup_kind": "sender_to_account",
    "payload": { "sender_email": "alice@nonexistent.example" }
  }'
```

Expected: `{ "matches": [] }` (no contact with that email).

Then a real-data smoke:
```bash
... -d '{"lookup_kind":"sender_to_account","payload":{"sender_email":"jvanschaijk@voslogistics.com"}}'
```
Expected: `{ "matches": [{ "customer_id": "506909", ... }] }` (per the sample data you pasted).

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

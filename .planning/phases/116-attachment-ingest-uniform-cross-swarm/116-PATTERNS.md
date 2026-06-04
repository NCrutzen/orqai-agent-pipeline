# Phase 116: Attachment Ingest — uniform cross-swarm attachment data source - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 8 new/modified
**Analogs found:** 8 / 8 (every file has a strong in-repo analog — this is an additive-capability phase built on proven seams)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/outlook/client.ts` (+`listAttachments`, +`downloadAttachmentValue`) | utility (Graph helper) | request-response / file-I/O | `web/lib/outlook/client.ts` `graphFetch`/`getMessageMeta` (same file) | exact |
| `web/lib/automations/attachments/extract.ts` (NEW) | service (extractor) | file-I/O / transform | `web/lib/automations/support-tickets/extract-frames.ts` | role+flow match |
| `web/lib/inngest/functions/stage-1_5-attachment-extractor.ts` (NEW) | worker (funnel step) | event-driven | `web/lib/inngest/functions/classifier-verdict-worker.ts` (swarm_dispatch case) | role+flow match |
| `web/lib/inngest/functions/attachments-backfill.ts` (NEW) | worker (batch) | batch / event-driven | `web/lib/automations/sales-email/retro/select-candidates.ts` + verdict worker | role+flow match |
| `web/app/api/automations/sales-email/ingest/route.ts` (MODIFY: metadata capture) | route (ingest) | request-response | same file (`emails` upsert block) + `debtor-email/ingest/route.ts` | exact |
| `web/app/api/automations/debtor-email/ingest/route.ts` (MODIFY: registry-gated capture, D-13) | route (ingest) | request-response | sales ingest route (same shape) | exact |
| `supabase/migrations/<date>_email_attachments.sql` (NEW table + bucket + RLS) | migration | — | `supabase/migrations/20260604_generic_resolution_audit.sql` | exact |
| `supabase/migrations/<date>_swarms_attachment_switches.sql` (NEW: D-04 switches + D-13 flip) | migration | — | `supabase/migrations/20260603b_swarms_dry_run_config.sql` | exact |
| `web/lib/inngest/functions/stage-2-customer-resolver.ts` (MODIFY: load + concat attachment text) | worker | event-driven | same file (`load-email` step) + `body-source.ts` `selectResolverBody` | exact |

## Pattern Assignments

### `web/lib/outlook/client.ts` — `listAttachments` + `downloadAttachmentValue` (utility, request-response/file-I/O)

**Analog:** same file, `graphFetch` (lines 30-81) — the single Graph credential boundary (connection `56014785`) with built-in 504/socket retry. New helpers MUST route through `graphFetch`; never hand-roll a second Graph client.

**Graph call + retry pattern already present** (lines 30-81): `graphFetch(path, {method})` returns a `Response`; callers check `res.ok`, throw on non-OK, then `res.json()`/`res.arrayBuffer()`. `const enc = encodeURIComponent` is at line 83 — reuse it for path segments.

**listAttachments (metadata only — `$select`, NOT contentBytes):**
```typescript
export async function listAttachments(mailbox: string, messageId: string) {
  const fields = "id,name,contentType,size,isInline";  // keep payload small
  const res = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}/attachments?$select=${fields}`,
  );
  if (!res.ok) throw new Error(`listAttachments ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { value: Array<{ id: string; name?: string;
    contentType?: string; size?: number; isInline?: boolean }> };
  return data.value;
}
```

**downloadAttachmentValue (raw bytes via `/$value`):**
```typescript
export async function downloadAttachmentValue(
  mailbox: string, messageId: string, attachmentId: string,
): Promise<ArrayBuffer> {
  const res = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}/attachments/${enc(attachmentId)}/$value`,
  );
  if (!res.ok) throw new Error(`attachment $value ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}
```
**Pitfall (RESEARCH Pitfall 5):** use `/$value` for raw bytes XOR decode `contentBytes` base64 — pick one consistently. Filter `isInline=true` out of extraction candidates (signatures/logos). Guard `@odata.type` — non-`fileAttachment` (reference/itemAttachment) → status `unsupported`, never fetch.

---

### `web/lib/automations/attachments/extract.ts` (NEW — service, file-I/O/transform)

**Analog:** `web/lib/automations/support-tickets/extract-frames.ts` — the working "download binary → Supabase Storage upload → vision" precedent.

**Storage upload pattern** (extract-frames.ts lines 283-300): deterministic key, `upsert: true`, typed `error` check that throws a coded error.
```typescript
const key = `${args.ticketId}/${i}.jpg`;          // deterministic key — NO randomUUID (replay-safe)
const { error } = await args.supabase.storage
  .from(STORAGE_BUCKET)
  .upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (error != null) {
  const errMsg = (error as { message?: string }).message ?? "unknown";
  throw new FrameExtractError("storage_upload_failed", { message: `... ${key}: ${errMsg}` });
}
```
For attachments the key is `${emailId}/${attachmentId}.pdf` — both stable ids, no randomness (RESEARCH Pitfall 6).

**Coded fail-soft error class** (extract-frames.ts lines 41-48) — copy verbatim shape so each failure maps to an `extraction_status` (`extraction_failed`, `skipped_cap`, `unsupported`, `source_gone`, `needs_vision`):
```typescript
export class FrameExtractError extends Error {
  readonly code: string;
  constructor(code: string, opts?: { cause?: unknown; message?: string }) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "FrameExtractError"; this.code = code;
  }
}
```

**Size cap before download** (extract-frames.ts `DEFAULT_MAX_VIDEO_BYTES` line 39, Content-Length gate) — mirror for `skipped_cap` per D-03/V12. Caps are Claude's-discretion globals.

**unpdf text-layer parse (new lib — RESEARCH Standard Stack):**
```typescript
import { extractText, getDocumentProxy } from "unpdf";  // pure-JS, serverless pdfjs
const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
const { text } = await extractText(pdf, { mergePages: true });
const trimmed = text.trim();
const status = trimmed.length > 0 ? "extracted" : "needs_vision";  // empty → Orq vision
```
**Vision fallback (D-09):** when `needs_vision`, call Orq.ai Router with a vision model — copy the support-tickets Orq invocation/model choice; `list_models`-validate the catalog ID (OQ-1, CLAUDE.md hard rule). Never a direct LLM key.

---

### `web/lib/inngest/functions/stage-1_5-attachment-extractor.ts` (NEW — worker, event-driven)

**Analog:** `web/lib/inngest/functions/classifier-verdict-worker.ts` — same Inngest worker shape, registry load, and dynamic-dispatch emit.

**Registry load (SWARM-02-clean, no swarm literal)** — verdict worker lines 83-84:
```typescript
const swarmRow = await step.run("load-swarm-row", () => loadSwarm(admin, swarm_type));
// read switch from registry jsonb — e.g. swarmRow?.attachment_config?.extract === true
```
`loadSwarm(admin, swarmType)` is exported from `web/lib/swarms/registry.ts` (lines 30-51): cached `SELECT * FROM swarms WHERE swarm_type=? AND enabled=true`, last-known-good on error. The full `swarms` row (incl. the new switches) comes back via `select("*")`.

**Dynamic dispatch emit (pass-through to Stage 2 when extraction OFF)** — verdict worker lines 340-360. The event name comes from registry data (`category.swarm_dispatch`), cast through `unknown` past the strict union. **Never destructure `inngest.send`** (CLAUDE.md):
```typescript
await (inngest.send as unknown as (payload: {
  name: string; data: Record<string, unknown>;
}) => Promise<unknown>)({
  name: category.swarm_dispatch!,   // for the extractor: emit the ORIGINAL Stage 2 event here
  data: { automation_run_id, swarm_type, category_key, message_id, source_mailbox },
});
```
**Recommended shape (OQ-2):** verdict worker emits `<swarm>/attachments.extract.requested`; this worker downloads+extracts (per-attachment fail-soft, D-03), writes `email_attachments`, then emits the original `sales-email/stage-2.customer-resolve.requested`. When the registry `extract` switch is OFF (debtor, D-13), emit the Stage 2 event immediately (pass-through). Event naming follows Phase 88.1 stage-named convention.

**Replay safety (CLAUDE.md Phase 65):** all side effects in `step.run()`; any timestamp/UUID generated INSIDE `step.run`. Large extracted text → write to the table, return only `email_id` — do NOT serialize text into the event (RESEARCH Pitfall 4; README "never serialise body or attachments into the event").

---

### `web/lib/inngest/functions/attachments-backfill.ts` (NEW — worker, batch)

**Analogs:** `web/lib/automations/sales-email/retro/select-candidates.ts` (corpus selection + hard cap) + verdict worker (emit shape).

**Fail-loud hard cap** — select-candidates.ts lines 18-26, 96, 135-145:
```typescript
export const STAGE_1_RETRO_HARD_CAP = 40000;   // narrow window or raise — fail loud, never silently truncate
// ... read at cap; if length === readCap → throw naming WHICH corpus truncated
```
Reuse this DoS-guard pattern for the corpus iteration (Claude's-discretion cap). The Stage-1-survivor definition for the extraction slice (D-12) is exactly `select-candidates.ts`'s corpus rules — reuse, don't reimplement.

**404 / deleted-moved mail (D-12, fail-soft)** — mirror the ingest route's 404 handling (sales ingest route.ts lines 131-146): `is404 → write/keep the metadata row with `extraction_status='source_gone'`` rather than crashing.

**Manual trigger (CLAUDE.md cron-disable pattern):** `{ event: 'sales-email/attachments.backfill.run' }`. Batched + rate-limited against Graph (read-only, Phase 112 discipline).

---

### `web/app/api/automations/sales-email/ingest/route.ts` (MODIFY — route, request-response)

**Analog:** same file, the `email_pipeline.emails` upsert block (lines 161-202) where `has_attachments: meta.hasAttachments ?? false` is already written (line ~196, Phase 114-03 D-14).

**Insertion point:** after the `emails` upsert returns `emailId`. Load the swarm row once (`loadSwarm(admin, swarm_type)` — the route does not currently load `swarms`; add one call), read the metadata-capture switch from registry jsonb (NO `if swarm==='sales'`), and if ON + `meta.hasAttachments`, call `listAttachments` and insert one `email_attachments` row per attachment with `extraction_status='pending'` (or `not_requested` when the extract switch is OFF). Metadata only — NO binary, NO extraction at ingest (D-05).

**Idempotent upsert + race-refetch** is the established shape (route.ts lines 159-210) — mirror for `email_attachments` rows (on `email_id` + `attachment_id`).

---

### `web/app/api/automations/debtor-email/ingest/route.ts` (MODIFY — route, request-response, D-13)

**Analog:** sales ingest route (identical capture block). D-13 flips debtor capture ON **purely via registry row** — the capture code is swarm-agnostic and reads the same switch. If a swarm literal were needed, D-13 would require code, which the constraint forbids. This file gets the **same** registry-gated block as sales (proving the registry opt-in works for real).

---

### `supabase/migrations/<date>_email_attachments.sql` (NEW — migration)

**Analog:** `supabase/migrations/20260604_generic_resolution_audit.sql` — the swarm-agnostic generic-table precedent D-06 mirrors (schema placement `email_pipeline`, RLS shape, free-text status columns → no codegen).

**Copy this exact structure** (generic_resolution_audit lines 23-72): `BEGIN;` → `CREATE TABLE IF NOT EXISTS email_pipeline.email_attachments (...)` → `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` → service_role `FOR ALL` policy → authenticated `FOR SELECT` policy (D-08 Bulk Review read) → NO anon policy → indexes (`(swarm_type, created_at DESC)`, `(email_id)`) → `COMMIT;`.
```sql
CREATE POLICY email_attachments_service_all ON email_pipeline.email_attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY email_attachments_auth_select ON email_pipeline.email_attachments
  FOR SELECT TO authenticated USING (true);   -- D-08 detail-pane read
-- anon: intentionally NO policy (denied by default + harden_rls revoke)
```
Keep `extraction_status` **free text** (mirrors `resolution_audit.method`) → adds NO literal-union column → needs NO codegen (RESEARCH A2; confirm `git diff --exit-code` after `npm run codegen`). Columns per D-06: metadata (filename/content_type/size/attachment_id) + extraction_status + extracted_text + storage_key + swarm_type + email_id (soft ref, nullable).

**Storage bucket:** create the `email-attachments` private bucket via migration/SQL with RLS (service_role write, NEVER anon — CLAUDE.md hard rule). `support-tickets-frames` is the precedent bucket. Bucket creation is NOT in git unless done via migration.

---

### `supabase/migrations/<date>_swarms_attachment_switches.sql` (NEW — migration)

**Analog:** `supabase/migrations/20260603b_swarms_dry_run_config.sql` — the registry-jsonb-switch precedent (D-04 two switches map cleanly onto a jsonb column on `public.swarms`, exactly like `dry_run_config`).

**Copy this exact structure** (dry_run_config lines 45-74): `ALTER TABLE public.swarms ADD COLUMN IF NOT EXISTS attachment_config jsonb NOT NULL DEFAULT '{}'::jsonb;` then per-swarm `UPDATE ... SET attachment_config = jsonb_build_object('capture', ..., 'extract', ...)`. Only ALTERs an existing RLS-enabled table — existing `swarms` policies cover the new column; NO new table/policy/anon grant.

**Seeds:**
- `sales-email`: `capture=true, extract=true` (full onboard).
- `debtor-email`: `capture=true, extract=false` (D-13 — metadata only, proves registry opt-in; extraction deferred).
- Optional global cap defaults (max size / max vision pages / max attachments) live in the same jsonb or a sibling `attachment_caps` key — per-swarm override optional (D-04).

Convention note: pick a clear flag polarity and document it in the migration header like dry_run_config does (its header documents "TRUE = BLOCKED" — your `capture`/`extract` should be the intuitive "TRUE = ON").

---

### `web/lib/inngest/functions/stage-2-customer-resolver.ts` (MODIFY — worker, event-driven; STAGE2-01-critical)

**Analog:** same file `load-email` step (lines 72-77) + `web/lib/agentic-pipeline/resolve/body-source.ts` `selectResolverBody` (lines 37-47).

**The engine NEVER sees a new field.** `resolveEntity` (resolve-customer.ts lines 139-148) reads `args.body_text` only:
```typescript
export async function resolveEntity(args: ResolveArgs, ...) {
  const subject = args.subject ?? "";
  const body = args.body_text ?? "";   // ← attachment text must arrive THROUGH here, as body_text
```
The resolver is called with `body_text: emailRow.body_text ?? ""` at lines 237 and 249. **Insertion point:** in the `load-email` step (lines 72-77), additionally load this email's `email_attachments` extracted text, concatenate (the `selectResolverBody` body-source precedent), and pass the combined string as `body_text`. Adapter signature unchanged; engine pristine; STAGE2-01 holds by construction.
```typescript
// selectResolverBody precedent (body-source.ts): pure helper, replay-safe inside existing step.run
const attachmentText = (attachmentRows ?? [])
  .filter((a) => a.extraction_status === "extracted" && a.extracted_text)
  .map((a) => a.extracted_text)
  .join("\n\n");
const combinedBody = attachmentText
  ? `${emailRow.body_text ?? ""}\n\n--- ATTACHMENTS ---\n${attachmentText}`
  : (emailRow.body_text ?? "");
// → resolveEntity({ ..., body_text: combinedBody }, config)
```
**Anti-pattern (Pitfall 2 / STAGE2-01):** adding `attachments` to `ResolveArgs` or engine config. Attachment text is *just more body text* (D-11). Run the STAGE2-01 no-engine-diff guard before declaring done — any diff in `web/lib/agentic-pipeline/resolve/engine.ts`/`config.ts`/`steps/*` is a violation.

---

## Shared Patterns

### Graph access (single credential boundary)
**Source:** `web/lib/outlook/client.ts` `graphFetch` (lines 30-81) + `const enc = encodeURIComponent` (line 83).
**Apply to:** `listAttachments`, `downloadAttachmentValue`, backfill worker. Built-in 504/socket retry; connection `56014785`. Never a second Graph client.

### Registry-gated, swarm-agnostic switch read (SWARM-02)
**Source:** `web/lib/swarms/registry.ts` `loadSwarm` (lines 30-51); usage in `classifier-verdict-worker.ts` lines 83-84.
**Apply to:** ingest routes (capture switch), extractor worker (extract switch).
```typescript
const swarmRow = await loadSwarm(admin, swarm_type);
const captureOn = swarmRow?.attachment_config?.capture === true;  // registry data, NO === 'sales'
```
Any `=== 'sales'` / `=== 'debtor'` in a shared worker fails the 110-01 static guard.

### Inngest replay-safety + large-output rule
**Source:** CLAUDE.md Inngest block; verdict worker `step.run` discipline.
**Apply to:** extractor + backfill workers. All side effects in `step.run`; deterministic Storage keys (`${emailId}/${attachmentId}`); timestamps/UUIDs inside `step.run`; never destructure `inngest.send`; large extracted text → table, return `email_id` reference only (never into the event payload).

### Fail-soft with visible status
**Source:** `extract-frames.ts` `FrameExtractError` (lines 41-48); ingest route 404 handling (lines 131-146).
**Apply to:** every extraction/backfill failure → an `extraction_status` value (`extracted`, `needs_vision`, `extraction_failed`, `skipped_cap`, `unsupported`, `source_gone`). The funnel never stalls (D-03). Status surfaces in the Bulk Review detail pane (D-08).

### RLS-mandatory generic table + jsonb registry switch
**Source:** `supabase/migrations/20260604_generic_resolution_audit.sql` (table) + `20260603b_swarms_dry_run_config.sql` (jsonb switch) + `_template.sql`.
**Apply to:** both new migrations. service_role `FOR ALL` minimum; authenticated `FOR SELECT` only for UI read; NEVER anon; free-text status → no codegen.

### LLM vision via Orq.ai Router
**Source:** `web/lib/automations/support-tickets/` Orq vision invocation (copy its model choice/invocation); CLAUDE.md Orq block.
**Apply to:** `extract.ts` vision fallback. `list_models`-validate the catalog ID before binding (PATCH accepts unknown IDs silently); register as a row, not env var; never a direct LLM key.

## No Analog Found

None. Every file maps to a strong in-repo analog. The genuinely new surface is the `unpdf` library call and the Orq vision model ID — both are new *content*, not new *patterns* (the download→store→vision and registry-gated-worker shapes already exist).

## Bulk Review Detail Pane (D-08) — handled outside this map

The attachment metadata/status display lands in the rebuilt review-shell (`web/app/(dashboard)/automations/[swarm]/_shell/`) and MUST follow the `sketch-findings-bulk-review-flow-ux` design contract (stage-keyed shell + detail pane, no preview/download UI). This is a frontend-server surface with its own design-contract skill rather than a backend code analog — the planner should treat the skill + rebuilt `_shell/` as the binding reference, reading `email_attachments` via the authenticated `FOR SELECT` policy added in the migration above.

## Metadata

**Analog search scope:** `web/lib/outlook/`, `web/lib/inngest/functions/`, `web/lib/automations/{sales-email,support-tickets,attachments}/`, `web/lib/agentic-pipeline/resolve/`, `web/lib/swarms/`, `web/app/api/automations/{sales-email,debtor-email}/ingest/`, `supabase/migrations/`.
**Files scanned:** 13 (all confirmed present; 8 read in depth for excerpts).
**Pattern extraction date:** 2026-06-04

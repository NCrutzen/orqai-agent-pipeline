# Phase 116: Attachment Ingest — uniform cross-swarm attachment data source - Research

**Researched:** 2026-06-04
**Domain:** Microsoft Graph attachment ingest, serverless PDF/image text extraction, registry-driven funnel-step insertion, Supabase Storage + RLS, gated corpus backfill
**Confidence:** HIGH (architecture + code paths verified against live repo; one MEDIUM area: Orq vision-model catalog ID needs `list_models` confirmation at plan time)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Extraction trigger & timing**
- **D-01:** Post-Stage-1 eager extraction. Metadata captured at ingest; content extraction fires once an email survives the Stage 1 noise filter. Noise mail is never extracted.
- **D-02:** Sequenced, not raced — extraction is a funnel step between the Stage 1 verdict and the Stage 2 request. Stage 2 always sees attachment text when there is any. Deterministic; seconds of added latency accepted.
- **D-03:** Fail-soft, never block. Extraction failure (corrupt/password/oversized/unsupported) → status on the attachment record (visible in Bulk Review detail); Stage 2 proceeds body-only.
- **D-04:** Registry shape = two independent switches per swarm: (1) metadata capture at ingest, (2) post-Stage-1 content extraction. A swarm can capture metadata without paying for extraction. Caps/types are global defaults with optional per-swarm override.

**Storage & retention**
- **D-05:** Binaries to Supabase Storage, downloaded from Graph only when extraction fires (post-Stage-1), keyed per email/attachment. Noise mail stores nothing.
- **D-06:** Extracted text lives in a new generic, swarm-agnostic attachments table (one row per attachment: metadata + extraction status + extracted text), in the spirit of the Phase 114 D-12 generic `resolution_audit` precedent. Ships as migration + RLS (service_role minimum; authenticated SELECT if UI-read) + `npm run codegen` atomically.
- **D-07:** Keep indefinitely for now. Retention/GDPR policy deferred.
- **D-08:** Bulk Review shows metadata + extraction status (names/types/sizes + done/failed/skipped) in the detail pane. ⚠️ **User directive: implement diligently in the post-UX-rebuild review pane** (stage-keyed shell) — follow the bulk-review-flow-ux design contract. No preview/download UI this phase.

**Extraction depth (v1)**
- **D-09:** Text-layer parse first, LLM-vision fallback for scans (via Orq.ai Router on rendered pages). No dedicated OCR service.
- **D-10:** v1 file types = PDF + standalone images (jpg/png) via the same LLM-vision path. Office docs (docx/xlsx) get metadata only with status `unsupported`.
- **D-11:** Output is raw text only, per attachment. The Stage 2 sales adapter mines identifiers from it with its existing layers (same treatment as body text — adapter-side body-source framing); Stage 3 receives it as prompt context. No structured-field extraction in the uniform layer.

**Backfill**
- **D-12:** Metadata backfill over the whole 1,273-mail corpus via Graph `source_id` message-ids; content extraction only for Stage-1 survivors (same funnel rule as live).
- **D-13:** Debtor metadata capture flips ON in this phase via registry row (proves the registry opt-in works). No debtor extraction, no debtor backfill.

**Hard architecture constraints (roadmap-locked):**
- Zero per-swarm branches in shared workers (SWARM-02; static guard exists since 110-01).
- Engine files stay byte-identical to the v8.2 donor (STAGE2-01) — attachment-derived text enters Stage 2 as an adapter-side body-source, never an Engine edit.
- Debtor/future-swarm adoption must require only a registry row, no code change.

**Already done (do not redo):** `has_attachments` boolean capture for new sales mail (Phase 114-03, D-14).

### Claude's Discretion
- **Caps:** pragmatic global defaults (max attachment size, max vision pages, max attachments per mail) grounded in corpus data; over-cap → status `skipped_cap`, fail-soft and visible.
- **Mechanics:** Inngest event naming (Phase 88.1 stage-named convention), extraction worker shape, backfill batching/rate-limiting against Graph, deleted/moved-mail handling, vision model choice (`list_models`-validated).
- **Table/bucket placement:** schema (`email_pipeline` likely) and Storage bucket layout/keying at planner discretion; RLS + migration-template compliance non-negotiable.
- **Dedup:** identical attachments repeated across a thread — planner decides if/how to dedup (hash) in v1.

### Deferred Ideas (OUT OF SCOPE)
- Retention/GDPR policy for stored binaries (once volumes known)
- Office-doc (docx/xlsx) extraction
- Debtor extraction + backfill (capture flips on now; rest later)
- Attachment preview/download in Bulk Review
- Stage 4 handlers consuming attachments (V11.0)
</user_constraints>

<phase_requirements>
## Phase Requirements

Requirement IDs are TBD (new ATTACH-* to be defined at planning). The 4 roadmap success criteria are the binding acceptance surface; map each to the research below.

| Success Criterion | Description | Research Support |
|----|-------------|------------------|
| SC-1 | Ingest writes attachment metadata for new mail in every onboarded swarm; capture is swarm-agnostic, configured via registry. | Standard Stack §Graph attachments; Architecture Pattern 1 (registry-gated metadata capture in ingest route); both ingest routes share `fetchMessageBody`/`getMessageMeta` plumbing |
| SC-2 | Attachment content extraction (PDF text minimum) callable as a uniform source — zero swarm-specific branches in shared workers (SWARM-02 holds). | Standard Stack §unpdf + Orq vision; Architecture Pattern 2 (extraction funnel step keyed off registry, not swarm literal); Don't Hand-Roll §PDF parsing |
| SC-3 | Stage 2 can consume attachment-derived identifiers as an additional adapter-side source with the no-engine-diff guard still green (STAGE2-01 holds). | Architecture Pattern 3 (adapter-side body-source; `selectResolverBody` precedent); engine.ts untouched; sales `resolve-customer.ts` reads `args.body_text` only |
| SC-4 | Backfill over existing corpus executed or explicitly deferred; `has_attachments=false`-on-all-rows blind spot closed. | Architecture Pattern 4 (gated Graph backfill via `source_id`); `select-candidates.ts` 40k hard-cap precedent; Stage-1-survivor slice reuse |
</phase_requirements>

## Summary

This phase inserts a new **extraction funnel step between the Stage 1 verdict and the Stage 2 request** (D-01/D-02), backed by a new swarm-agnostic `email_pipeline` attachments table (D-06) and a Supabase Storage bucket for binaries (D-05). The pipeline already has every seam this needs:

1. **The trigger point is exact and known.** For non-noise sales mail, `classifier-verdict-worker.ts` resolves `action='swarm_dispatch'` on the `unknown` noise category and fires `sales-email/stage-2.customer-resolve.requested`. The extraction step interposes here: instead of dispatching Stage 2 directly, the verdict worker (or a new extraction worker it dispatches to) downloads attachments, extracts text, writes the attachments table, then emits the Stage 2 request. This is registry-data driven (the dispatch event name already lives in `swarm_noise_categories.swarm_dispatch`), so it stays SWARM-02-clean.

2. **The Stage 2 consumption seam is already adapter-side.** `web/lib/automations/sales-email/resolve-customer.ts` reads `args.body_text` only and mines identifiers from it. Attachment text becomes an additional body-source the adapter concatenates/considers — exactly the `selectResolverBody` precedent in `body-source.ts` (Phase 90 RESL-16). The engine (`resolve/engine.ts`) is never touched; STAGE2-01 holds by construction.

3. **The storage + extraction stack is a proven repo pattern.** `support-tickets/extract-frames.ts` already does: download binary → Supabase Storage upload → (frames) → Orq vision. We reuse that exact shape. For PDFs, **`unpdf`** (pure-JS, zero native deps, serverless-safe, 1M+ weekly downloads, UnJS org) handles the text-layer parse; when it yields ~nothing, render pages and fall back to **Orq.ai Router vision** (D-09) — never a direct LLM key, never a new OCR service.

4. **The backfill is read-only Graph at corpus scale.** Reuse the `select-candidates.ts` 40k-hard-cap-fail-loud pattern and Phase 112 batching discipline. Metadata for all 1,273 mails via `source_id`; extraction only for the Stage-1-survivor slice (D-12).

**Primary recommendation:** Add (a) Graph attachment list/content helpers to `web/lib/outlook/client.ts`; (b) a generic `email_pipeline.email_attachments` table + Storage bucket (migration + RLS + codegen); (c) two registry switches on `public.swarms` (`capture_attachments`, `extract_attachments` — likely folded into a `dry_run_config`-style jsonb or dedicated columns); (d) a new extraction Inngest worker dispatched from the Stage 1 verdict for `swarm_dispatch` rows; (e) a `selectResolverBody`-style attachment-text concatenation in the sales adapter; (f) a gated backfill worker. Use `unpdf` for PDF text + Orq vision fallback.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Attachment metadata capture | API / Backend (ingest route) | — | Ingest route already writes `has_attachments`; metadata is the same Graph call's `value[]` |
| Attachment list/content fetch | API / Backend (`web/lib/outlook`) | Database/Storage | Graph access is server-side via the single Zapier-SDK credential boundary (`graphFetch`) |
| Binary storage | Database / Storage (Supabase Storage) | — | D-05; mirrors `support-tickets-frames` bucket precedent |
| PDF text-layer extraction | API / Backend (Inngest worker, `unpdf`) | — | Pure-JS, runs in `nodejs` runtime inside the durable function |
| Scanned/image extraction | API / Backend → Orq.ai Router | — | D-09 vision fallback; never direct LLM key (CLAUDE.md) |
| Extracted-text persistence | Database / Storage (`email_pipeline.email_attachments`) | — | D-06 generic table; large text → Postgres column (small per-attachment; see Pitfall 4) |
| Stage 2 consumption | API / Backend (sales adapter) | — | Adapter-side body-source (STAGE2-01); engine untouched |
| Stage 3 consumption | API / Backend (coordinator prompt context) | — | Extracted text threaded into `coordinator.requested` payload (after Phase 113) |
| Bulk Review display | Frontend Server (rebuilt review-shell) | — | D-08; post-UX-rebuild stage-keyed shell, detail pane only |
| Registry gating | Database (`public.swarms`) | — | D-04 two switches; SWARM-02 branch-free dispatch |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `unpdf` | 1.6.2 | PDF text-layer extraction (`extractText`) + page rendering for vision fallback | [VERIFIED: npm registry] Pure-JS, zero native deps (no `canvas` binding), ships a serverless build of PDF.js that mocks canvas; explicitly built for Vercel/Lambda/Workers. 1,046,464 downloads last week; created 2023-08-11; repo `github.com/unjs/unpdf` (UnJS org); no postinstall script. |
| Microsoft Graph attachment API | v1.0 | List attachment metadata (`/messages/{id}/attachments`), fetch content (`/attachments/{id}/$value`) | [CITED: learn.microsoft.com/graph] Already the swarm's mail backend via `graphFetch` |
| Supabase Storage | (via `@supabase/supabase-js` in repo) | Binary storage for downloaded attachments (D-05) | [VERIFIED: codebase] `support-tickets/extract-frames.ts` is the working `storage.from(bucket).upload(...)` precedent |
| Orq.ai Router | (via repo Orq client) | Vision fallback for scanned PDFs/images (D-09) | [CITED: CLAUDE.md] Mandated LLM path; never direct keys |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `inngest` | (in repo) | Durable extraction worker + backfill worker | Extraction step + corpus backfill (replay-safe) |
| `zod` | (in repo) | Validate Graph attachment payloads + worker event data | Every external/event boundary |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `unpdf` | `pdf-parse` | `pdf-parse` depends on `canvas` (native bindings) → fails on Vercel serverless. [CITED: dev.to / buildwithmatija] Documented footgun. Reject. |
| `unpdf` | `pdfjs-dist` directly | unpdf *is* a serverless-packaged pdfjs; using raw pdfjs reintroduces the canvas-in-node problem unpdf already solved. |
| Orq vision fallback | Dedicated OCR service (Tesseract/Textract) | New infra dependency outside the locked stack; D-09 explicitly rejects. |
| Text in Postgres column (D-06) | Text in Storage + pointer | D-06 chose the table; per-attachment text is small enough (Pitfall 4 documents the cap). |

**Installation:**
```bash
cd web && npm install unpdf
```

**Version verification (run at plan time):**
```bash
npm view unpdf version          # confirm latest (was 1.6.2 on 2026-06-04)
npm view unpdf scripts.postinstall   # confirm still empty (no install-time exec)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `unpdf` | npm | ~3 yrs (created 2023-08-11) | 1.05M/wk | github.com/unjs/unpdf (UnJS) | unavailable | Approved — verified via official UnJS docs + registry; no postinstall |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

> slopcheck could not be installed at research time. Per protocol, `unpdf` would default to `[ASSUMED]` — BUT it is independently corroborated by: official UnJS documentation (unjs.io/packages/unpdf), 1M+ weekly downloads, 3-year age, a real org-owned source repo, and an empty postinstall. The planner SHOULD still gate the `npm install unpdf` behind a `checkpoint:human-verify` task as a belt-and-suspenders measure, but the risk is low. All OTHER packages in scope (`inngest`, `zod`, `@supabase/supabase-js`, `@zapier/zapier-sdk`) are already in `web/package.json` — no new install, no audit needed.

## Architecture Patterns

### System Architecture Diagram

```
                    inbound sales mail (Zapier → /api/automations/sales-email/ingest)
                                  │
                                  ↓
        ┌─────────────────────────────────────────────────┐
        │ INGEST ROUTE                                     │
        │  fetch Graph meta+body (getMessageMeta/          │
        │  fetchMessageBody) → write email_pipeline.emails │
        │  ★ NEW: if registry.capture_attachments → list   │
        │     attachments → write email_attachments rows   │
        │     (metadata only, NO binary, NO extraction)    │
        └─────────────────────────────────────────────────┘
                                  │ emit stage-0/email.received
                                  ↓
                    Stage 0 safety → Stage 1 (regex + LLM 2nd-pass)
                                  │
                                  ↓
        ┌─────────────────────────────────────────────────┐
        │ classifier-verdict-worker  (action switch)       │
        │   action='categorize_archive' → noise → STOP     │
        │   action='swarm_dispatch' (unknown) ────────┐    │
        └─────────────────────────────────────────────│────┘
                                                       ↓
        ┌─────────────────────────────────────────────────┐
        │ ★ NEW EXTRACTION FUNNEL STEP (D-02)              │
        │  if registry.extract_attachments AND has rows:   │
        │    for each attachment (cap-gated):              │
        │      download $value → Supabase Storage          │
        │      unpdf.extractText → if ~empty → Orq vision  │
        │      UPDATE email_attachments: text + status     │
        │  fail-soft per attachment (D-03)                 │
        └─────────────────────────────────────────────────┘
                                  │ emit sales-email/stage-2.customer-resolve.requested
                                  ↓
        ┌─────────────────────────────────────────────────┐
        │ stage-2-customer-resolver (shared worker)        │
        │  loadStage2Resolver(registry path) → sales       │
        │  adapter.resolveEntity(args, config)             │
        │  ★ args.body_text now = body + attachment text   │
        │     (adapter-side concat; engine untouched)      │
        └─────────────────────────────────────────────────┘
                                  │ emit sales-email/coordinator.requested
                                  ↓
                    Stage 3 (after Phase 113) — extracted text as prompt context
```

### Pattern 1: Registry-gated metadata capture in the ingest route (SC-1)
**What:** After the `emails` upsert in the ingest route, if the swarm's registry row has the metadata-capture switch ON and `has_attachments=true`, call a new `listAttachments(mailbox, messageId)` Graph helper and insert one `email_attachments` row per attachment (filename, contentType, size, attachment_id) with `extraction_status='pending'` (or `not_requested` when extraction switch is OFF).
**When to use:** Both `sales-email/ingest/route.ts` and `debtor-email/ingest/route.ts` — D-13 flips debtor capture ON via registry, so the capture code must be swarm-agnostic (read the switch from the loaded swarm row, never `if swarm==='sales'`).
**Example:**
```typescript
// Source: pattern derived from sales ingest route.ts:172-202 (emails upsert)
// NEW Graph helper in web/lib/outlook/client.ts:
export async function listAttachments(mailbox: string, messageId: string) {
  // $select keeps payload small — metadata only, NOT contentBytes.
  const fields = "id,name,contentType,size,isInline";
  const res = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}/attachments?$select=${fields}`,
  );
  if (!res.ok) throw new Error(`listAttachments ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { value: Array<{ id: string; name?: string;
    contentType?: string; size?: number; isInline?: boolean }> };
  return data.value;
}
```
**Registry read (SWARM-02-clean):** load the swarm row once (the ingest route does not currently load `swarms`; add a single `loadSwarm(admin, swarm_type)` call), read the capture flag from registry jsonb — no swarm literal.

### Pattern 2: Extraction as a funnel step keyed off the Stage 1 verdict (SC-2)
**What:** When `classifier-verdict-worker` reaches the `swarm_dispatch` case (the only `action` that hands off to Stage 2), interpose extraction before emitting the dispatch event. Two viable shapes:
- **(a) New dedicated worker** — verdict worker emits `<swarm>/attachments.extract.requested`; the new extraction worker does the work, then emits the *original* `swarm_dispatch` event (`sales-email/stage-2.customer-resolve.requested`). Cleaner separation, more replay-isolated, follows the Phase 88.1 stage-named convention.
- **(b) Inline in verdict worker** — extraction `step.run`s inside the existing `swarm_dispatch` case before the `dispatch` step. Fewer events but couples extraction failure handling into the verdict worker.

**Recommend (a):** a new `stage-1.5-attachment-extractor.ts` worker. It keeps the verdict worker untouched except for emitting one extra event, isolates the fail-soft logic (D-03), and is the natural place for cap gating. Gate the whole step on the registry `extract_attachments` switch — when OFF (debtor today, D-13), the worker emits the Stage 2 event immediately (pass-through), so debtor behaviour is unchanged.
**When to use:** Only on the `swarm_dispatch` path (non-noise mail) — noise mail never reaches here, satisfying "noise is never extracted" (D-01).
**Example (download + extract, replay-safe):**
```typescript
// Source: support-tickets/extract-frames.ts:284-299 (Storage upload) +
//         unpdf README (extractText). Runs in nodejs runtime inside step.run.
import { extractText, getDocumentProxy } from "unpdf";
// inside step.run("extract-attachment", async () => { ... }) — replay-safe:
const bytes = await downloadAttachmentValue(mailbox, messageId, attachmentId); // Graph $value
await admin.storage.from("email-attachments")
  .upload(`${emailId}/${attachmentId}.pdf`, bytes, { contentType, upsert: true });
const pdf = await getDocumentProxy(new Uint8Array(bytes));
const { text } = await extractText(pdf, { mergePages: true });
const trimmed = text.trim();
const status = trimmed.length > 0 ? "extracted" : "needs_vision"; // → Orq fallback
```
**Vision fallback (D-09):** when `status==='needs_vision'`, render pages to images (unpdf can rasterize, or pass the original image bytes for jpg/png) and call the Orq.ai Router with a vision-capable model. `list_models`-validate the model ID at plan time (see Open Questions OQ-1).

### Pattern 3: Adapter-side attachment body-source (SC-3, STAGE2-01)
**What:** The sales adapter reads `args.body_text`. Attachment text becomes an additional source the adapter folds in — exactly mirroring `selectResolverBody` (per-source body selection, `body-source.ts`). The Stage 2 worker loads the email's `email_attachments` extracted text and concatenates it into the `body_text` passed to `resolveEntity`, OR the adapter loads it itself. **The engine never sees a new field** — it still receives `body_text: string`.
**When to use:** In `stage-2-customer-resolver.ts` generic path (the `usesGenericPath` block, lines 284-411) OR inside the sales adapter. Preferred: build the combined text in the worker's `load-email` step (load attachments alongside the email row) and pass the concatenation as `body_text` — keeps the adapter signature identical and the engine pristine.
**Anti-pattern:** Adding an `attachments` field to `ResolveArgs`. That is an engine-contract change → STAGE2-01 violation. The whole point is that attachment text is *just more body text* (D-11 raw-text-only).
**Example:**
```typescript
// Source: body-source.ts selectResolverBody precedent (Phase 90 RESL-16).
// In stage-2-customer-resolver.ts load-email step, generic path only:
const attachmentText = (attachmentRows ?? [])
  .filter((a) => a.extraction_status === "extracted" && a.extracted_text)
  .map((a) => a.extracted_text)
  .join("\n\n");
const combinedBody = attachmentText
  ? `${emailRow.body_text ?? ""}\n\n--- ATTACHMENTS ---\n${attachmentText}`
  : (emailRow.body_text ?? "");
// pass combinedBody as resolveEntity({ ..., body_text: combinedBody }, config)
```

### Pattern 4: Gated corpus backfill via `source_id` (SC-4)
**What:** A new Inngest worker iterates `email_pipeline.emails` where `source='outlook' AND mailbox='verkoop@smeba.nl'` (and SugarCRM corpus per `select-candidates.ts` provenance rules), reads `source_id` (the Graph message-id), calls `listAttachments`, and writes metadata rows for ALL 1,273. For the Stage-1-survivor slice only, it additionally runs extraction (same funnel rule). Reuse the `select-candidates.ts` corpus-selection + 40k hard-cap fail-loud pattern; respect Phase 112 batching/rate-limiting against Graph (read-only, but corpus-scale).
**When to use:** One-shot backfill, manually triggerable (`{ event: 'sales-email/attachments.backfill.run' }` per CLAUDE.md cron-disable pattern), batched.
**Deleted/moved mail (Claude's discretion):** Graph returns 404 for a `source_id` whose message left the mailbox since ingest. Fail-soft: write/keep the metadata row with `extraction_status='source_gone'` (mirrors the ingest route's `is404 → 200 graph_not_found` handling at route.ts:131-146).

### Recommended Project Structure
```
web/lib/outlook/client.ts                              # + listAttachments, downloadAttachmentValue
web/lib/automations/attachments/extract.ts             # unpdf + Orq-vision extract (swarm-agnostic)
web/lib/inngest/functions/stage-1_5-attachment-extractor.ts  # NEW funnel-step worker
web/lib/inngest/functions/attachments-backfill.ts      # NEW gated corpus backfill
supabase/migrations/<date>_email_attachments.sql       # generic table + RLS + Storage bucket policy
supabase/migrations/<date>_swarms_attachment_switches.sql  # D-04 two registry switches + D-13 debtor flip
```

### Anti-Patterns to Avoid
- **Adding `attachments` to `ResolveArgs` / engine config** → STAGE2-01 violation. Attachment text is body text (Pattern 3).
- **`if (swarm_type === 'sales')` anywhere in shared workers** → SWARM-02 violation; the 110-01 static guard fails CI. Read switches from the loaded swarm row.
- **Extracting noise mail** → cost footgun; D-01 says extraction only after Stage 1 survival.
- **`pdf-parse` / raw `pdfjs-dist` in node** → canvas native binding fails on Vercel.
- **Storing binaries at ingest for all mail** → D-05 stores only on extraction (post-Stage-1).
- **Hand-editing `*.generated.ts`** → CLAUDE.md; run `npm run codegen` (note: codegen reads `swarm_intents` only today — a new `email_attachments` table needs NO codegen unless it adds a literal-union column; D-06 keeps `extraction_status` free-text, so no codegen — confirm).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom PDF byte parser | `unpdf` (`extractText`) | PDF is a deeply irregular format; unpdf wraps battle-tested pdfjs, serverless-packaged |
| Scanned-PDF OCR | Tesseract/OCR service | Orq.ai Router vision model (D-09) | No new infra; CLAUDE.md mandates Orq for LLM |
| Graph credential/auth/retry | New Graph client | `graphFetch` in `web/lib/outlook/client.ts` | Single credential boundary (Zapier conn 56014785) + built-in 504/socket retry |
| Binary → object storage | Custom S3 wiring | `admin.storage.from(bucket).upload()` | `support-tickets/extract-frames.ts` precedent |
| Stage 2 dispatch routing | New event wiring | Registry `swarm_dispatch` + `loadStage2Resolver` | Already data-driven; SWARM-02-clean |
| Per-source body selection | New branching | `selectResolverBody` shape (`body-source.ts`) | Established adapter-side pattern |
| Corpus cap / truncation safety | Ad-hoc limit | `STAGE_1_RETRO_HARD_CAP` fail-loud pattern | `select-candidates.ts` proven DoS guard |

**Key insight:** Nearly every primitive this phase needs already exists in the repo (Graph fetch+retry, Storage upload, Orq vision via support-tickets, registry dispatch, adapter body-source, corpus-cap backfill). The genuinely new code is: 2 Graph helpers, 1 PDF library, 1 generic table + bucket, 1 extraction worker, 1 backfill worker, 2 registry switches, and the adapter-side concat. Resist rebuilding any of the above.

## Runtime State Inventory

> This is an additive-capability phase (new table, new worker, registry rows), not a rename/refactor. No existing runtime string is being renamed. The relevant "state" concern is the **opposite**: existing rows that LACK attachment data.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `email_pipeline.emails`: all 1,273 sales rows have `has_attachments=false` and `raw_json=null` (pre-114-03). New `email_attachments` table starts empty. | Backfill (Pattern 4): re-fetch metadata via `source_id`; extraction for Stage-1 survivors (D-12). |
| Live service config | Supabase Storage: a NEW bucket (`email-attachments` or similar) must be created — bucket creation is NOT in git unless done via migration/SQL. `support-tickets-frames` bucket exists as precedent. | Create bucket via migration/SQL with RLS; document keying. |
| OS-registered state | None — no OS-level registration involved. | None. |
| Secrets/env vars | None new. Graph via existing `ZAPIER_CREDENTIALS_*`; Orq via existing `ORQ_API_KEY`. | None. |
| Build artifacts | `web/package.json` gains `unpdf`; `package-lock.json` updates. `*.generated.ts` likely unchanged (no new literal-union column if `extraction_status` stays free-text). | `npm install unpdf`; confirm codegen unaffected. |

## Common Pitfalls

### Pitfall 1: `pdf-parse` (or raw pdfjs) crashes on Vercel
**What goes wrong:** Import fails or runtime throws on the missing `canvas` native binding.
**Why:** Vercel serverless has no canvas native libs; `pdf-parse`/`pdfjs-dist` node build expects them.
**How to avoid:** Use `unpdf` (serverless pdfjs build that mocks canvas). Set `export const runtime = 'nodejs'` on any route; inside Inngest workers the node runtime is already in effect, but unpdf still requires Node APIs (not Edge).
**Warning signs:** "Cannot find module 'canvas'" or worker timeout at first PDF.

### Pitfall 2: Adding a field to the engine contract (STAGE2-01 break)
**What goes wrong:** The no-engine-diff guard goes red; the v8.2 donor equivalence is lost.
**Why:** Treating attachment text as a new structured input instead of body text.
**How to avoid:** Pattern 3 — concatenate into `body_text`. The engine sees only `body_text: string`. Run the STAGE2-01 guard locally before declaring done.
**Warning signs:** A diff in `web/lib/agentic-pipeline/resolve/engine.ts` / `config.ts` / `steps/*`.

### Pitfall 3: A swarm literal sneaks into a shared worker (SWARM-02 break)
**What goes wrong:** The 110-01 static guard fails CI.
**Why:** `if (swarm_type === 'sales-email')` to decide capture/extraction.
**How to avoid:** Read the capture/extraction switches from the loaded `swarms` row (registry data). Debtor flips capture ON via D-13 *purely* by a registry UPDATE — if a literal were needed, D-13 would require code, which the constraint forbids.
**Warning signs:** Any `=== 'sales'` / `=== 'debtor'` in ingest route, extractor, or resolver.

### Pitfall 4: Oversized extracted text bloats Postgres rows / events
**What goes wrong:** A 200-page tender's extracted text is huge; storing it inline in `email_attachments.extracted_text` and then threading it into Inngest event payloads / `pipeline_events` jsonb violates the CLAUDE.md "large outputs → Supabase, reference returned" Inngest rule.
**Why:** Vision/text of large docs can be MBs.
**How to avoid:** (1) Cap extracted text length (Claude's-discretion cap) → `skipped_cap` when exceeded. (2) Store text in the table column (D-06) but DO NOT serialize the full text into Inngest events — pass the `email_id` and let the resolver/coordinator read the row (the Stage 2 worker already loads the email row; load attachments there). The README cross-swarm dispatch contract explicitly says "Never serialise message body or attachments into the event."
**Warning signs:** Event payloads in the MB range; Inngest step output size warnings.

### Pitfall 5: Graph `$value` returns base64 vs raw bytes, and inline attachments
**What goes wrong:** `/attachments/{id}` returns a `fileAttachment` with `contentBytes` (base64), while `/attachments/{id}/$value` returns raw bytes. Mixing them corrupts the binary. Inline images (signatures, logos — `isInline=true`) flood the attachment list with noise.
**Why:** Graph has two representation modes; `isInline` attachments are usually not real documents.
**How to avoid:** Use `/$value` for raw bytes (matches the `support-tickets` `fetch→buffer` shape) OR decode `contentBytes` from base64 — pick one and be consistent. Filter `isInline=true` out of extraction candidates (keep them in metadata if cheap, but don't extract). [CITED: learn.microsoft.com/graph/api/attachment-get]
**Warning signs:** unpdf throws "invalid PDF structure"; attachment list full of `image001.png`.

### Pitfall 6: Replay-unsafe non-deterministic keys in the extraction worker
**What goes wrong:** A `crypto.randomUUID()` or `Date.now()` generated OUTSIDE `step.run` regenerates on replay → Storage key / row key drift (CLAUDE.md Phase 65 lesson).
**Why:** Inngest replays the function body.
**How to avoid:** Storage keys should be deterministic (`${emailId}/${attachmentId}.pdf` — both are stable Graph/DB ids, no randomness needed). Any timestamp goes inside `step.run`. Do not nest `step.run` inside the adapter (already a rule).
**Warning signs:** Duplicate Storage objects; attachment rows updated on the wrong key.

## Code Examples

### Download attachment raw bytes (Graph $value)
```typescript
// Source: graphFetch pattern (web/lib/outlook/client.ts:30-81)
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

### unpdf text-layer extract
```typescript
// Source: github.com/unjs/unpdf README
import { extractText, getDocumentProxy } from "unpdf";
const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
const { totalPages, text } = await extractText(pdf, { mergePages: true });
// text === "" (or whitespace) → scanned PDF → Orq vision fallback
```

### Registry-gated capture (swarm-agnostic)
```typescript
// Source: loadSwarm usage in classifier-verdict-worker.ts:83-85
const swarmRow = await loadSwarm(admin, swarm_type);
const captureOn = swarmRow?.attachment_config?.capture === true; // registry data, no literal
if (captureOn && meta.hasAttachments) { /* listAttachments + insert rows */ }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pdf-parse` (canvas dep) | `unpdf` (serverless pdfjs) | ~2023+ for serverless | Works on Vercel; no native build |
| Direct OCR services | LLM-vision on rendered pages | 2024-2025 | No OCR infra; one Orq Router call |
| Per-swarm tables | Generic `email_pipeline` tables by config (D-06) | Phase 114 (`resolution_audit`) | New swarm = registry row, not new table |

**Deprecated/outdated:**
- `pdf-parse` for serverless: superseded by `unpdf` for Vercel/Lambda.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | unpdf's vision/rasterize path can render PDF pages to images for the Orq fallback; if not, render via a separate step or pass page images another way. | Pattern 2 | MEDIUM — may need an extra rasterization approach for scanned PDFs; jpg/png path is unaffected (pass bytes directly to vision). |
| A2 | `email_attachments` needs NO codegen because `extraction_status` stays free-text (mirrors `resolution_audit` free-text `method`). | Runtime State Inventory | LOW — if a literal-union column is added, codegen + `git diff --exit-code` gate applies. |
| A3 | The two D-04 switches live on `public.swarms` (as columns or a jsonb like `dry_run_config`). Exact shape is planner's discretion. | Pattern 1 | LOW — placement detail; any registry-data form satisfies SWARM-02. |
| A4 | Graph `$value` on a `fileAttachment` returns the raw file bytes; itemAttachment/referenceAttachment types are out of v1 scope (treat as `unsupported`). | Pitfall 5 | MEDIUM — reference attachments (OneDrive links) carry no bytes; must be handled as a status, not a crash. |
| A5 | The corpus is ~1,273 sales mails (from the folded todo); exact count + attachment-bearing fraction should be measured at plan time to size caps. | Backfill / Caps | LOW — affects cap tuning + cost estimate, not architecture. |

## Open Questions (RESOLVED)

*All three questions were resolved at planning time (2026-06-04); the decisions are encoded in the Phase 116 plans.*

1. **Orq vision model catalog ID (OQ-1).** — **RESOLVED:** Plan 02 Task 2 uses `anthropic/claude-sonnet-4-5-20250929` via the ad-hoc Orq Router (the same live, `list_models`-validated catalog ID already used by `detect-system.ts` in the support-tickets swarm). A task note allows swapping to a cheaper EU vision model only if `list_models`-validated first per CLAUDE.md.
   - What we know: D-09 mandates Orq.ai Router vision; CLAUDE.md lists Anthropic vision-capable models (e.g. `aws/eu.anthropic.claude-*`), Gemini, GPT-4o — all vision-capable.
   - What's unclear: which exact catalog ID to use, and whether it's invoked via the `orq_agents` registry (a new vision agent row) or the ad-hoc Router. Must `list_models`-validate before binding (CLAUDE.md hard rule — PATCH accepts unknown IDs silently).
   - Recommendation: plan a task to `list_models`, pick a vision-capable EU-hosted model, and register it (registry row, not env var) following the `support-tickets` Orq precedent (that swarm already does vision — copy its model choice/invocation).

2. **Extraction worker shape — dedicated vs inline (OQ-2).** — **RESOLVED:** Plan 04 implements the recommended dedicated `stage-1.5-attachment-extractor` worker; the verdict worker's dispatch is rewired via registry (migration in Plan 04 Task 1), and the extractor passes straight through to the registry-derived Stage 2 event (`attachment_config.stage2_dispatch_event`) when `extract` is OFF.
   - What we know: Pattern 2 recommends a dedicated `stage-1.5` worker for fail-soft isolation + cap gating.
   - What's unclear: whether the pass-through-when-OFF path is cleanest as the worker emitting Stage 2 immediately, vs the verdict worker conditionally choosing the target event.
   - Recommendation: dedicated worker; verdict worker always emits the extraction event; the extractor decides (registry switch) whether to extract or pass straight through to the Stage 2 event. Keeps verdict worker change to one line.

3. **PDF rasterization for scanned docs (OQ-3).** — **RESOLVED:** Plan 02 Task 2 passes the original PDF/image bytes to the Orq vision model directly (Claude Sonnet accepts PDF input natively); no separate rasterization step is built. jpg/png attachments need no rasterization (D-10).
   - What we know: text-layer parse is `unpdf.extractText`; the vision fallback needs page images.
   - What's unclear: best rasterization path inside the worker (unpdf rendering, or send the whole PDF to a vision model that accepts PDFs directly — some do).
   - Recommendation: spike at plan time; if the chosen Orq vision model accepts PDF input directly, skip rasterization entirely. jpg/png attachments need no rasterization (D-10).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Microsoft Graph (via Zapier SDK) | Attachment list/content + backfill | ✓ | v1.0 | — (hard dep) |
| Supabase Storage | Binary store (D-05) | ✓ | in-repo client | — |
| Orq.ai Router | Vision fallback (D-09) | ✓ | `ORQ_API_KEY` set | text-layer-only → status `needs_vision` (degraded, not blocking) |
| `unpdf` | PDF text extraction | ✗ (not installed) | 1.6.2 (npm) | — (must install) |
| `ffmpeg-static` | (not needed — no video) | ✓ | — | n/a |

**Missing dependencies with no fallback:** `unpdf` (must `npm install`).
**Missing dependencies with fallback:** Orq vision — if a model isn't wired in time, ship text-layer-only and mark scans `needs_vision` (D-03 fail-soft); vision becomes a fast-follow without schema change.

## Validation Architecture

> `.planning/config.json` was not read for an explicit `nyquist_validation: false`; treating validation as enabled. Confirm at plan time.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo uses `*.test.ts` under `__tests__/`; e.g. `web/lib/automations/sales-email/__tests__/`) |
| Config file | `web/vitest.config.*` (verify exact path at plan time) |
| Quick run command | `cd web && npx vitest run <path>` |
| Full suite command | `cd web && npm test` (confirm script name) |

### Phase Requirements → Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `listAttachments`/`downloadAttachmentValue` parse Graph payloads | unit (mock graphFetch) | `npx vitest run web/lib/outlook/__tests__/attachments.test.ts` | ❌ Wave 0 |
| unpdf extract returns text; empty → needs_vision | unit | `npx vitest run web/lib/automations/attachments/__tests__/extract.test.ts` | ❌ Wave 0 |
| Adapter-side body-source concat (engine still pristine) | unit | `npx vitest run web/lib/automations/sales-email/__tests__/resolve-customer.test.ts` (extend) | ✅ extend |
| Registry switch gates capture/extraction, no swarm literal | unit | `npx vitest run web/lib/inngest/functions/__tests__/stage-1_5-attachment-extractor.test.ts` | ❌ Wave 0 |
| STAGE2-01 no-engine-diff guard green | static guard | existing guard command (verify) | ✅ |
| SWARM-02 no-branch guard green | static guard | existing 110-01 guard command | ✅ |
| Backfill cap fail-loud + 404 source_gone | unit | `npx vitest run web/lib/inngest/functions/__tests__/attachments-backfill.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the touched module's vitest file.
- **Per wave merge:** full sales-email + inngest function suites + STAGE2-01/SWARM-02 guards.
- **Phase gate:** full suite green + both static guards green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `web/lib/outlook/__tests__/attachments.test.ts` — Graph helper parsing
- [ ] `web/lib/automations/attachments/__tests__/extract.test.ts` — unpdf + vision-fallback branch
- [ ] `web/lib/inngest/functions/__tests__/stage-1_5-attachment-extractor.test.ts` — funnel-step gating + fail-soft
- [ ] `web/lib/inngest/functions/__tests__/attachments-backfill.test.ts` — cap + 404 handling
- [ ] Confirm STAGE2-01 + SWARM-02 guard invocation commands (reuse existing)

## Security Domain

> `security_enforcement` not explicitly disabled — including. This phase ingests externally-supplied binary files and feeds extracted text to an LLM.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `zod` on Graph attachment payloads + worker event data; size/type/count caps before download (skipped_cap) |
| V6 Cryptography | no | No new crypto; deterministic storage keys (not secrets) |
| V12 Files & Resources | yes | Cap attachment size (Content-Length-style gate before download — mirrors `extract-frames` `maxBytes`); restrict extracted types (PDF/jpg/png only); store under per-email keys; never execute file content |
| V14 Configuration | yes | New bucket gets RLS; service_role write only; no anon policy (CLAUDE.md hard rule) |
| V2/V3/V4 (authn/session/access) | no | Backend-only pipeline; no new user-facing surface beyond authenticated Bulk Review read |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized attachment (DoS / cost) | Denial of Service | Size cap → `skipped_cap` before download; max-pages cap on vision; max-attachments-per-mail cap (Claude's-discretion caps, fail-soft) |
| Malicious/corrupt PDF crashes worker | Denial of Service | `unpdf` in try/catch → `extraction_failed` status (D-03 fail-soft); never block the funnel |
| Prompt injection via attachment text into Stage 3 LLM | Tampering / Elevation | Attachment text is untrusted input; Stage 0 injection-check already exists for body — consider the same posture for attachment-derived text fed to Stage 3 (note for Phase 113); for Stage 2 it's deterministic identifier mining (lower risk) |
| Storage RLS gap exposing customer documents | Information Disclosure | service_role-only write policy; authenticated SELECT only if Bulk Review needs it; NEVER anon (CLAUDE.md); private bucket |
| Reference/itemAttachment (OneDrive link) treated as file | Tampering | Type-guard on `@odata.type`; non-fileAttachment → `unsupported` status, no fetch |

## Sources

### Primary (HIGH confidence)
- Repo code (read this session): `web/lib/outlook/client.ts`, `web/app/api/automations/sales-email/ingest/route.ts`, `web/lib/inngest/functions/classifier-verdict-worker.ts`, `web/lib/inngest/functions/stage-2-customer-resolver.ts`, `web/lib/automations/sales-email/resolve-customer.ts`, `web/lib/agentic-pipeline/resolve/body-source.ts`, `web/lib/automations/sales-email/retro/select-candidates.ts`, `web/lib/automations/support-tickets/extract-frames.ts`, `web/lib/swarms/dynamic.ts`, `web/lib/automations/orq-agents/client.ts`
- Migrations: `supabase/migrations/20260604_generic_resolution_audit.sql`, `20260603b_swarms_dry_run_config.sql`, `20260603_sales_swarm_full_funnel_enrichment.sql`, `20260504b_swarms_registry_generalisation.sql`
- Architecture RFCs: `docs/agentic-pipeline/README.md`, `context-shape-contract.md`, `stage-1-regex.md`
- `npm view unpdf` (version 1.6.2, created 2023-08-11, repo unjs/unpdf, no postinstall); npm downloads API (1.05M last week)

### Secondary (MEDIUM confidence)
- unpdf serverless guidance: github.com/unjs/unpdf, unjs.io/packages/unpdf, buildwithmatija.com (Vercel PDF guide), dev.to (unpdf vs pdf-parse)
- Microsoft Graph attachment API: learn.microsoft.com/graph/api/attachment-get (CITED, not fetched this session — verify $value vs contentBytes at plan time)

### Tertiary (LOW confidence)
- None relied upon for load-bearing claims.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — unpdf verified on registry + corroborated docs; all other deps already in repo.
- Architecture: HIGH — every seam (trigger point, adapter body-source, registry dispatch, Storage, backfill cap) verified against live code.
- Pitfalls: HIGH — derived from read code + CLAUDE.md locked lessons (replay-safety, RLS, large-output rule, STAGE2-01/SWARM-02 guards).
- Orq vision specifics: MEDIUM — model ID + invocation needs `list_models` + the support-tickets precedent at plan time (OQ-1, OQ-3).

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (stack stable; re-verify unpdf version + Orq catalog at plan time)

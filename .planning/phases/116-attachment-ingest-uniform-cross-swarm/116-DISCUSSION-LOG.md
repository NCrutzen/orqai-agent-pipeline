# Phase 116: Attachment Ingest — uniform cross-swarm attachment data source - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 116-attachment-ingest-uniform-cross-swarm
**Areas discussed:** Extraction trigger & timing, Storage & retention, Extraction depth (v1 scope), Backfill strategy

---

## Extraction trigger & timing

### When should extraction run in the live flow?

| Option | Description | Selected |
|--------|-------------|----------|
| Post-Stage-1 eager (Recommended) | Metadata at ingest; extraction fires once a mail survives Stage 1; text ready for Stage 2/3 | ✓ |
| Pure on-demand | Consumer-triggered with caching; cheapest, adds latency/failure modes inside stage workers | |
| Eager at ingest | Extract every PDF on arrival; pays for noise mail | |

### Should Stage 2 wait for extraction?

| Option | Description | Selected |
|--------|-------------|----------|
| Sequence it: extract, then Stage 2 (Recommended) | Extraction is a funnel step between Stage 1 verdict and Stage 2 request; deterministic | ✓ |
| Race, Stage 2 uses what's there | Parallel; PO-only-in-PDF mails may miss on first pass | |
| Stage 2 triggers + awaits inline | Adapter requests + waits; couples extraction failures to resolver | |

### Extraction failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-soft, never block (Recommended) | Status on attachment record, Stage 2 proceeds body-only | ✓ |
| Fail-soft + retry queue | Adds operator re-trigger queue | |
| Hard fail to human lane | Parks mail for operator before Stage 2 | |

### Per-swarm registry config

| Option | Description | Selected |
|--------|-------------|----------|
| Two switches: capture + extraction (Recommended) | Independent toggles; caps/types global defaults with optional override | ✓ |
| One switch: attachments on/off | Single boolean for the whole source | |
| Full config object | Per-swarm JSON with types/caps/OCR | |

---

## Storage & retention

### Binary storage

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase Storage for extracted mail (Recommended) | Download from Graph only when extraction fires; keyed per email/attachment | ✓ |
| No binary storage — Graph is the archive | Re-fetch via source_id when needed; breaks if mail leaves Graph reach | |
| Store every attachment at ingest | Complete archive incl. noise; cost + data-minimization concern | |

### Extracted-text store

| Option | Description | Selected |
|--------|-------------|----------|
| Generic attachments table (Recommended) | New swarm-agnostic email_pipeline table: metadata + status + text per attachment (D-12 precedent) | ✓ |
| Text in Storage, pointer in table | Keeps text out of Postgres; heavier for batch/retro queries | |
| Append to emails body columns | Zero new wiring; loses provenance, pollutes body signal | |

### Retention

| Option | Description | Selected |
|--------|-------------|----------|
| Keep indefinitely for now (Recommended) | Corpus is the asset; GDPR/retention policy deferred | ✓ |
| TTL on binaries, keep text | Storage lifecycle expiry; loses originals for V11.0 handlers | |
| Mirror mailbox lifecycle | Sync deletion with Outlook; scope-heavy | |

### Bulk Review visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Metadata + extraction status (Recommended) | Names/types/sizes + done/failed/skipped in detail pane | ✓ |
| Full: metadata + extracted-text view | Also render extracted text collapsible | |
| No UI this phase | SQL-only verification | |

**User's choice:** Option 1, with directive: "be diligent in implementing it correctly in the review pane after the UX rebuild we did" — the display must follow the post-rebuild stage-keyed shell + bulk-review-flow-ux design contract.

---

## Extraction depth (v1 scope)

### Scanned/image-based PDFs

| Option | Description | Selected |
|--------|-------------|----------|
| Text-layer + LLM-vision fallback (Recommended) | Cheap text-layer parse first; vision model via Orq.ai Router when it yields ~nothing | ✓ |
| Text-layer only in v1 | Scans get status 'no_text_layer'; measurable gap | |
| Full OCR pipeline | Dedicated OCR service; new infra dependency outside locked stack | |

### File types beyond PDF

| Option | Description | Selected |
|--------|-------------|----------|
| PDF + images (Recommended) | jpg/png via the same vision path; Office docs metadata-only 'unsupported' | ✓ |
| PDF only | Strict roadmap reading; image PO's invisible | |
| PDF + images + Office docs | Adds docx/xlsx parsing dependencies | |

### Output shape

| Option | Description | Selected |
|--------|-------------|----------|
| Raw text only (Recommended) | Adapter mines identifiers like body text; Stage 3 gets prompt context; swarm-agnostic | ✓ |
| Text + structured identifiers | Sales semantics baked into uniform layer — SWARM-02 tension | |
| You decide | Planner weighs it | |

### Caps

| Option | Description | Selected |
|--------|-------------|----------|
| Sensible defaults, Claude picks (Recommended) | Global defaults grounded in corpus data; over-cap → 'skipped_cap', fail-soft + visible | ✓ |
| No caps in v1 | Observe costs first; 200-page tender risk | |
| Strict caps, operator-tunable | Registry-tunable caps; widens registry surface | |

---

## Backfill strategy

### Backfill depth over the 1,273-mail corpus

| Option | Description | Selected |
|--------|-------------|----------|
| Metadata all + extraction for Stage-1 survivors (Recommended) | Graph metadata re-fetch for whole corpus; extraction follows the live funnel rule — the slice 113 reads | ✓ |
| Full extraction over everything | Pays vision cost for noise mail nothing reads | |
| Metadata only, defer extraction | Pushes extraction into 113's critical path | |

### Debtor swarm scope

| Option | Description | Selected |
|--------|-------------|----------|
| Capability only; debtor opts in later (Recommended) | Sales-only rollout; uniformity proven by design + guard | |
| Flip debtor capture on now | Metadata capture via registry row proves the opt-in for real; invoice-copy attachments accumulate; no debtor extraction/backfill | ✓ |
| Full debtor onboarding too | Doubles rollout surface with no consumer waiting | |

**Notes:** User deliberately went beyond the recommendation here — proving the registry opt-in with a real second swarm is worth the small widening of scope.

---

## Claude's Discretion

- Cap values (max size, max vision pages, max attachments per mail) — grounded in corpus data, fail-soft over-cap.
- Inngest event naming (Phase 88.1 stage-named convention), extraction worker shape, backfill batching/rate-limiting, deleted/moved-mail handling.
- Vision model choice (`list_models`-validated).
- Attachments-table schema placement + Storage bucket layout (RLS + template compliance non-negotiable).
- Thread-level attachment dedup (hash) in v1 or not.

## Deferred Ideas

- Retention/GDPR policy for stored binaries (once volumes known)
- Office-doc (docx/xlsx) extraction
- Debtor extraction + backfill (capture flips on now; rest later)
- Attachment preview/download in Bulk Review
- Stage 4 handlers consuming attachments (V11.0)

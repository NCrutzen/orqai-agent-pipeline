---
created: 2026-04-22T18:35:00.000Z
title: Build createIcontrollerDraft tool — Browserless + Playwright (Vercel API route)
area: automation
files:
  - web/lib/automations/debtor-email-cleanup/browser.ts
  - web/lib/automations/debtor-email-cleanup/probe-email-popup.ts
  - .planning/briefs/artifacts/13-reply-composer-page.html
  - .planning/briefs/artifacts/06-probe-summary.json
---

## Problem

The debtor swarm's copy-document sub-agent, after fetching a PDF via the fetcher tool, needs to place a draft reply in iController with the PDF attached — so a human operator reviews and sends from the same UI they already use daily. iController has **no API** (per CLAUDE.md); this must be browser automation.

This is **engineering**, not swarm design. `/orq-agent` references this tool by its contract; the implementation lives separately.

## Solution

Single Vercel API route wrapping Browserless + Playwright:

```
POST /api/automations/debtor/create-draft

Request:
{
  "messageId": "1384673",              // iController internal id of the inbound email being replied to
  "bodyHtml": "<p>Beste heer...</p>",  // Short NL cover text, can be empty to let reply use the original thread alone
  "pdfBase64": "...",                  // From fetchDocument response
  "filename": "factuur-17006798.pdf"
}

Response:
{
  "success": true,
  "draftUrl": "https://walkerfire.icontroller.eu/messages/compose/direction/reply/messageId/1384673",
  "screenshots": { "beforeSave": "...", "afterSave": "..." }
}
```

**Flow (selectors from 2026-04-22 probe, see `.planning/briefs/artifacts/`):**

1. Load session with validation (validate-before-trust pattern — learning `24a11fb2-…`). Dedicated session key `icontroller_session_drafter` (NOT shared with cleanup automation).
2. Open new tab directly at `/messages/compose/direction/reply/messageId/{messageId}` — skips row-click + detail-view entirely. iController pre-populates to/cc/subject from the original message.
3. Attach PDF: `page.locator("input[type='file']").setInputFiles({ name: filename, mimeType: "application/pdf", buffer: Buffer.from(pdfBase64, "base64") })`. The button `<button class="attachments dz-clickable">Add attachments</button>` is Dropzone.js; setting the hidden input directly is more reliable than clicking it.
4. If bodyHtml provided: inject into the CKEditor iframe. Use `page.frameLocator("iframe").locator("body").evaluate((el, html) => el.innerHTML = html, bodyHtml)` — OR set the mirrored hidden `<textarea name="message">` + fire the editor's sync event.
5. Click `Save as draft` button (plain `<button>Save as draft</button>`).
6. Capture before/after screenshots to Supabase storage (pattern from `web/lib/browser/screenshots.ts`).
7. Save session state after successful draft creation.

**Environment:** `ICONTROLLER_ENV=production` once live; `acceptance` for tests but acceptance inbox is empty so reply-to-existing-mail flow can't be exercised there. Use `acceptance` for cold-compose tests, production HITL for reply tests.

## Open questions

- How do we confirm the draft was actually saved? iController shows no URL change after Save-as-draft — need to check for toast/redirect/DOM-marker signifying success.
- When should the draft be DELETED from iController? If the debtor-team operator decides not to send it, the draft lingers. Cleanup strategy TBD.
- Can we also set sender-side custom fields (e.g. flag the draft with "auto-created by Claude" so operators can filter)?
- Rate limit: Browserless session pool is shared across automations. If many copy-requests land in one batch, serialize vs. parallel?
- Error-handling: iController login fails mid-session → surface clearly to caller, don't silently retry (could trigger lockout).

## Phased build

1. **Happy-path MVP** — given valid messageId + pdf, create a draft. Measure success rate on 10 real inbound emails.
2. Add session-validate + save-on-success pattern (learning `24a11fb2-…`).
3. Add screenshot audit trail + error categorisation (login_failed / message_not_found / attach_failed / save_failed).
4. Add idempotency: same (messageId, docRef) → don't create duplicate draft.

## Sequencing

Part of the debtor-email-automation sub-project. Built in parallel with the document fetcher (`2026-04-22-tool-fetch-document-nxt-via-zapier-sdk.md`). Both must exist before `/orq-agent` designs the swarm that consumes them.

# iController Account-Assignment Selectors (Probe iter 2 v2)

**Verified:** 2026-04-29 ~10:11 CEST against production iController, mailbox 4 (Smeba), msg 1372274.
**Widget framework:** **Select2** (jQuery plugin, well-documented).

---

## URL patterns

| Surface | URL |
|---|---|
| Mailbox list | `https://walkerfire.icontroller.eu/messages/index/mailbox/{mailbox_id}` |
| Detail view | `https://walkerfire.icontroller.eu/messages/show?msg={msg_id}` |

The detail link is found in the list-view DOM as `<a href="/messages/show?msg=N">` — relative href, so probe scans for `msg=\d+` in any anchor href.

---

## Detail-view layout (verified visually)

```
[Mark Done] [Reply] [Forward]                    [download][print][file][delete]

[avatar] FROM_NAME <FROM_EMAIL>
         To: TO_EMAIL                            <date>

Accounts:    [Select2 widget — defaults to "None selected"]   ← target widget
Labels:      [Select2 widget — defaults to "None selected"]

Attachments: <file links>
<email body>
```

---

## Selectors for Browserless module

```ts
// Trigger: open the Accounts picker
const ACCOUNTS_TRIGGER = '.select2-container.clients';

// After click → typeahead input (autofocus)
const TYPEAHEAD_INPUT = '.select2-container.clients.select2-dropdown-open .select2-input';
// (or: input.select2-focused — the autofocus state)

// Hidden form-bound input that holds the selected value
const HIDDEN_FORM_INPUT = 'input.clients.select2-offscreen';

// Results dropdown after typing
const RESULTS_DROPDOWN = 'ul.select2-results';

// First selectable result (Select2 marks it .select2-highlighted by default
// when the typeahead returns a single best match)
const FIRST_RESULT = 'ul.select2-results .select2-result-selectable.select2-highlighted';

// Fallback: any selectable result (skip the unselectable group header
// .select2-result-with-children which is just the "Account" group label)
const ANY_SELECTABLE_RESULT = 'ul.select2-results .select2-result-selectable .select2-result-label';
```

The **Labels** widget is parallel (`class="labels"` instead of `class="clients"`) — never confuse them.

---

## Browserless flow (assignAccount)

```ts
async function assignAccount({
  msg_id,
  customer_id,
}: {
  msg_id: string | number;
  customer_id: string; // top-level customer_id from NXT
}): Promise<{ ok: boolean; assigned_label?: string }> {
  const session = await openIControllerSession("production");
  try {
    const { page, cfg } = session;

    await page.goto(`${cfg.url}/messages/show?msg=${msg_id}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".select2-container.clients", { timeout: 8000 });

    // Idempotency: if Accounts already shows a non-empty selection, no-op.
    const existing = await page.$eval(
      ".select2-container.clients",
      (el) => el.textContent?.trim() ?? "",
    );
    if (existing && !/none\s+selected/i.test(existing)) {
      return { ok: true, assigned_label: existing }; // already labeled
    }

    // Click trigger → opens picker
    await page.click(".select2-container.clients");
    await page.waitForSelector(".select2-input.select2-focused", { timeout: 3000 });

    // Type customer_id (typeahead matches numeric IDs natively)
    await page.fill(".select2-input.select2-focused", "");
    await page.type(".select2-input.select2-focused", customer_id, { delay: 50 });

    // Wait for results
    await page.waitForSelector("ul.select2-results .select2-result-selectable", {
      timeout: 4000,
    });

    // Click highlighted (first) result. Select2 fires its onSelect handler
    // which auto-commits the selection via the form's hidden input — no
    // separate Save button needed (verified visually in screenshot 03).
    await page.click("ul.select2-results .select2-result-selectable.select2-highlighted");
    await page.waitForTimeout(800);

    // Verify the widget now shows the selected text
    const after = await page.$eval(
      ".select2-container.clients",
      (el) => el.textContent?.trim() ?? "",
    );
    if (/none\s+selected/i.test(after)) {
      return { ok: false }; // selection didn't stick
    }
    return { ok: true, assigned_label: after };
  } finally {
    await closeIControllerSession(session);
  }
}
```

### Verified behaviors

1. **Save:** Select2 onSelect **auto-saves immediately** (operator confirmed 2026-04-29 via manual click + page refresh). The Browserless module does NOT need a separate Save button click.

2. **Cross-brand candidates appear.** Even in Smeba's mailbox, typing `506909` returned matches from Sicli too. iController's typeahead is brand-agnostic — Phase 56 must send the EXACT customer_id, not name-search.

3. **Brand verification suffix.** Each result is rendered as `<customer_id> - <customer_name> (<entity_brand>)`, e.g. `506909 - Vos Logistics Technical Department B.V. (Smeba Brandbeveiliging BV)`. The parenthesized brand is iController's server-side cross-check: it shows which entity the customer is assignable from. **Phase 56 uses this as a defensive layer** — if the highlighted result's brand doesn't match the source mailbox's expected brand, the module bails out and writes `email_labels.method='brand_mismatch'` instead of clicking. See "Brand-verification flow" below.

### Caveats / TODO

1. **Top-level customer resolution.** Per operator note 2026-04-29: Phase 56 should target the **top-level/paying** customer when the contact_person row points at a sub-entity. See `customer.parent_id` chain walk in 56-02-ZAP-SETUP.md (updated).

2. **Multi-select widget mode.** The widget is `select2-container-multi` — supports multiple accounts on one message. Phase 56 v1 assigns ONE customer; if multi-account becomes a feature, the module needs to enumerate existing chips and add to (not replace) them.

---

## Brand-verification flow (defensive layer)

When typing `customer_id` returns multiple matches across brands, iController auto-highlights the first match. We must NOT trust that — we must read the brand suffix and confirm.

```ts
// After typing customer_id and waiting for results:
const highlightedText = await page.$eval(
  "ul.select2-results .select2-result-selectable.select2-highlighted .select2-result-label",
  (el) => el.textContent?.trim() ?? "",
);
// e.g. "506909 - Vos Logistics Technical Department B.V. (Smeba Brandbeveiliging BV)"

// Parse the parenthesized brand suffix
const brandMatch = highlightedText.match(/\(([^)]+)\)\s*$/);
const annotatedBrand = brandMatch?.[1] ?? null;
// e.g. "Smeba Brandbeveiliging BV"

// Verify it matches the expected brand for this mailbox
if (!matchesExpectedBrand(annotatedBrand, mailbox_entity)) {
  // BAIL — do not click. Write email_labels with method='brand_mismatch'.
  return { ok: false, reason: "brand_mismatch", annotated: annotatedBrand };
}

// Brand verified — click to assign (auto-saves).
await page.click(
  "ul.select2-results .select2-result-selectable.select2-highlighted",
);
```

### Mailbox → expected brand pattern

Use regex matching (iController's brand strings vary slightly from internal `entity` slugs):

| `labeling_settings.entity` | iController brand suffix regex |
|---|---|
| `smeba` | `/smeba\s+brand/i` |
| `smeba-fire` | `/smeba\s*fire/i` |
| `sicli-noord` | `/sicli.*(north|noord)/i` |
| `sicli-sud` | `/sicli.*(south|sud|zuid)/i` |
| `berki` | `/berki/i` |

These can live as a constant `MAILBOX_BRAND_PATTERNS` in `web/lib/automations/debtor-email/mailboxes.ts` alongside the existing `ICONTROLLER_MAILBOXES` ID map.

---

## Screenshots

| File | Shows |
|---|---|
| `00-mailbox-list.png` | Smeba inbox — Accounts column empty for unlabeled rows |
| `01-detail-fresh.png` | Detail view with Accounts: "None selected" default state |
| `02-accounts-picker-open.png` | Picker open, empty input, ready for typeahead |
| `03-typeahead-filled.png` | Typed `506909` → 3 results, top match highlighted (Vos Logistics ... Smeba context) |

---

## Status

**Iteration 2 v2 SUCCESS.** All selectors confirmed. Wave 2 / Wave 3 Browserless module can be written from this contract; only the Save-flow behavior (caveat 1) requires a single live confirmation.

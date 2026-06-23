# Sales Stage 2 — loose ends before go-live

Stage 2 customer-resolution for sales-email runs **dry**
(`dry_run_config.stage_2_resolution=true`). The multi-brand wiring (brand_scope +
entity per mailbox, PR #130) is in place. Two items remain before flipping Stage 2
live for the sales mailboxes (verkoop@smeba / verkoop@fire-control / verkoop@berki /
sales.products@berki):

## 1. Per-brand ORDER number formats (recall gap)
`web/lib/automations/sales-email/lookups/order.ts` uses `ORDER_GENERIC =
/\border[a-z]*\s*[:#]?\s*(\d{4,8})/` — only catches "order NNNN" shaped tokens.
Real sales mail uses varied order/PO references per brand, e.g. (mined 2026-06-23):
`PO 103777`, `ordernummer B0005673`, `Opdracht A1633833/1`, `Inkooporder 4502220664`,
`Nieuwe opdracht 4383969`. These under-recall today (fail-closed — no wrong resolve,
just misses). Mine the order_no formats per brand and widen extraction; verify
against `nxt.dbo` order table + resolver_index `order_no` scope.
(Offerte formats: DONE — `(SB|BB|FI|IN)\d{5,6}`, NXT-verified, PR #130.)

## 2. SALES_TENANT_DOMAINS → registry
`web/lib/automations/sales-email/resolve-customer.ts` hardcodes
`SALES_TENANT_DOMAINS = ["smeba.nl", "berki.nl", "fire-control.nl"]` (D-07 internal
forwards). Move to a `swarms.tenant_domains` registry column so a new sales mailbox
is a registry row, not a code edit. (`ponytail:` comment marks the spot in code.)

## Before go-live also confirm
- First live Stage-2 run resolves correctly per brand (brand_scope_by_mailbox
  SB/FI/BB/IN → resolver_index scope filter).
- Flip `stage_2_resolution` to false (live) only after the above.

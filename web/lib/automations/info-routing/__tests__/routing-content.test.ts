// ROUTE-FIX regression — the Stage-3 routing classifier was fed the event
// payload's subject/body_text, which arrive EMPTY for info-routing, so the
// agent saw no content and returned `unrouted` for 100% of mail (confirmed
// live 2026-06-24: routing_debug raw reasoning = "body and subject are empty").
// selectRoutingContent picks the content the agent should classify: prefer the
// canonical emails row (body_full_text wider, body_text fallback), fall back to
// the event payload so debtor/sales stay byte-neutral.

import { describe, it, expect } from "vitest";
import { selectRoutingContent } from "../routing-content";

describe("selectRoutingContent", () => {
  it("prefers the DB row content when the event payload is empty (the prod bug)", () => {
    const out = selectRoutingContent(
      {
        subject: "Keuring brandblussers",
        body_text: "jaarlijkse keuring inplannen",
        body_full_text: null,
      },
      { subject: "", body_text: "" },
    );
    expect(out.subject).toBe("Keuring brandblussers");
    expect(out.body_text).toBe("jaarlijkse keuring inplannen");
  });
});

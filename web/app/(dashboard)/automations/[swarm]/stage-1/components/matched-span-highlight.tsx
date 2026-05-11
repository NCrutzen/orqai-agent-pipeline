// Phase 64-05 (SAFE-04). Wraps a verbatim email-body substring with the
// V7 amber-soft fill + wavy underline highlight defined in 64-UI-SPEC.md
// (color section). Server component — pure render, no client state.
//
// Behaviour:
//   - If `span` is null/empty OR not present in `body`, render `body` as-is.
//   - Else render three runs: pre-span text, highlighted span, post-span text.
//   - Only the FIRST occurrence is highlighted (the matched_span produced by
//     the Stage 0 LLM is a quote, not a regex; one quote = one match).
//
// Accessibility (WCAG 1.4.1): both colour (amber-soft fill) AND non-colour
// (wavy underline) carry the signal — colourblind-safe.

interface MatchedSpanHighlightProps {
  body: string;
  span: string | null;
}

export function MatchedSpanHighlight({ body, span }: MatchedSpanHighlightProps) {
  if (!span || span.length === 0) {
    return <span style={{ whiteSpace: "pre-wrap" }}>{body}</span>;
  }
  const idx = body.indexOf(span);
  if (idx < 0) {
    return <span style={{ whiteSpace: "pre-wrap" }}>{body}</span>;
  }
  const before = body.slice(0, idx);
  const matched = body.slice(idx, idx + span.length);
  const after = body.slice(idx + span.length);
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {before}
      <mark
        style={{
          background: "var(--v7-amber-soft)",
          color: "inherit",
          textDecoration: "underline wavy var(--v7-amber)",
          textUnderlineOffset: "3px",
          padding: "0 2px",
          borderRadius: "2px",
        }}
      >
        {matched}
      </mark>
      {after}
    </span>
  );
}

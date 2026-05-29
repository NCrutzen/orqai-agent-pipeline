"use client";

// Phase 04.1 — Plan 05 (P4.1-D-07 / P4.1-D-08 / P4.1-D-10). Thread modal
// mounted from EmailBodyBlock. Lazy-fetches conversation on open via
// getThreadMessages. Highlights ★ under review row. Per-modal Translate
// dropdown (scope: "thread"). 820px width per sketch 003 lock.
//
// V7 tokens only — NO raw hex. Stage-color left border via
// `active_stage_border_token` prop (e.g. `var(--v7-stage-1-accent)`).
//
// Hard separation (RFC stage-1-regex.md + stage-3-coordinator.md): this
// component reads raw email bodies, NOT classification vocab — safe.

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  getThreadMessages,
  type ThreadMessage,
} from "../actions/thread-actions";
import {
  translate,
  type TranslateResult,
} from "@/lib/translation/translate";

export interface ThreadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation_id: string;
  current_email_id: string;
  swarm_type: string;
  /** e.g. "var(--v7-stage-1-accent)" */
  active_stage_border_token: string;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; messages: ThreadMessage[] }
  | { status: "error"; reason: string };

const TARGET_LANGS = ["en", "nl", "fr", "de"] as const;

export function ThreadModal(props: ThreadModalProps) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [translation, setTranslation] = useState<TranslateResult | null>(null);
  const [translateFailed, setTranslateFailed] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const highlightedRef = useRef<HTMLElement | null>(null);

  // Lazy fetch on false → true transition. P4.1-D-07: NO hover prefetch.
  // Effect must NOT depend on `state` — otherwise the state.status flip from
  // "idle" → "loading" re-runs the effect, the cleanup sets cancelled=true,
  // and the resolved promise's setState gets discarded.
  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    setState((prev) => (prev.status === "idle" ? { status: "loading" } : prev));
    (async () => {
      const r = await getThreadMessages(
        props.conversation_id,
        props.current_email_id,
        props.swarm_type,
      );
      if (cancelled) return;
      if (r.ok) setState({ status: "loaded", messages: r.messages });
      else setState({ status: "error", reason: r.reason });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.conversation_id, props.current_email_id, props.swarm_type]);

  // Scroll the highlighted row into view on first load (anti-drift #2:
  // behavior: "auto" — no animation).
  useEffect(() => {
    if (state.status !== "loaded") return;
    const el = highlightedRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }, [state.status]);

  const handleTranslate = async (target_lang: string) => {
    if (state.status !== "loaded") return;
    const text = state.messages
      .map((m) => m.body_text ?? "")
      .join("\n\n---\n\n");
    const r = await translate({ text, target_lang, scope: "thread" });
    setTranslation(r);
    setShowOriginal(false);
    setTranslateFailed(!r.ok);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        data-testid="thread-modal"
        style={{ maxWidth: 820, width: "calc(100vw - var(--space-8))" }}
      >
        <DialogTitle>Conversation thread</DialogTitle>

        {/* Translate toolbar — thread scope */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "center",
            paddingBottom: "var(--space-2)",
          }}
        >
          <label>
            ⇄ Translate
            <select
              data-testid="thread-modal-translate"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void handleTranslate(e.target.value);
              }}
              style={{ marginLeft: "var(--space-2)" }}
            >
              <option value="" disabled>
                Pick language
              </option>
              {TARGET_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          {translateFailed && (
            <span data-testid="thread-modal-translate-fallback">
              translation not available
            </span>
          )}
          {translation?.ok && !showOriginal && (
            <button
              type="button"
              data-testid="thread-modal-show-original"
              onClick={() => setShowOriginal(true)}
            >
              Show original ↻
            </button>
          )}
        </div>

        {/* Body */}
        <div
          style={{
            maxHeight: "calc(100vh - var(--space-12))",
            overflowY: "auto",
          }}
        >
          {state.status === "loading" && (
            <div data-testid="thread-modal-loading">Loading thread…</div>
          )}
          {state.status === "error" && (
            <div data-testid="thread-modal-error">
              Could not load thread: {state.reason}
            </div>
          )}
          {state.status === "loaded" &&
            state.messages.map((msg) => (
              <article
                key={msg.id}
                ref={
                  msg.is_current
                    ? (el) => {
                        highlightedRef.current = el;
                      }
                    : undefined
                }
                data-testid={
                  msg.is_current
                    ? "thread-modal-current-message"
                    : "thread-modal-message"
                }
                style={{
                  borderLeft: msg.is_current
                    ? `3px solid ${props.active_stage_border_token}`
                    : "3px solid transparent",
                  padding: "var(--space-3)",
                  marginBottom: "var(--space-3)",
                  background: "var(--v7-panel-2)",
                  borderRadius: "var(--v7-radius-sm)",
                }}
              >
                {msg.is_current && (
                  <span data-testid="thread-modal-under-review-tag">
                    ★ under review
                  </span>
                )}
                <header style={{ fontSize: 12, color: "var(--v7-text-muted)" }}>
                  {msg.sender_name ?? msg.sender_email ?? "(unknown sender)"} ·{" "}
                  {msg.received_at}
                </header>
                <h4 style={{ fontSize: 14, fontWeight: 500 }}>
                  {msg.subject ?? "(no subject)"}
                </h4>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
                  {showOriginal || !translation?.ok
                    ? msg.body_text ?? "(no body available)"
                    : msg.body_text ?? "(no body available)"}
                </div>
              </article>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

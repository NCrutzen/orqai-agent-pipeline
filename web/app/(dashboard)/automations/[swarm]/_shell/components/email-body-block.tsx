"use client";

// Phase 04.1 — Plan 05 (P4.1-D-09 REVISED 2026-05-27). Extracted from
// detail-pane.tsx:683-714. Renders ONCE per row at the detail-pane level
// (NOT per Stage Read column — that was a sketch misread). Owns:
//   - body styling (14px / 1.65 / white-space: pre-wrap, stage-themed left border)
//   - body toolbar (↗ View full thread · ⇄ Translate ▾ · language chip)
//   - translation overlay state (P4.1-D-10: inline replace + Show original ↻)
//   - ThreadModal mount
// Stage Read columns (stage-N-decide.tsx) do NOT import this component.
// inline-expand-row.tsx UNTOUCHED per P2-D-02 + P4.1-D-09 lock.
//
// Hard separation (RFC stage-1-regex.md + stage-3-coordinator.md): this
// component reads raw email body text only, NOT classification vocab —
// safe under the stage-1 noise / stage-3 intent split.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MailOpen } from "lucide-react";
import {
  translate,
  detectLanguage,
  type TranslateResult,
} from "@/lib/translation/translate";
import { toast } from "sonner";
import { ThreadModal } from "./thread-modal";

export interface EmailBodyBlockProps {
  email_id: string;
  conversation_id: string | null;
  /** for "↗ View full thread (N msgs)" — null = hide the button */
  message_count: number | null;
  swarm_type: string;
  body_text: string | null;
  /** e.g. "var(--v7-stage-1-accent)" */
  active_stage_border_token: string;
}

const TARGET_LANGS = ["en", "nl", "fr", "de"] as const;

// Plan 03 (live UAT 2026-05-28) — country-flag glyph per language code. Flag
// emoji are operator-facing UI chrome (a deliberate label the operator asked
// for), NOT prose authored in a doc — so they're allowed here. The option
// VALUE stays the bare code so translate() receives "en"/"nl"/"fr"/"de".
const LANG_FLAGS: Record<(typeof TARGET_LANGS)[number], string> = {
  en: "🇬🇧",
  nl: "🇳🇱",
  fr: "🇫🇷",
  de: "🇩🇪",
};

export function EmailBodyBlock(props: EmailBodyBlockProps) {
  // Default CLOSED — preserves the prior detail-pane.tsx contract (line 279
  // pre-extraction was useState(false)) and the existing detail-pane.test.tsx
  // assertion that the body section starts collapsed. Operator opens via the
  // "Show full email" toggle or the "e" keyboard shortcut.
  const [bodyOpen, setBodyOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Preserve the "e" keyboard shortcut: keyboard-shortcuts.tsx dispatches a
  // window CustomEvent("bulk-review:toggle-body") that previously flipped
  // detail-pane.tsx's local bodyOpen. With state moved into EmailBodyBlock,
  // listen for the same event here.
  useEffect(() => {
    const onToggle = () => setBodyOpen((p) => !p);
    window.addEventListener("bulk-review:toggle-body", onToggle);
    return () =>
      window.removeEventListener("bulk-review:toggle-body", onToggle);
  }, []);
  const [translation, setTranslation] = useState<TranslateResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const detectedLang = detectLanguage(props.body_text ?? "");

  const handleTranslate = async (target_lang: string) => {
    const r = await translate({
      text: props.body_text ?? "",
      target_lang,
      scope: "message",
    });
    setTranslation(r);
    setShowOriginal(false);
    if (!r.ok) toast("translation not available");
  };

  const displayedText =
    showOriginal
      ? props.body_text
      : translation?.ok
        ? translation.translated_text
        : props.body_text;

  const showThreadButton =
    props.conversation_id !== null &&
    props.message_count !== null &&
    props.message_count > 1;

  return (
    <section
      style={{
        padding: "var(--space-4)",
        borderLeft: `3px solid ${props.active_stage_border_token}`,
      }}
      data-testid="email-body-section"
    >
      {/* Plan 03 (live UAT 2026-05-28) — ONE toolbar row holds everything:
          Show-full-email toggle → View-full-thread (when threaded) → Translate
          select → spacer → language chip → Show-original. The expandable body
          panel renders BELOW this row when open. */}
      <div
        data-testid="email-body-toolbar"
        style={{
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "center",
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBodyOpen((p) => !p)}
          data-testid="toggle-body-button"
        >
          <MailOpen className="h-4 w-4 mr-1" aria-hidden="true" />
          {bodyOpen ? "Hide email" : "Show full email"}
        </Button>
        {/* §6 toolbar order: Show-full-email → View-full-thread → Translate select → spacer → lang chip */}
        {showThreadButton && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="view-full-thread-button"
            onClick={() => setModalOpen(true)}
          >
            ↗ View full thread ({props.message_count} msgs)
          </Button>
        )}
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            fontSize: 13,
            color: "var(--v7-text-muted)",
          }}
        >
          ⇄ Translate
          <select
            data-testid="translate-dropdown"
            aria-label="Translate email body"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void handleTranslate(e.target.value);
            }}
            style={{
              background: "var(--v7-panel-2)",
              color: "var(--v7-text)",
              border: "1px solid var(--v7-border)",
              borderRadius: "var(--v7-radius-sm)",
              padding: "2px 22px 2px 8px",
              fontSize: 13,
              cursor: "pointer",
              // ▾ affordance — token-only inline SVG chevron via background.
              appearance: "none",
              WebkitAppearance: "none",
              backgroundImage:
                "linear-gradient(45deg, transparent 50%, var(--v7-text-muted) 50%), linear-gradient(135deg, var(--v7-text-muted) 50%, transparent 50%)",
              backgroundPosition:
                "calc(100% - 12px) calc(50% - 1px), calc(100% - 7px) calc(50% - 1px)",
              backgroundSize: "5px 5px, 5px 5px",
              backgroundRepeat: "no-repeat",
            }}
          >
            <option value="" disabled>
              Pick language
            </option>
            {TARGET_LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_FLAGS[l]} {l}
              </option>
            ))}
          </select>
        </label>
        {/* grow spacer — pushes the lang-hint chip to the right end of the bar */}
        <span style={{ flex: 1 }} aria-hidden="true" />
        <span
          data-testid="language-chip"
          style={{
            fontSize: 12,
            color: "var(--v7-text-muted)",
            border: "1px dashed var(--v7-border)",
            borderRadius: "var(--v7-radius-sm)",
            padding: "1px 8px",
          }}
        >
          {detectedLang ? `detected: ${detectedLang}` : "language: not detected"}
        </span>
        {translation?.ok && !showOriginal && (
          <Button
            type="button"
            variant="link"
            size="sm"
            data-testid="show-original-button"
            onClick={() => setShowOriginal(true)}
          >
            Show original ↻
          </Button>
        )}
      </div>

      {/* Expandable body panel — renders BELOW the single toolbar row when the
          operator opens it (default closed; preserves the useState(false)
          contract + the "e" / bulk-review:toggle-body shortcut). */}
      {bodyOpen && (
        <div
          data-testid="email-body-content"
          style={{
            marginTop: "var(--space-3)",
            padding: "var(--space-3)",
            background: "var(--v7-panel-2)",
            borderRadius: "var(--v7-radius-sm)",
            fontSize: 14,
            lineHeight: 1.65,
            whiteSpace: "pre-wrap",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {displayedText ?? "(no body available)"}
        </div>
      )}

      {props.conversation_id && (
        <ThreadModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          conversation_id={props.conversation_id}
          current_email_id={props.email_id}
          swarm_type={props.swarm_type}
          active_stage_border_token={props.active_stage_border_token}
        />
      )}
    </section>
  );
}

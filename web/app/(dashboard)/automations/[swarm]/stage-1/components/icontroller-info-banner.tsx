"use client";

/**
 * Phase 71-04 (CONTEXT D-15). Post-submit iController info banner.
 *
 * Implements UI-SPEC §Stage-4 info banner — only renders when:
 *   - The just-submitted override was Stage 3 OR Stage 4, AND
 *   - An iController draft exists for the email (parent decides).
 *
 * Copy verbatim from UI-SPEC:
 *   "Override recorded — please update the draft in iController separately.
 *    We didn't auto-modify draft #{iC_id} because operator workflows vary."
 *
 * Visual: --v7-blue-soft bg, --v7-blue border, ⓘ glyph, dismissible.
 */

interface IControllerInfoBannerProps {
  iControllerDraftId: string;
  onDismiss: () => void;
}

export function IControllerInfoBanner({
  iControllerDraftId,
  onDismiss,
}: IControllerInfoBannerProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[var(--v7-radius-sm)] px-4 py-3 border"
      style={{
        background: "var(--v7-blue-soft)",
        borderColor: "var(--v7-blue)",
      }}
    >
      <span
        aria-hidden="true"
        className="text-[16px] leading-[1.3] shrink-0"
        style={{ color: "var(--v7-blue)" }}
      >
        ⓘ
      </span>
      <p
        className="text-[13px] leading-[1.5] flex-1"
        style={{ color: "var(--v7-text)" }}
      >
        Override recorded — please update the draft in iController separately.
        We didn&apos;t auto-modify draft #{iControllerDraftId} because operator
        workflows vary.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss banner"
        className="text-[12px] leading-[1.3] shrink-0 px-2 py-0.5 rounded-[var(--v7-radius-pill)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          color: "var(--v7-muted)",
          outlineColor: "var(--v7-brand-secondary)",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

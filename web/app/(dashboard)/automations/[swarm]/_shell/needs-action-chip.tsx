"use client";

// Phase 82.4 Plan 06 — Two URL-param-driven toggle chips for the per-stage
// Option Z list surface (Stages 0/1/2/3).
//
// These chips are presentation primitives: they accept `active` + `onToggle`
// and render the V7 pill styling. URL-param plumbing (parsing, router.replace,
// resetting `before` on toggle) lives in `stage-list-chips.tsx` — the page
// boundary mounts that wrapper.
//
// Default OFF on every tab (audit-first culture per 82.4-CONTEXT.md): the
// operator must opt in to inbox-only view. Both chips default OFF; no chip
// is "preselected".
//
// Hard-separation lock: this file does not import any swarm registry helper.
// The same chip ships for every stage on every swarm.

interface ToggleChipProps {
  active: boolean;
  onToggle: () => void;
}

function ToggleChip({
  active,
  onToggle,
  label,
  testId,
}: ToggleChipProps & { label: string; testId: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      data-testid={testId}
      className="inline-flex items-center gap-2 shrink-0 px-3 py-1.5 transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: active
          ? "var(--v7-brand-secondary-soft)"
          : "var(--v7-panel-2)",
        borderColor: active
          ? "var(--v7-brand-secondary)"
          : "var(--v7-line)",
        borderWidth: "1px",
        borderStyle: "solid",
        borderRadius: "var(--v7-radius-pill)",
        color: active ? "var(--v7-brand-secondary)" : "var(--v7-text)",
        outlineColor: "var(--v7-brand-secondary)",
        fontSize: "13px",
        lineHeight: "1.3",
      }}
    >
      {label}
    </button>
  );
}

export function NeedsActionChip(props: ToggleChipProps) {
  return (
    <ToggleChip {...props} label="Needs action" testId="needs-action-chip" />
  );
}

export function MineOnlyChip(props: ToggleChipProps) {
  return (
    <ToggleChip {...props} label="My feedback only" testId="mine-only-chip" />
  );
}

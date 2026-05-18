/**
 * Phase 71 — recipient brand-dot colour mapping.
 *
 * Deterministic, registry-driven (UI-SPEC §Color). NOT hash-derived.
 * New brands MUST be added here at registry-INSERT time; CI gate
 * `npm run codegen && git diff --exit-code` catches drift on the
 * Entity literal-union side.
 *
 * Returns a CSS var name (string), NOT a hex value — token-only chrome
 * per UI-SPEC §Design System.
 */
import type { Entity } from "../automations/debtor-email/coordinator/entity.generated";

const BRAND_COLOR_TOKEN: Record<string, string> = {
  smeba: "--v7-lime",
  "smeba-fire": "--v7-pink",
  berki: "--v7-amber",
  "sicli-noord": "--v7-blue",
  "sicli-sud": "--v7-teal",
};

const FALLBACK_TOKEN = "--v7-muted";

export function brandColorToken(brand: Entity | string | null | undefined): string {
  if (!brand) return FALLBACK_TOKEN;
  return BRAND_COLOR_TOKEN[brand] ?? FALLBACK_TOKEN;
}

// Phase 82.7.1 D-07 — brand display names colocated with BRAND_COLOR_TOKEN
// for single-source-of-truth. Used by the brand-swatch tooltip in
// predicted-row.tsx (E-03). Codes match project_brand_scope.md (5 Benelux
// brands; iccafe/iccafe-france deferred). The Entity literal-union
// codegen gate (npm run codegen && git diff --exit-code) catches drift
// between this map and the generated brand registry.
const BRAND_DISPLAY_NAME: Record<string, string> = {
  smeba: "Smeba",
  "smeba-fire": "Smeba-Fire",
  berki: "Berki",
  "sicli-noord": "Sicli-Noord",
  "sicli-sud": "Sicli-Sud",
};

const FALLBACK_DISPLAY_NAME = "Unknown brand";

export function brandDisplayName(brand: Entity | string | null | undefined): string {
  if (!brand) return FALLBACK_DISPLAY_NAME;
  return BRAND_DISPLAY_NAME[brand] ?? FALLBACK_DISPLAY_NAME;
}

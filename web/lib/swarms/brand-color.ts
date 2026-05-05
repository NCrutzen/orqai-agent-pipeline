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

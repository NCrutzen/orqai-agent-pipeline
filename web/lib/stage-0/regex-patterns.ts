/**
 * Phase 64 SAFE-01 (D-04). Prompt-injection regex seed list.
 *
 * Sources:
 *   - OWASP LLM Prompt Injection Prevention Cheat Sheet (2025)
 *   - Anthropic prompt-injection-defenses guide
 *   - D-04: Dutch-language seed (negeer / vergeet / doe alsof) — debiteuren@smeba.nl
 *     traffic is overwhelmingly Dutch; English-only patterns would miss the
 *     primary attack surface.
 *
 * Promotion ladder for new patterns lives in Phase 71 (graduated automation
 * hooks). This file is the bootstrap seed; do NOT add new patterns here without
 * audit-trail evidence in promotion-candidate logs.
 *
 * Pattern names are stable identifiers consumed by Plan 01 RED tests and by
 * downstream telemetry (`automation_runs.result.matched_pattern`). Renaming a
 * pattern is a breaking change.
 */

export interface InjectionPattern {
  name: string;
  pattern: RegExp;
}

export const INJECTION_PATTERNS: InjectionPattern[] = [
  // English imperative-override family
  {
    name: "ignore_previous",
    pattern: /\bignore\s+(?:all\s+)?(?:previous|prior|above|the\s+above)\b/i,
  },
  {
    name: "disregard_above",
    pattern: /\bdisregard\s+(?:all\s+)?(?:previous|prior|above|the\s+above)\b/i,
  },
  {
    name: "you_are_now",
    pattern: /\byou\s+are\s+now\s+(?:a|an|the)?\s*\w+/i,
  },
  // System-prompt-leak family
  {
    name: "reveal_system_prompt",
    pattern: /\b(?:reveal|show|print|expose|leak|repeat)\s+(?:your\s+|the\s+)?(?:system|hidden|initial)\s+prompt\b/i,
  },
  {
    name: "developer_message",
    pattern: /\b(?:developer|admin|root)\s+(?:message|instruction|mode|override)\b/i,
  },
  // Dutch imperative-override family (D-04)
  {
    name: "negeer_instructies",
    pattern: /\bnegeer\s+(?:alle\s+|eerdere\s+|bovenstaande\s+)?instructies?\b/i,
  },
  {
    name: "vergeet_alles",
    pattern: /\bvergeet\s+(?:alles|alle\s+instructies)\b/i,
  },
  {
    name: "doe_alsof",
    pattern: /\bdoe\s+alsof\s+(?:je|u)\s+\w+/i,
  },
  // Role / tool impersonation
  {
    name: "fake_role_marker",
    pattern: /(?:^|\n)\s*(?:system|assistant|developer|user)\s*:\s*/i,
  },
  {
    name: "tool_invocation_attempt",
    pattern: /<\s*(?:tool[_-]?call|function[_-]?call|invoke)\b[^>]*>/i,
  },
];

// Phase 04.1 Plan 01 — translation provider stub tests.
// Fails-closed contract per P4.1-D-05 / P4.1-D-06.

import { describe, it, expect } from "vitest";

import {
  translate,
  detectLanguage,
  type TranslateInput,
  type TranslateResult,
} from "@/lib/translation/translate";

describe("translate() — fails-closed stub", () => {
  it("returns { ok: false, reason: 'not_configured' } for a typical message-scope input", async () => {
    const input: TranslateInput = {
      text: "Hallo",
      target_lang: "en",
      scope: "message",
    };
    const result = await translate(input);
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns { ok: false, reason: 'not_configured' } for empty text + thread scope", async () => {
    const input: TranslateInput = {
      text: "",
      target_lang: "nl",
      scope: "thread",
    };
    const result = await translate(input);
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("discriminated-union: ok:true branch carries translated_text, source_lang, provider (compile-only)", () => {
    // Compile-time assertion via a discriminating switch over an unnarrowed
    // TranslateResult parameter. If the union shape regresses, tsc fails this file.
    function _shape(r: TranslateResult): void {
      switch (r.ok) {
        case true: {
          const _t: string = r.translated_text;
          const _s: string | null = r.source_lang;
          const _p: string = r.provider;
          void _t;
          void _s;
          void _p;
          break;
        }
        case false: {
          const _r:
            | "not_configured"
            | "unsupported_lang"
            | "rate_limited"
            | "provider_error" = r.reason;
          void _r;
          break;
        }
      }
    }
    void _shape;
    expect(true).toBe(true);
  });
});

describe("detectLanguage() — fails-closed stub", () => {
  it("returns null for non-empty input", () => {
    expect(detectLanguage("Hallo wereld")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(detectLanguage("")).toBeNull();
  });
});

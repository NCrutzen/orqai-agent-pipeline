// Plan 02-03 Task 2 step (b) — transcribeViaScribe via ElevenLabs Scribe.
//
// Recommended Whisper transport per plan-checker W-4 / Task 1 decision
// (Option A). CLAUDE.md confirms `@elevenlabs/elevenlabs-js` is the canonical
// voice SDK (`ELEVENLABS_API_KEY` already provisioned in Vercel env). Orq.ai
// catalog has only chat+embed today — direct-Orq Whisper is NOT viable in
// 2026-05.
//
// SAFETY-04 / B-5: this module calls validateVideoUrlHost(url) BEFORE any
// network I/O. SSRF rejection throws TranscribeError("rejected_safety_ssrf")
// which the Stage 2 wrapper maps to a pipeline_events `decision='rejected_safety_ssrf'`
// row (non-fatal abort — Plans 02-04/02-05 short-circuit on the resulting
// quarantine_state).
//
// I18N-01 / I18N-05: `normalizeSubmitterLocale` passes through nl/en/fr;
// anything else falls back to 'en' with `fallback_used=true` and an explicit
// console.warn so the dashboard captures both the detected code and the
// fallback.
//
// SDK loading: we use dynamic `await import("@elevenlabs/elevenlabs-js")`
// inside the function body. Rationale:
//   1. The dep is not yet in package.json (the planner's threat-model T-02-SC
//      claim that it's already installed turned out to be a stale assumption).
//      The live smoke in Task 4 is gated on a human-verify checkpoint that
//      instructs the operator to run `npm i @elevenlabs/elevenlabs-js`.
//   2. Dynamic import keeps static type-check (`tsc --noEmit`) passing today
//      AND lets vitest mock the module via `vi.doMock`.
//   3. Cold-start cost is one-time per Inngest worker process.

import { validateVideoUrlHost } from "./url-allowlist";

// ElevenLabs Scribe pricing as of 2026-05: ~USD $0.40/hr. We bill in cents,
// numeric(10,4) precision on pipeline_events.cost_cents (W-1 fix). 30s clip ≈
// $0.0033 ≈ 0.3333¢ — keep four decimal places to avoid floor-to-zero.
const SCRIBE_USD_PER_SECOND = 0.4 / 3600; // $/sec
const USD_TO_CENTS = 100;
const FALLBACK_LOCALE = "en";
const ALLOWED_LOCALES = new Set(["nl", "en", "fr"]);

export class TranscribeError extends Error {
  readonly code: string;
  readonly http_status: number | null;
  constructor(
    code: string,
    opts?: { cause?: unknown; http_status?: number | null; message?: string },
  ) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "TranscribeError";
    this.code = code;
    this.http_status = opts?.http_status ?? null;
  }
}

export interface TranscribeResult {
  text: string;
  language: string;
  language_probability: number | null;
  cost_cents: number;
}

export interface NormalizedLocale {
  locale: "nl" | "en" | "fr";
  fallback_used: boolean;
  original: string;
}

/**
 * Normalize a Scribe-returned ISO-639-1 language code to a `submitter_locale`
 * enum value `{nl|en|fr}`. Anything else falls back to `'en'` per I18N-05.
 */
export function normalizeSubmitterLocale(language: string): NormalizedLocale {
  const original = language ?? "";
  const lower = original.toString().toLowerCase().trim();
  if (ALLOWED_LOCALES.has(lower)) {
    return {
      locale: lower as "nl" | "en" | "fr",
      fallback_used: false,
      original,
    };
  }
  // I18N-05: emit a warn-level signal carrying both original and fallback.
  // Plan 02-03 wires the same fields into pipeline_events.decision_details so
  // the dashboard sees this too.
  console.warn(
    `[support-tickets/transcribe] submitter_locale fallback: detected='${original}' fallback='${FALLBACK_LOCALE}'`,
  );
  return { locale: FALLBACK_LOCALE as "en", fallback_used: true, original };
}

interface ScribeConvertResult {
  text: string;
  language_code: string;
  language_probability?: number;
}

interface ScribeClientShape {
  speechToText: {
    convert: (args: { file: unknown; modelId: string }) => Promise<ScribeConvertResult>;
  };
}

// SDK loading. The static module specifier is indirected through a runtime
// variable so Vite's import-analysis (vitest's transform pass) does not try
// to resolve the package at file-load time. Vitest's `vi.doMock` resolves
// AFTER transform; without this indirection vitest fails on
// `Failed to resolve import "@elevenlabs/elevenlabs-js"` because the dep is
// not yet installed (live-smoke checkpoint in Task 4 installs it).
//
// Typed via a structural shape so this file compiles even without the SDK
// installed.
const ELEVENLABS_MODULE_ID = "@elevenlabs/elevenlabs-js";

async function loadScribeClient(apiKey: string): Promise<ScribeClientShape> {
  // Indirect dynamic-import — Vite cannot statically resolve a variable specifier.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(/* @vite-ignore */ ELEVENLABS_MODULE_ID)) as any;
  const ElevenLabsClient = mod.ElevenLabsClient ?? mod.default?.ElevenLabsClient;
  if (!ElevenLabsClient) {
    throw new TranscribeError("elevenlabs_sdk_missing", {
      message:
        "Failed to load @elevenlabs/elevenlabs-js — has it been installed in this environment?",
    });
  }
  return new ElevenLabsClient({ apiKey });
}

export interface TranscribeArgs {
  videoUrl: string;
  /**
   * Optional pre-known clip duration (seconds). When omitted, we leave
   * `cost_cents` at the minimum (one-second equivalent) — Stage 2 will refine
   * once ffprobe-derived metadata is available (Plan 02-04).
   */
  durationSeconds?: number;
  env: {
    ELEVENLABS_API_KEY?: string;
  };
}

/**
 * Transcribe a user-submitted video via ElevenLabs Scribe.
 *
 * Order of operations (DO NOT reorder):
 *   1. Validate args (videoUrl + ELEVENLABS_API_KEY).
 *   2. SSRF gate (validateVideoUrlHost) — rejects internal IPs / non-allow-listed hosts.
 *   3. Fetch the SDK (dynamic import).
 *   4. Call `client.speechToText.convert({ file: <signed-url-as-string>, modelId: 'scribe_v1' })`.
 *   5. Compute cost_cents (numeric(10,4) precision).
 *
 * Throws `TranscribeError` on any failure; the wrapper in
 * stage-2-enrichment.ts maps the `.code` field to the appropriate
 * `pipeline_events.decision`.
 */
export async function transcribeViaScribe(
  args: TranscribeArgs,
): Promise<TranscribeResult> {
  // (1) Argument validation — explicit, deterministic.
  if (args.videoUrl == null || typeof args.videoUrl !== "string" || args.videoUrl.length === 0) {
    throw new TranscribeError("video_storage_url_missing", {
      message: "transcribeViaScribe: videoUrl is null/empty",
    });
  }
  const apiKey = args.env?.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new TranscribeError("missing_credentials", {
      message: "ELEVENLABS_API_KEY is not configured for this runtime",
    });
  }

  // (2) SSRF gate (plan-checker B-5). Throws BEFORE any network I/O.
  if (!validateVideoUrlHost(args.videoUrl)) {
    throw new TranscribeError("rejected_safety_ssrf", {
      message: `rejected_safety_ssrf: video_storage_url host failed allow-list check`,
    });
  }

  // (3) Load SDK lazily.
  const client = await loadScribeClient(apiKey);

  // (4) Scribe call. We pass the signed URL as `file` — Scribe's API accepts
  // either a Blob or a remote URL string. The 45s AbortController timeout is
  // an Inngest-level concern (CLAUDE.md timeout discipline); we surface
  // sub-call timeouts via the SDK's internal handling and re-wrap any error.
  let raw: ScribeConvertResult;
  try {
    raw = await client.speechToText.convert({
      file: args.videoUrl,
      modelId: "scribe_v1",
    });
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new TranscribeError("transcribe_transport_failed", {
      cause,
      message: `ElevenLabs Scribe call failed: ${msg}`,
    });
  }

  if (!raw || typeof raw.text !== "string" || typeof raw.language_code !== "string") {
    throw new TranscribeError("transcribe_invalid_response", {
      message: `Scribe returned unexpected shape: ${JSON.stringify(raw)}`,
    });
  }

  // (5) Cost calc. Floor to 0.0001¢ resolution (numeric(10,4) precision).
  const durSec = Math.max(1, Math.round(args.durationSeconds ?? 1));
  const usd = durSec * SCRIBE_USD_PER_SECOND;
  const cents = usd * USD_TO_CENTS;
  // Round to 4 decimal places to fit numeric(10,4).
  const cost_cents = Math.round(cents * 10000) / 10000;

  return {
    text: raw.text,
    language: raw.language_code,
    language_probability: typeof raw.language_probability === "number" ? raw.language_probability : null,
    cost_cents,
  };
}

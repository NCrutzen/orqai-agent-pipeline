// Plan 02-03 Task 2 step (b) — transcribe.ts tests.
//
// Tests the pure handler `transcribeViaScribe` and the pure helper
// `normalizeSubmitterLocale`. ElevenLabs SDK is mocked via `vi.doMock` so
// tests pass without the dep installed (the live smoke Task 4 is where the
// SDK actually fires).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIG_KEY = process.env.ELEVENLABS_API_KEY;
const ORIG_ALLOWED = process.env.SUPPORT_VIDEO_ALLOWED_HOSTS;

const ORIG_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
  delete process.env.SUPPORT_VIDEO_ALLOWED_HOSTS;
  vi.resetModules();
  // Mock global fetch so transcribe.ts's fetch(videoUrl) call doesn't try to
  // resolve abc.supabase.co (DNS would fail in unit tests). The SDK convert
  // is mocked separately via vi.doMock per test, so the Blob payload we
  // return here is never actually inspected.
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    blob: async () => new Blob(["fake-audio"], { type: "audio/mpeg" }),
  })) as unknown as typeof fetch;
});
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = ORIG_KEY;
  if (ORIG_ALLOWED === undefined) delete process.env.SUPPORT_VIDEO_ALLOWED_HOSTS;
  else process.env.SUPPORT_VIDEO_ALLOWED_HOSTS = ORIG_ALLOWED;
  vi.doUnmock("@elevenlabs/elevenlabs-js");
  globalThis.fetch = ORIG_FETCH;
});

function mockScribe(result: {
  text: string;
  language_code: string;
  language_probability?: number;
}) {
  const convert = vi.fn(async () => result);
  vi.doMock("@elevenlabs/elevenlabs-js", () => ({
    ElevenLabsClient: class {
      speechToText = { convert };
    },
  }));
  return { convert };
}

describe("normalizeSubmitterLocale", () => {
  it("passes through nl/en/fr (case-insensitive)", async () => {
    const { normalizeSubmitterLocale } = await import("../transcribe");
    expect(normalizeSubmitterLocale("nl")).toEqual({
      locale: "nl",
      fallback_used: false,
      original: "nl",
    });
    expect(normalizeSubmitterLocale("EN")).toEqual({
      locale: "en",
      fallback_used: false,
      original: "EN",
    });
    expect(normalizeSubmitterLocale("Fr")).toEqual({
      locale: "fr",
      fallback_used: false,
      original: "Fr",
    });
  });

  it("falls back to 'en' for any other detected language (I18N-05)", async () => {
    const { normalizeSubmitterLocale } = await import("../transcribe");
    expect(normalizeSubmitterLocale("de")).toEqual({
      locale: "en",
      fallback_used: true,
      original: "de",
    });
    expect(normalizeSubmitterLocale("zh")).toEqual({
      locale: "en",
      fallback_used: true,
      original: "zh",
    });
    expect(normalizeSubmitterLocale("")).toEqual({
      locale: "en",
      fallback_used: true,
      original: "",
    });
  });
});

describe("transcribeViaScribe", () => {
  it("happy NL: returns {text, language: 'nl', cost_cents}", async () => {
    mockScribe({
      text: "Hallo, dit is een test",
      language_code: "nl",
      language_probability: 0.98,
    });
    const { transcribeViaScribe } = await import("../transcribe");
    const res = await transcribeViaScribe({
      videoUrl: "https://abc.supabase.co/storage/v1/object/sign/x.mp4?t=1",
      durationSeconds: 30,
      env: { ELEVENLABS_API_KEY: "test-elevenlabs-key" },
    });
    expect(res.text).toBe("Hallo, dit is een test");
    expect(res.language).toBe("nl");
    expect(typeof res.cost_cents).toBe("number");
    expect(res.cost_cents).toBeGreaterThan(0);
  });

  it("happy EN: returns {text, language: 'en'}", async () => {
    mockScribe({
      text: "Hello, this is a test",
      language_code: "en",
      language_probability: 0.99,
    });
    const { transcribeViaScribe } = await import("../transcribe");
    const res = await transcribeViaScribe({
      videoUrl: "https://abc.supabase.co/storage/v1/object/sign/y.mp4?t=2",
      durationSeconds: 30,
      env: { ELEVENLABS_API_KEY: "test-elevenlabs-key" },
    });
    expect(res.language).toBe("en");
    expect(res.text).toBe("Hello, this is a test");
  });

  it("transport failure: wraps SDK rejection in TranscribeError with .cause", async () => {
    const convert = vi.fn(async () => {
      throw new Error("SDK 500");
    });
    vi.doMock("@elevenlabs/elevenlabs-js", () => ({
      ElevenLabsClient: class {
        speechToText = { convert };
      },
    }));
    const { transcribeViaScribe, TranscribeError } = await import("../transcribe");
    await expect(
      transcribeViaScribe({
        videoUrl: "https://abc.supabase.co/storage/v1/object/sign/z.mp4",
        durationSeconds: 30,
        env: { ELEVENLABS_API_KEY: "test-elevenlabs-key" },
      }),
    ).rejects.toBeInstanceOf(TranscribeError);
  });

  it("rejects null videoUrl with TranscribeError before SDK call", async () => {
    const { convert } = mockScribe({ text: "x", language_code: "en" });
    const { transcribeViaScribe, TranscribeError } = await import("../transcribe");
    await expect(
      transcribeViaScribe({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        videoUrl: null as any,
        durationSeconds: 30,
        env: { ELEVENLABS_API_KEY: "test-elevenlabs-key" },
      }),
    ).rejects.toBeInstanceOf(TranscribeError);
    expect(convert).not.toHaveBeenCalled();
  });

  it("SSRF gate fires BEFORE SDK call (plan-checker B-5)", async () => {
    const { convert } = mockScribe({ text: "x", language_code: "en" });
    const { transcribeViaScribe } = await import("../transcribe");
    await expect(
      transcribeViaScribe({
        videoUrl: "http://169.254.169.254/foo",
        durationSeconds: 30,
        env: { ELEVENLABS_API_KEY: "test-elevenlabs-key" },
      }),
    ).rejects.toThrowError(/rejected_safety_ssrf/);
    expect(convert).not.toHaveBeenCalled();
  });

  it("missing ELEVENLABS_API_KEY → TranscribeError, no SDK call", async () => {
    const { convert } = mockScribe({ text: "x", language_code: "en" });
    const { transcribeViaScribe } = await import("../transcribe");
    await expect(
      transcribeViaScribe({
        videoUrl: "https://abc.supabase.co/storage/v1/object/sign/x.mp4",
        durationSeconds: 30,
        env: { ELEVENLABS_API_KEY: undefined },
      }),
    ).rejects.toThrowError(/ELEVENLABS_API_KEY/);
    expect(convert).not.toHaveBeenCalled();
  });
});

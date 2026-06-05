// Phase 116-02 Task 2 — swarm-agnostic attachment extraction service.
//
// PURE transform: bytes + contentType + caps in, { status, text } out.
//   - NO Inngest, NO swarm literal, NO registry read, NO Storage, NO DB.
//   - The worker (Plan 04) owns Graph download, Storage upload, and the row
//     write; this module only turns bytes into text + a coded status.
//
// Pipeline:
//   1. Size cap BEFORE any parse (V12 / mirror extract-frames Content-Length
//      gate) → skipped_cap.
//   2. PDF → unpdf text-layer (getDocumentProxy + extractText). Non-empty →
//      extracted. Empty/whitespace → vision fallback (scanned PDF).
//      Image → straight to vision. Anything else → unsupported (D-10).
//   3. unpdf parse wrapped in try/catch → extraction_failed, never propagates
//      (D-03 fail-soft).
//   4. Vision fallback via the Orq.ai Router (`@orq-ai/node` SDK,
//      /v2/router/chat/completions) with `image_url` content parts — the
//      detect-system.ts precedent. NEVER a direct LLM API key.
//   5. Extracted text over maxExtractedChars → skipped_cap (never silent
//      truncation — Pitfall 4 / caps directive).
//
// CLAUDE.md compliance: vision goes through Orq.ai Router only; MODEL_ID is the
// same list_models-validated catalog id detect-system.ts already uses live.

import { extractText, getDocumentProxy } from "unpdf";

// Vision-capable, list_models-validated catalog id — reused verbatim from
// support-tickets/detect-system.ts (already live in this repo). Do NOT invent
// an id; PATCH/Router accept unknown ids silently (CLAUDE.md Orq rule).
const VISION_MODEL_ID = "anthropic/claude-sonnet-4-5-20250929" as const;
const VISION_TIMEOUT_MS = 45_000;

const PDF_CONTENT_TYPE = "application/pdf";
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

/** Coded fail-soft error class — mirrors FrameExtractError verbatim so each
 *  failure maps to an `extraction_status` value. */
export class AttachmentExtractError extends Error {
  readonly code: string;
  constructor(code: string, opts?: { cause?: unknown; message?: string }) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "AttachmentExtractError";
    this.code = code;
  }
}

export type ExtractionStatus =
  | "extracted"
  | "needs_vision"
  | "extraction_failed"
  | "skipped_cap"
  | "unsupported";

export interface AttachmentCaps {
  /** Max raw bytes before we even download/parse (DoS guard). */
  maxSizeBytes: number;
  /** Max PDF pages to render for vision (cost guard). */
  maxVisionPages: number;
  /** Max extracted chars — over this → skipped_cap (no silent truncation). */
  maxExtractedChars: number;
}

export interface ExtractAttachmentInput {
  bytes: ArrayBuffer;
  contentType: string;
  filename?: string;
  caps: AttachmentCaps;
}

export interface ExtractAttachmentResult {
  status: ExtractionStatus;
  text: string;
}

/**
 * Extract text from a single attachment. Pure, swarm-agnostic, fail-soft:
 * every failure path returns a coded status; this function never throws to
 * its caller (D-03 — the funnel must never stall on a bad attachment).
 */
export async function extractAttachment(
  input: ExtractAttachmentInput,
): Promise<ExtractAttachmentResult> {
  const { bytes, contentType, caps } = input;

  // (1) Size cap BEFORE any parse / download decision.
  if (bytes.byteLength > caps.maxSizeBytes) {
    return { status: "skipped_cap", text: "" };
  }

  const ct = (contentType ?? "").toLowerCase().split(";")[0].trim();

  let text: string;

  if (ct === PDF_CONTENT_TYPE) {
    // (2) PDF → unpdf text-layer first.
    let layerText: string;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const out = await extractText(pdf, { mergePages: true });
      // unpdf returns { text } where text is string | string[] depending on
      // mergePages; normalise to a string.
      layerText = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } catch {
      // (3) corrupt / malicious PDF → fail-soft, never propagate.
      return { status: "extraction_failed", text: "" };
    }

    if (layerText.trim().length > 0) {
      text = layerText;
    } else {
      // Empty text-layer → scanned PDF → vision fallback.
      const vision = await runVisionFallback(bytes, ct);
      if (vision.status !== "extracted") return vision;
      text = vision.text;
    }
  } else if (IMAGE_CONTENT_TYPES.has(ct)) {
    // (2) Image → straight to vision (no unpdf).
    const vision = await runVisionFallback(bytes, ct);
    if (vision.status !== "extracted") return vision;
    text = vision.text;
  } else {
    // (2) docx/xlsx/reference/item attachments — no supported extractor (D-10).
    return { status: "unsupported", text: "" };
  }

  // (5) Output cap — never silent truncation.
  if (text.length > caps.maxExtractedChars) {
    return { status: "skipped_cap", text: "" };
  }

  return { status: "extracted", text };
}

/**
 * Vision fallback (D-09): transcribe a scanned PDF / image via the Orq.ai
 * Router. Bytes flow in as a base64 data: URL `image_url` content part — the
 * detect-system.ts invocation shape. Wrapped in try/catch → extraction_failed
 * on any error. NEVER a direct LLM API key.
 */
async function runVisionFallback(
  bytes: ArrayBuffer,
  contentType: string,
): Promise<ExtractAttachmentResult> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) {
    // Missing Router credential is an extraction failure, not a throw.
    return { status: "extraction_failed", text: "" };
  }

  try {
    const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;

    const body = {
      model: VISION_MODEL_ID,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe all text visible in this document/image verbatim. Output only the transcribed text, no commentary.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      metadata: { user_id: "attachments-extract-vision" },
    };

    // @orq-ai/node SDK — raw HTTP to /v2/router/chat/completions returns 404;
    // the SDK routes internally (detect-system.ts precedent).
    const { Orq } = await import("@orq-ai/node");
    const orq = new Orq({ apiKey, timeoutMs: VISION_TIMEOUT_MS });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const router = (orq as any).router;
    const completionFn =
      router?.chatCompletions?.create ??
      router?.chat?.completions?.create ??
      router?.completions?.create;
    if (typeof completionFn !== "function") {
      return { status: "extraction_failed", text: "" };
    }
    const json = (await completionFn.call(
      router?.chatCompletions ?? router?.chat?.completions ?? router?.completions,
      body,
    )) as { choices?: Array<{ message?: { content?: string } }> };

    const transcribed = json.choices?.[0]?.message?.content ?? "";
    if (transcribed.trim().length === 0) {
      return { status: "extraction_failed", text: "" };
    }
    return { status: "extracted", text: transcribed };
  } catch {
    return { status: "extraction_failed", text: "" };
  }
}

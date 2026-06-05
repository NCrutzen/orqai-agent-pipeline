// Phase 116-02 Task 2 — pins the swarm-agnostic extractAttachment service.
//
// Pure transform: bytes + contentType + caps in, { status, text } out.
// NO Inngest, NO swarm literal, NO Storage, NO DB. unpdf text-layer first;
// Orq.ai Router vision fallback for scanned PDFs / images; fail-soft coded
// statuses throughout (never throws past the worker).
//
// Mocks: `unpdf` (text-layer) + `@orq-ai/node` (vision Router call).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock unpdf -------------------------------------------------------------
const extractTextMock = vi.fn();
const getDocumentProxyMock = vi.fn(async () => ({ numPages: 1 }));

vi.mock("unpdf", () => ({
  extractText: (...args: unknown[]) => extractTextMock(...args),
  getDocumentProxy: (...args: unknown[]) => getDocumentProxyMock(...args),
}));

// ---- Mock the Orq Router (vision fallback) ---------------------------------
const orqCompletionMock = vi.fn();

vi.mock("@orq-ai/node", () => ({
  Orq: class {
    router = {
      chatCompletions: {
        create: (...args: unknown[]) => orqCompletionMock(...args),
      },
    };
  },
}));

// Import AFTER mocks.
import { extractAttachment, AttachmentExtractError } from "@/lib/automations/attachments/extract";

const CAPS = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxVisionPages: 5,
  maxExtractedChars: 100_000,
};

function pdfBytes(byteLength = 1024): ArrayBuffer {
  return new Uint8Array(byteLength).buffer;
}

function visionText(text: string) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

beforeEach(() => {
  extractTextMock.mockReset();
  getDocumentProxyMock.mockReset();
  getDocumentProxyMock.mockResolvedValue({ numPages: 1 });
  orqCompletionMock.mockReset();
  process.env.ORQ_API_KEY = "test-key";
});

describe("extractAttachment — PDF text-layer", () => {
  it("(1) returns extracted text from unpdf and does NOT call vision", async () => {
    extractTextMock.mockResolvedValue({ text: "Offerte nr 12345\nTotaal: 9000 EUR" });

    const out = await extractAttachment({
      bytes: pdfBytes(),
      contentType: "application/pdf",
      caps: CAPS,
    });

    expect(out.status).toBe("extracted");
    expect(out.text).toContain("Offerte nr 12345");
    expect(orqCompletionMock).not.toHaveBeenCalled();
  });

  it("(2) empty text-layer → needs_vision → vision fallback → extracted", async () => {
    extractTextMock.mockResolvedValue({ text: "   \n  " });
    orqCompletionMock.mockResolvedValue(visionText("Transcribed scanned quote text"));

    const out = await extractAttachment({
      bytes: pdfBytes(),
      contentType: "application/pdf",
      caps: CAPS,
    });

    expect(orqCompletionMock).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("extracted");
    expect(out.text).toBe("Transcribed scanned quote text");
  });

  it("(4) a thrown unpdf error (corrupt PDF) is caught → extraction_failed, never throws", async () => {
    extractTextMock.mockRejectedValue(new Error("Invalid PDF structure"));

    const out = await extractAttachment({
      bytes: pdfBytes(),
      contentType: "application/pdf",
      caps: CAPS,
    });

    expect(out.status).toBe("extraction_failed");
    expect(out.text).toBe("");
  });
});

describe("extractAttachment — image vision path", () => {
  it("(3) image bytes go straight to vision (no unpdf) and return text", async () => {
    orqCompletionMock.mockResolvedValue(visionText("Text visible in the JPG"));

    const out = await extractAttachment({
      bytes: pdfBytes(),
      contentType: "image/jpeg",
      caps: CAPS,
    });

    expect(extractTextMock).not.toHaveBeenCalled();
    expect(orqCompletionMock).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("extracted");
    expect(out.text).toBe("Text visible in the JPG");
  });
});

describe("extractAttachment — caps", () => {
  it("(5) bytes over size cap → skipped_cap BEFORE any parse/vision call", async () => {
    const out = await extractAttachment({
      bytes: pdfBytes(20 * 1024 * 1024),
      contentType: "application/pdf",
      caps: { ...CAPS, maxSizeBytes: 1024 },
    });

    expect(out.status).toBe("skipped_cap");
    expect(extractTextMock).not.toHaveBeenCalled();
    expect(orqCompletionMock).not.toHaveBeenCalled();
  });

  it("(6) extracted text over maxExtractedChars → skipped_cap (never silent truncation)", async () => {
    extractTextMock.mockResolvedValue({ text: "x".repeat(500) });

    const out = await extractAttachment({
      bytes: pdfBytes(),
      contentType: "application/pdf",
      caps: { ...CAPS, maxExtractedChars: 100 },
    });

    expect(out.status).toBe("skipped_cap");
    expect(out.text).toBe("");
  });
});

describe("extractAttachment — unsupported", () => {
  it("non-PDF / non-image contentType → unsupported, no fetch/parse", async () => {
    const out = await extractAttachment({
      bytes: pdfBytes(),
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      caps: CAPS,
    });

    expect(out.status).toBe("unsupported");
    expect(extractTextMock).not.toHaveBeenCalled();
    expect(orqCompletionMock).not.toHaveBeenCalled();
  });
});

describe("AttachmentExtractError", () => {
  it("carries a code field (FrameExtractError shape)", () => {
    const err = new AttachmentExtractError("extraction_failed", { message: "boom" });
    expect(err.code).toBe("extraction_failed");
    expect(err.name).toBe("AttachmentExtractError");
    expect(err.message).toBe("boom");
  });
});

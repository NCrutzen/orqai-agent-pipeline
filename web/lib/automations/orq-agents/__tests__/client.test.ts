// Phase 999.4 — OrqClientTimeoutError class test.
//
// Originally a Wave 0 RED scaffold for Plan 03's invokeOrqModel Router transport.
// Plan 03 was reverted 2026-05-07 after empirical evidence showed the Agents-product
// queue-stuck issue isn't chronic. invokeOrqModel + system-prompt cache are gone;
// only OrqClientTimeoutError + the 45s AbortController deadline (Plan 02 Fix B)
// remain. This file tests just the error class. Deadline behavior on
// invokeOrqAgent is exercised by stage-0-safety-worker.test.ts (T-B2).

import { describe, it, expect } from "vitest";

import { OrqClientTimeoutError } from "../client";

describe("OrqClientTimeoutError", () => {
  it("is a typed error class with name='OrqClientTimeoutError'", () => {
    const err = new OrqClientTimeoutError("deadline exceeded");
    expect(err.name).toBe("OrqClientTimeoutError");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("deadline exceeded");
  });
});

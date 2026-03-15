import { describe, it, expect } from "vitest";
import { classifyError, toPlainEnglish } from "../errors";

describe("classifyError", () => {
  it("classifies Anthropic rate limit errors", () => {
    const error = new Error("rate_limit_error: Rate limit exceeded");
    expect(classifyError(error)).toBe("ANTHROPIC_RATE_LIMIT");
  });

  it("classifies Anthropic auth errors", () => {
    const error = new Error("authentication_error: Invalid API key");
    expect(classifyError(error)).toBe("ANTHROPIC_AUTH");
  });

  it("classifies Anthropic overloaded errors", () => {
    const error = new Error("overloaded_error: API is overloaded");
    expect(classifyError(error)).toBe("ANTHROPIC_OVERLOADED");
  });

  it("classifies GitHub fetch failures", () => {
    const error = new Error("Failed to fetch pipeline template");
    (error as unknown as Record<string, unknown>).code = "GITHUB_FETCH_FAILED";
    expect(classifyError(error)).toBe("GITHUB_FETCH_FAILED");
  });

  it("classifies GitHub 404 errors", () => {
    const error = new Error("Pipeline template not found");
    (error as unknown as Record<string, unknown>).code = "GITHUB_NOT_FOUND";
    expect(classifyError(error)).toBe("GITHUB_NOT_FOUND");
  });

  it("classifies Supabase errors", () => {
    const error = new Error("PostgrestError: relation does not exist");
    expect(classifyError(error)).toBe("SUPABASE_ERROR");
  });

  it("classifies timeout errors", () => {
    const error = new Error("The operation was aborted due to timeout");
    expect(classifyError(error)).toBe("TIMEOUT");
  });

  it("returns UNKNOWN for unrecognized errors", () => {
    const error = new Error("Something completely random");
    expect(classifyError(error)).toBe("UNKNOWN");
  });
});

describe("toPlainEnglish", () => {
  it("always returns a non-empty string", () => {
    const errors = [
      new Error("rate_limit_error"),
      new Error("authentication_error"),
      new Error("random error"),
      new Error(""),
    ];
    for (const error of errors) {
      const result = toPlainEnglish(error);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    }
  });

  it("returns user-friendly message for rate limit", () => {
    const error = new Error("rate_limit_error: Rate limit exceeded");
    const result = toPlainEnglish(error);
    expect(result).toContain("temporarily busy");
  });

  it("returns fallback for unknown errors", () => {
    const error = new Error("???");
    const result = toPlainEnglish(error);
    expect(result).toContain("unexpected");
  });
});

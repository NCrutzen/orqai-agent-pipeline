import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// Must import after mocks are set up
const { runPromptAdapter } = await import("../adapter");

describe("runPromptAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the .md file content from the stage URL", async () => {
    const mdContent = `---
title: Test Agent
---
You are a test agent. Do testing things.`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mdContent),
    });

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Test result" }],
    });

    await runPromptAdapter("architect", { useCase: "Test use case" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain("architect.md");
  });

  it("strips YAML frontmatter before passing to Claude", async () => {
    const mdContent = `---
title: Architect
version: 1
---
You are the architect agent.`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(mdContent),
    });

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Blueprint result" }],
    });

    await runPromptAdapter("architect", { useCase: "Build something" });

    // The system prompt should NOT contain frontmatter
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).not.toContain("title: Architect");
    expect(callArgs.system).toContain("You are the architect agent.");
  });

  it("calls Claude messages.create with system prompt and user message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("You are a test agent."),
    });

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Agent output" }],
    });

    const result = await runPromptAdapter("architect", {
      useCase: "Process invoices",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toBe("You are a test agent.");
    expect(callArgs.messages[0].role).toBe("user");
    expect(callArgs.messages[0].content).toContain("Process invoices");
    expect(result).toBe("Agent output");
  });

  it("formats context as XML tags in user message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("System prompt content"),
    });

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Result" }],
    });

    await runPromptAdapter("researcher", {
      useCase: "Test case",
      blueprint: "Architecture blueprint here",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[0].content;
    expect(userContent).toContain("<use_case>");
    expect(userContent).toContain("Test case");
    expect(userContent).toContain("<blueprint>");
    expect(userContent).toContain("Architecture blueprint here");
  });

  it("throws on fetch failure with classifiable error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      runPromptAdapter("architect", { useCase: "test" })
    ).rejects.toThrow();
  });
});

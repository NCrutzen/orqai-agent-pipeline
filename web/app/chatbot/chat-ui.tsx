"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Message = { role: "user" | "assistant"; content: string };

export function ChatUI({ displayName }: { displayName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, statusLine]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setIsStreaming(true);
    setStatusLine(null);
    setError(null);

    const assistantIndex = next.length;
    setMessages([...next, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chatbot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "token") {
              setMessages((prev) => {
                const updated = [...prev];
                const cur = updated[assistantIndex];
                updated[assistantIndex] = {
                  ...cur,
                  content: (cur?.content ?? "") + evt.token,
                };
                return updated;
              });
            } else if (evt.type === "status") {
              setStatusLine(evt.message);
            } else if (evt.type === "done") {
              setStatusLine(null);
            } else if (evt.type === "error") {
              setError(evt.message ?? "onbekende fout");
            }
          } catch {
            // ignore malformed
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsStreaming(false);
      setStatusLine(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const showWelcome = messages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-[var(--v7-line)] bg-[var(--v7-panel)] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#dc4c19]">
              Moyne Roberts
            </div>
            <h1 className="text-lg font-semibold text-[var(--v7-text)]">
              MR Helper
            </h1>
          </div>
          <div className="text-sm text-[var(--v7-muted)]">
            Hoi {displayName}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {showWelcome && (
            <div className="rounded-[var(--v7-radius)] border border-[var(--v7-line)] bg-[var(--v7-panel)] p-6 text-[var(--v7-text)]">
              <p className="text-base">
                Stel een vraag — IT, processen, &quot;hoe doe ik X&quot;. Ik
                geef je een concreet antwoord, geen linkjes-zoektocht.
              </p>
              <p className="mt-2 text-sm text-[var(--v7-muted)]">
                Ik antwoord in jouw taal (NL · EN · FR · DE).
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}

          {statusLine && (
            <div className="flex items-center gap-2 text-sm text-[var(--v7-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{statusLine}</span>
            </div>
          )}

          {error && (
            <div className="rounded-[var(--v7-radius-sm)] border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-[var(--v7-line)] bg-[var(--v7-panel)] px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stel je vraag..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] bg-[var(--v7-bg-2)] px-4 py-3 text-sm text-[var(--v7-text)] placeholder:text-[var(--v7-muted)] focus:border-[#dc4c19] focus:outline-none disabled:opacity-50"
            style={{ maxHeight: "180px" }}
          />
          <Button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="h-12 bg-gradient-to-r from-[#dc4c19] to-[#4a90e2] text-white hover:opacity-90"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-[var(--v7-radius-sm)] px-4 py-3 ${
          isUser
            ? "bg-gradient-to-r from-[#dc4c19] to-[#4a90e2] text-white"
            : "border border-[var(--v7-line)] bg-[var(--v7-panel)] text-[var(--v7-text)]"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_a]:text-[#dc4c19] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--v7-bg-2)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[var(--v7-text)] [&_ol]:my-2 [&_p]:my-1 [&_ul]:my-2">
            {message.content ? (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            ) : (
              <span className="inline-flex items-center gap-2 text-[var(--v7-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>denkt na...</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

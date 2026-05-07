"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { Send, Loader2 } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const NAVY = "#071c2e";
const ORANGE = "#dc4c19";
const BORDER = "#e2e6ea";
const MUTED = "#6c757d";
const PANEL = "#f5f7fa";

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
    <div className="flex h-screen flex-col bg-white">
      <header
        className="border-b bg-white px-6 py-4"
        style={{ borderColor: BORDER }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/brand/moyne-roberts-logo.png"
              alt="Moyne Roberts"
              width={180}
              height={30}
              priority
              className="h-8 w-auto"
            />
            <div
              className="hidden h-6 w-px sm:block"
              style={{ background: BORDER }}
            />
            <div className="hidden sm:block">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: ORANGE }}
              >
                Helper
              </div>
              <div
                className="text-sm font-medium"
                style={{ color: NAVY }}
              >
                Trusted Safety Solutions
              </div>
            </div>
          </div>
          <div className="text-sm" style={{ color: MUTED }}>
            Hoi {displayName}
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {showWelcome && (
            <div
              className="rounded-lg border p-6"
              style={{ borderColor: BORDER, background: PANEL }}
            >
              <h2
                className="text-base font-semibold"
                style={{ color: NAVY }}
              >
                Stel je vraag
              </h2>
              <p className="mt-2 text-sm" style={{ color: NAVY }}>
                IT, processen, &quot;hoe doe ik X&quot; — ik geef je een
                concreet antwoord, geen linkjes-zoektocht.
              </p>
              <p className="mt-2 text-xs" style={{ color: MUTED }}>
                Antwoord in jouw taal · NL · EN · FR · DE
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}

          {statusLine && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: MUTED }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{statusLine}</span>
            </div>
          )}

          {error && (
            <div
              className="rounded-md border p-3 text-sm"
              style={{
                borderColor: "#dc35454d",
                background: "#dc35450d",
                color: "#a52834",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <footer
        className="border-t bg-white px-4 py-4"
        style={{ borderColor: BORDER }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stel je vraag..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-md border px-4 py-3 text-sm focus:outline-none disabled:opacity-50"
            style={{
              borderColor: BORDER,
              background: "white",
              color: NAVY,
              maxHeight: "180px",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = ORANGE)}
            onBlur={(e) => (e.currentTarget.style.borderColor = BORDER)}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="inline-flex h-12 items-center justify-center rounded-md px-5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: ORANGE }}
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
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
        className="max-w-[85%] rounded-lg px-4 py-3"
        style={
          isUser
            ? { background: NAVY, color: "white" }
            : { background: PANEL, color: NAVY, border: `1px solid ${BORDER}` }
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_a]:text-[#dc4c19] [&_a]:underline [&_code]:rounded [&_code]:bg-white [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[#071c2e] [&_ol]:my-2 [&_p]:my-1 [&_ul]:my-2 [&_strong]:text-[#071c2e]">
            {message.content ? (
              <ReactMarkdown>{message.content}</ReactMarkdown>
            ) : (
              <span
                className="inline-flex items-center gap-2"
                style={{ color: MUTED }}
              >
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

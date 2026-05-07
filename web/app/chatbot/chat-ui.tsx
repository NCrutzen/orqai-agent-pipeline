"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { Send, Loader2, Sun, Moon, Mic, MicOff } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };
type Theme = "light" | "dark";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

const ORANGE = "#dc4c19";

const THEMES = {
  light: {
    bg: "#ffffff",
    panel: "#f5f7fa",
    border: "#e2e6ea",
    text: "#071c2e",
    muted: "#6c757d",
    headerBg: "#ffffff",
    inputBg: "#ffffff",
    code: "#ffffff",
    userBubbleBg: "#071c2e",
    userBubbleText: "#ffffff",
    botBubbleBg: "#f5f7fa",
    botBubbleText: "#071c2e",
    logoBgPad: "transparent",
  },
  dark: {
    bg: "#0a1620",
    panel: "#11202e",
    border: "rgba(255,255,255,0.08)",
    text: "#e8eef5",
    muted: "#8b97a4",
    headerBg: "#0d1a25",
    inputBg: "#11202e",
    code: "#1a2a3a",
    userBubbleBg: "#dc4c19",
    userBubbleText: "#ffffff",
    botBubbleBg: "#11202e",
    botBubbleText: "#e8eef5",
    logoBgPad: "#ffffff",
  },
} as const;

const STORAGE_KEY = "mr-chatbot-theme";

export function ChatUI({ displayName }: { displayName: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputBaseRef = useRef<string>("");

  // Easter egg: triple-click op het MR-logo onthult de credits.
  // (Voor de nieuwsgierige ontwikkelaar staat ook een ASCII signature in de console.)
  const [logoClicks, setLogoClicks] = useState(0);
  const [showCredits, setShowCredits] = useState(false);
  const logoClickResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleLogoClick() {
    setLogoClicks((n) => {
      const next = n + 1;
      if (next >= 3) {
        setShowCredits(true);
        if (logoClickResetRef.current) clearTimeout(logoClickResetRef.current);
        setTimeout(() => setShowCredits(false), 4500);
        return 0;
      }
      if (logoClickResetRef.current) clearTimeout(logoClickResetRef.current);
      logoClickResetRef.current = setTimeout(() => setLogoClicks(0), 800);
      return next;
    });
  }

  useEffect(() => {
    // Console signature — de tweede laag van het easter egg, voor wie devtools opent.
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(
        "%cMR Helper%c\nCrafted with care by %cRon Fraats%c × %cDanny Vaessens%c\nTip: triple-click het Moyne Roberts logo.",
        "font-weight:bold;font-size:14px;color:#dc4c19",
        "color:#6c757d",
        "color:#071c2e;font-weight:bold",
        "color:#6c757d",
        "color:#071c2e;font-weight:bold",
        "color:#6c757d",
      );
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Spraakherkenning wordt niet ondersteund in deze browser.");
      return;
    }

    const rec = new Ctor();
    rec.lang = navigator.language || "nl-NL";
    rec.continuous = true;
    rec.interimResults = true;

    inputBaseRef.current = input.length > 0 ? input + " " : "";

    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) {
        inputBaseRef.current += finalText;
      }
      setInput((inputBaseRef.current + interimText).trimStart());
    };
    rec.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") {
        setError(`Spraakherkenning: ${e.error}`);
      }
      setIsRecording(false);
      recognitionRef.current = null;
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError(`Kon mic niet starten: ${(err as Error).message}`);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, statusLine]);

  const t = THEMES[theme];

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
    <div
      className="relative flex h-screen flex-col"
      style={{ background: t.bg, color: t.text }}
    >
      {showCredits && (
        <div
          className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 animate-[fadein_0.3s_ease-out]"
          style={{
            background: theme === "dark" ? "#11202e" : "#071c2e",
            color: "#ffffff",
            border: `1px solid ${ORANGE}`,
            borderRadius: "10px",
            padding: "14px 22px",
            boxShadow: "0 18px 50px rgba(7,28,46,0.35)",
          }}
        >
          <div className="flex items-center gap-3 text-sm">
            <span style={{ color: ORANGE, fontSize: "18px" }}>★</span>
            <div>
              <div className="text-xs uppercase tracking-[0.18em]" style={{ color: ORANGE }}>
                Made by
              </div>
              <div className="font-semibold">Ron Fraats × Danny Vaessens</div>
            </div>
          </div>
        </div>
      )}
      <header
        className="border-b px-6 py-4"
        style={{ borderColor: t.border, background: t.headerBg }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleLogoClick}
              aria-label="Moyne Roberts"
              className="rounded px-2 py-1 transition-transform hover:scale-[1.02] active:scale-95"
              style={{ background: t.logoBgPad }}
            >
              <Image
                src="/brand/moyne-roberts-logo.png"
                alt="Moyne Roberts"
                width={180}
                height={30}
                priority
                className="h-8 w-auto"
              />
            </button>
            <div
              className="hidden h-6 w-px sm:block"
              style={{ background: t.border }}
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
                style={{ color: t.text }}
              >
                Trusted Safety Solutions
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="hidden text-sm sm:inline"
              style={{ color: t.muted }}
            >
              Hoi {displayName}
            </span>
            <button
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={
                theme === "light" ? "Schakel donkere modus in" : "Schakel lichte modus in"
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors"
              style={{ borderColor: t.border, color: t.text, background: "transparent" }}
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {showWelcome && (
            <div
              className="rounded-lg border p-6"
              style={{ borderColor: t.border, background: t.panel }}
            >
              <h2
                className="text-base font-semibold"
                style={{ color: t.text }}
              >
                Stel je vraag
              </h2>
              <p className="mt-2 text-sm" style={{ color: t.text }}>
                IT, processen, &quot;hoe doe ik X&quot; — ik geef je een
                concreet antwoord, geen linkjes-zoektocht.
              </p>
              <p className="mt-2 text-xs" style={{ color: t.muted }}>
                Antwoord in jouw taal · NL · EN · FR · DE
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} theme={theme} />
          ))}

          {statusLine && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: t.muted }}
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
                color: theme === "dark" ? "#f5a8a8" : "#a52834",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>

      <footer
        className="border-t px-4 py-4"
        style={{ borderColor: t.border, background: t.headerBg }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!isRecording) inputBaseRef.current = e.target.value;
            }}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Aan het luisteren..." : "Stel je vraag..."}
            rows={2}
            disabled={isStreaming}
            className="flex-1 rounded-md border px-4 py-3 text-sm focus:outline-none disabled:opacity-50"
            style={{
              borderColor: isRecording ? "#dc3545" : t.border,
              background: t.inputBg,
              color: t.text,
              minHeight: "64px",
              maxHeight: "60vh",
              resize: "vertical",
            }}
            onFocus={(e) => {
              if (!isRecording) e.currentTarget.style.borderColor = ORANGE;
            }}
            onBlur={(e) => {
              if (!isRecording) e.currentTarget.style.borderColor = t.border;
            }}
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isStreaming}
              aria-label={isRecording ? "Stop dictaat" : "Start dictaat"}
              title={isRecording ? "Stop dictaat" : "Start dictaat"}
              className="inline-flex h-12 w-12 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={
                isRecording
                  ? {
                      background: "#dc3545",
                      color: "white",
                      borderColor: "#dc3545",
                    }
                  : {
                      background: "transparent",
                      color: t.text,
                      borderColor: t.border,
                    }
              }
            >
              {isRecording ? (
                <MicOff className="h-4 w-4 animate-pulse" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          )}
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

function MessageBubble({ message, theme }: { message: Message; theme: Theme }) {
  const t = THEMES[theme];
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-lg px-4 py-3"
        style={
          isUser
            ? { background: t.userBubbleBg, color: t.userBubbleText }
            : {
                background: t.botBubbleBg,
                color: t.botBubbleText,
                border: `1px solid ${t.border}`,
              }
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div
            className="prose prose-sm max-w-none text-sm leading-relaxed [&_a]:underline [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_ol]:my-2 [&_p]:my-1 [&_ul]:my-2"
            style={
              {
                "--tw-prose-body": t.botBubbleText,
                "--tw-prose-headings": t.botBubbleText,
                "--tw-prose-bold": t.botBubbleText,
                "--tw-prose-links": ORANGE,
                "--tw-prose-code": t.botBubbleText,
                color: t.botBubbleText,
              } as React.CSSProperties
            }
          >
            {message.content ? (
              <div
                style={
                  {
                    // inline code background per theme
                  } as React.CSSProperties
                }
              >
                <style>{`.bot-md code { background: ${t.code} !important; color: ${t.botBubbleText} !important; }`}</style>
                <div className="bot-md">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <span
                className="inline-flex items-center gap-2"
                style={{ color: t.muted }}
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

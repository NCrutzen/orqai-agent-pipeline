"use client";

import * as React from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Matches the SpeechRecognition type definitions from chat-ui.tsx
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

interface DicteerButtonProps {
  /** Called with the full updated transcript value (prev + new text) */
  onTranscript: (updater: (prev: string) => string) => void;
}

export function DicteerButton({ onTranscript }: DicteerButtonProps) {
  const [speechSupported, setSpeechSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);

  // Feature detection (D-11) — exact adaptation of chat-ui.tsx:132-141
  React.useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // Per UI-SPEC §Section 2: button not rendered when unsupported (never display:none)
  if (!speechSupported) return null;

  function startDicteer() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = navigator.language || "nl-NL";
    rec.continuous = false; // one dictation session per click (differs from chat-ui.tsx)
    rec.interimResults = true;

    rec.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      if (finalText) {
        const trimmed = finalText.trim();
        onTranscript((prev) => (prev ? `${prev} ${trimmed}` : trimmed));
      }
    };
    rec.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") {
        // silent — no error UI per spec (errors revert to idle state silently)
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }

  function stopDicteer() {
    recognitionRef.current?.stop();
  }

  function handleClick() {
    if (isListening) {
      stopDicteer();
    } else {
      startDicteer();
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      aria-label={isListening ? "Stop met inspreken" : "Inspreken"}
      className={cn(
        "gap-1.5",
        isListening && "text-[var(--v7-brand-primary)]",
      )}
    >
      <span className="relative inline-flex items-center justify-center size-4">
        <Mic className="size-4" />
        {/* Pulsing ring while listening */}
        {isListening && (
          <span className="absolute inline-flex size-full rounded-full bg-[var(--v7-brand-primary)] opacity-30 animate-ping" />
        )}
      </span>
      {isListening ? "Luistert…" : "Inspreken"}
    </Button>
  );
}

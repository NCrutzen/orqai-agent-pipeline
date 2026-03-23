"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBroadcast } from "@/lib/supabase/broadcast-client";
import type { ChatTokenPayload, ChatMessage } from "@/lib/pipeline/chat-types";
import { ChatMessageBubble } from "./chat-message";
import { ChatInput } from "./chat-input";
import { StageProgressBar } from "./stage-progress-bar";

interface DisplayMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  streaming: boolean;
  stageName?: string;
}

interface StageStatus {
  name: string;
  displayName: string;
  status: "pending" | "running" | "complete" | "failed" | "waiting";
}

interface ChatPanelProps {
  runId: string;
  initialMessages: ChatMessage[];
  stages: StageStatus[];
  isWaitingForInput: boolean;
  waitingStage: string | null;
  onSendMessage: (message: string) => void;
}

export function ChatPanel({
  runId,
  initialMessages,
  stages,
  isWaitingForInput,
  waitingStage,
  onSendMessage,
}: ChatPanelProps) {
  // Initialize display messages from DB-hydrated messages
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      streaming: false,
      stageName: m.stage_name ?? undefined,
    }))
  );

  // Token accumulation buffer (requestAnimationFrame pattern)
  const tokenBufferRef = useRef<string>("");
  const activeMessageIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  // Scroll management
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const prevMessageCountRef = useRef(messages.length);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && !userScrolledRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Also auto-scroll during streaming (content changes)
  useEffect(() => {
    if (!userScrolledRef.current && activeMessageIdRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
    }
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 100;
    userScrolledRef.current = !isBottom;
    setShowJump(!isBottom);
  }, []);

  function jumpToLatest() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    userScrolledRef.current = false;
    setShowJump(false);
  }

  // Handle streaming chat tokens
  const handleChatToken = useCallback((payload: ChatTokenPayload) => {
    if (payload.isStart) {
      // New streaming message
      activeMessageIdRef.current = payload.messageId;
      tokenBufferRef.current = "";
      setMessages((prev) => [
        ...prev,
        { id: payload.messageId, role: "assistant", content: "", streaming: true, stageName: payload.stageName },
      ]);
      return;
    }

    if (payload.isDone) {
      // Flush final content
      const finalContent = tokenBufferRef.current;
      activeMessageIdRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId ? { ...m, content: finalContent, streaming: false } : m
        )
      );
      return;
    }

    // Accumulate token
    tokenBufferRef.current += payload.token;

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        const accumulated = tokenBufferRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId ? { ...m, content: accumulated } : m
          )
        );
        rafRef.current = null;
      });
    }
  }, []);

  // Handle complete chat messages (user messages, template messages)
  const handleChatMessage = useCallback((payload: { id: string; role: "assistant" | "user"; content: string; stageName?: string }) => {
    setMessages((prev) => {
      // Avoid duplicates (message may already be in state from optimistic add)
      if (prev.some((m) => m.id === payload.id)) return prev;
      return [...prev, { id: payload.id, role: payload.role, content: payload.content, streaming: false, stageName: payload.stageName }];
    });
  }, []);

  useBroadcast<ChatTokenPayload>(`run:${runId}`, "chat-token", handleChatToken);
  useBroadcast<{ id: string; role: "assistant" | "user"; content: string; stageName?: string }>(
    `run:${runId}`,
    "chat-message",
    handleChatMessage
  );

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const inputPlaceholder = waitingStage === "discussion"
    ? "Answer the question..."
    : waitingStage
      ? "Share your feedback or type 'confirm'..."
      : "Waiting for AI...";

  return (
    <div className="flex h-full flex-col">
      {/* Stage progress bar at top */}
      <StageProgressBar stages={stages} />

      {/* Scrollable chat messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto p-4"
        role="log"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            The AI will start the conversation shortly...
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              streaming={msg.streaming}
              stageName={msg.stageName}
            />
          ))
        )}
      </div>

      {/* Jump to latest */}
      {showJump && (
        <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2">
          <Button variant="secondary" size="sm" onClick={jumpToLatest} className="shadow-lg">
            <ArrowDown className="mr-1.5 size-4" />
            Jump to latest
          </Button>
        </div>
      )}

      {/* Chat input */}
      <ChatInput
        onSend={onSendMessage}
        disabled={!isWaitingForInput}
        placeholder={inputPlaceholder}
      />
    </div>
  );
}

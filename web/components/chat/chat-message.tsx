"use client";

import { cn } from "@/lib/utils";

interface ChatMessageBubbleProps {
  role: "assistant" | "user";
  content: string;
  streaming?: boolean;
  stageName?: string;
}

export function ChatMessageBubble({ role, content, streaming, stageName }: ChatMessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("mb-3 flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {content}
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current opacity-70" />
        )}
        {!isUser && stageName && (
          <div className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground opacity-60">
            {stageName.replace(/-/g, " ")}
          </div>
        )}
      </div>
    </div>
  );
}

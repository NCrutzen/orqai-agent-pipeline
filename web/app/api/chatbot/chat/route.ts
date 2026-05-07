import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MR_CHATBOT_SYSTEM_PROMPT } from "@/lib/automations/mr-chatbot/system-prompt";
import {
  tavilySearch,
  WEB_SEARCH_TOOL_DEFINITION,
} from "@/lib/automations/mr-chatbot/tavily";

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";
const PRIMARY_MODEL = "anthropic/claude-sonnet-4-6";
const FALLBACK_MODEL = "anthropic/claude-haiku-4-5";
const MAX_TOOL_ITERATIONS = 3;

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

type ClientMessage = { role: "user" | "assistant"; content: string };

async function callOrq(
  messages: ChatMessage[],
  opts: { stream: boolean; model?: string }
): Promise<Response> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");

  return fetch(ORQ_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? PRIMARY_MODEL,
      max_tokens: 2048,
      stream: opts.stream,
      messages,
      tools: [WEB_SEARCH_TOOL_DEFINITION],
      tool_choice: "auto",
    }),
    signal: AbortSignal.timeout(45_000),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { messages: ClientMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: MR_CHATBOT_SYSTEM_PROMPT },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const probe = await callOrq(messages, { stream: false });
          if (!probe.ok) {
            const text = await probe.text().catch(() => "");
            throw new Error(`Orq probe ${probe.status}: ${text.slice(0, 200)}`);
          }
          const probeJson = await probe.json();
          const choice = probeJson.choices?.[0];
          const msg = choice?.message;

          if (msg?.tool_calls?.length) {
            messages.push({
              role: "assistant",
              content: msg.content ?? null,
              tool_calls: msg.tool_calls,
            });

            for (const call of msg.tool_calls) {
              if (call.function?.name === "web_search") {
                let query = "";
                try {
                  query = JSON.parse(call.function.arguments).query ?? "";
                } catch {
                  query = "";
                }
                send({ type: "status", message: `Zoek: ${query}` });

                let toolResult: string;
                try {
                  const result = await tavilySearch(query, { max_results: 5 });
                  const lines: string[] = [];
                  if (result.answer) lines.push(`Summary: ${result.answer}`);
                  for (const r of result.results) {
                    lines.push(`- ${r.title}\n  ${r.url}\n  ${r.content.slice(0, 400)}`);
                  }
                  toolResult = lines.join("\n\n") || "No results.";
                } catch (e) {
                  toolResult = `Search failed: ${(e as Error).message}`;
                }

                messages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  name: "web_search",
                  content: toolResult,
                });
              }
            }
            continue;
          }

          // No tool call -> stream the final answer.
          const finalContent = msg?.content;
          if (typeof finalContent === "string" && finalContent.length > 0) {
            // Already have full text from non-streaming probe — chunk it for UX.
            const chunkSize = 24;
            for (let i = 0; i < finalContent.length; i += chunkSize) {
              send({ type: "token", token: finalContent.slice(i, i + chunkSize) });
              await new Promise((r) => setTimeout(r, 12));
            }
          }
          send({ type: "done" });
          controller.close();
          return;
        }

        // Tool loop exhausted
        send({
          type: "token",
          token:
            "Sorry, ik kreeg het niet rond binnen de tijd. Probeer je vraag iets specifieker te stellen.",
        });
        send({ type: "done" });
        controller.close();
      } catch (err) {
        send({
          type: "error",
          message: (err as Error).message ?? "unknown_error",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

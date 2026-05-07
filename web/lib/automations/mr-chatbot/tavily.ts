const TAVILY_URL = "https://api.tavily.com/search";

export type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type TavilyResponse = {
  query: string;
  answer?: string;
  results: TavilyResult[];
};

export async function tavilySearch(
  query: string,
  opts?: { max_results?: number; include_answer?: boolean }
): Promise<TavilyResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY not set");
  }

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: opts?.max_results ?? 5,
      include_answer: opts?.include_answer ?? true,
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily search failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  return (await res.json()) as TavilyResponse;
}

export const WEB_SEARCH_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "web_search",
    description:
      "Search the web for current/recent information. Use only when training knowledge is insufficient or the question is about specific products, recent versions, or things you don't fully recognize.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query. Be specific. Include product/system names where relevant. Use the same language as the user's question if it's clearly localized (NL/FR/DE), otherwise English for broader coverage.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

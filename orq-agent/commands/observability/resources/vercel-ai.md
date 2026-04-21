---
resource_of: orq-agent/commands/observability.md
framework: vercel-ai
language: typescript
---

# Vercel AI SDK — Orq.ai AI Router Integration

Runnable integration snippet for Vercel AI SDK applications using `experimental_telemetry`.

## TypeScript

```ts
// CRITICAL: instrumentors must be imported BEFORE the SDK client — init observability BEFORE any model calls.
import { initOrqObservability } from '@orq-ai/node';
initOrqObservability({
  apiKey: process.env.ORQ_API_KEY!,
  appName: 'my-app',
});

// Only now import the Vercel AI SDK + model providers.
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: openai('gpt-4o-2024-11-20'),   // dated snapshot per MSEL-02
  prompt: 'Hello',
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'greeting',
    metadata: {
      sessionId: 'sess_abc',
      userId: 'user_123',
      customerId: 'acme-corp',   // per-tenant identity attribution (OBSV-07)
    },
  },
});
```

## Notes

- `experimental_telemetry.metadata` is the Vercel AI SDK surface for session / user / customer enrichment.
- Per-request metadata beats global setters in serverless environments where global state is unreliable across invocations.
- `functionId` shows up as the span name in Orq.ai — name it after the business function (e.g. `greeting`, `chat_reply`, `summarize`).
- See `orq-agent/commands/observability.md` Step 4 for baseline verification.

---
resource_of: orq-agent/commands/observability.md
framework: openai-sdk
language: python,typescript
---

# OpenAI SDK — Orq.ai AI Router Integration

Runnable integration snippets for instrumenting the OpenAI SDK with Orq.ai trace capture. Paste these into your app entry point.

## Python

```python
import os

# CRITICAL: instrumentors must be imported BEFORE the SDK client.
from traceloop.sdk import Traceloop
Traceloop.init(
    app_name="my-app",
    api_endpoint="https://api.orq.ai/v2/otel",
    api_key=os.environ["ORQ_API_KEY"],
    disable_batch=False,
)

# Only now import the OpenAI SDK.
from openai import OpenAI
client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o-2024-11-20",   # dated snapshot per MSEL-02
    messages=[{"role": "user", "content": "Hello"}],
)
```

## TypeScript

```ts
// CRITICAL: instrumentors must be imported BEFORE the SDK client.
import { initOrqObservability } from '@orq-ai/node';
initOrqObservability({
  apiKey: process.env.ORQ_API_KEY!,
  appName: 'my-app',
});

// Only now import the OpenAI SDK.
import OpenAI from 'openai';
const client = new OpenAI();

const response = await client.chat.completions.create({
  model: 'gpt-4o-2024-11-20',   // dated snapshot per MSEL-02
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Verification

See `orq-agent/commands/observability.md` Step 4 for the baseline verification script that confirms your first trace lands in Orq.ai with model + token capture.

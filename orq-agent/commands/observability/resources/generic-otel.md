---
resource_of: orq-agent/commands/observability.md
framework: generic-otel
language: python,typescript
---

# Generic OpenTelemetry — Orq.ai OTEL-only Mode

Runnable integration snippets for raw OpenTelemetry SDK wired to the Orq.ai OTLP endpoint. Use this when you want unified OTEL aggregation (Grafana/Tempo/Datadog + Orq.ai) without framework-specific instrumentors.

## Python

```python
import os

# CRITICAL: instrumentors / OTEL exporter must be configured BEFORE creating any tracers or LLM clients.
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

exporter = OTLPSpanExporter(
    endpoint="https://api.orq.ai/v2/otel/v1/traces",
    headers={"Authorization": f"Bearer {os.environ['ORQ_API_KEY']}"},
)
provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

# Only now create tracers and LLM clients.
tracer = trace.get_tracer(__name__)
with tracer.start_as_current_span("agent.root") as span:
    span.set_attribute("customer_id", "acme-corp")
    # ... your LLM call here
```

## TypeScript

```ts
// CRITICAL: instrumentors must be imported BEFORE the SDK client — start the OTEL SDK BEFORE any model imports.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'https://api.orq.ai/v2/otel/v1/traces',
    headers: { Authorization: `Bearer ${process.env.ORQ_API_KEY}` },
  }),
});
sdk.start();   // BEFORE any model imports
```

## When to use

- User already runs Grafana / Tempo / Datadog and wants a unified OTEL pipeline.
- User wants full control over span attributes and processor chain.
- User accepts that enrichment attributes (`session_id`, `user_id`, `customer_id`) are set manually via `span.set_attribute()` — there are no `setIdentity()` helpers in OTEL-only mode.
- See `orq-agent/commands/observability.md` Step 4 for baseline verification.

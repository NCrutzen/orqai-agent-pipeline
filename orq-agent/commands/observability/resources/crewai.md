---
resource_of: orq-agent/commands/observability.md
framework: crewai
language: python
---

# CrewAI — Orq.ai AI Router Integration

Runnable integration snippet for CrewAI multi-agent applications using Traceloop auto-instrumentation.

## Python

```python
import os

# CRITICAL: Traceloop instrumentors must be imported BEFORE any CrewAI / LangChain / OpenAI imports.
from traceloop.sdk import Traceloop
Traceloop.init(
    app_name="my-crew",
    api_endpoint="https://api.orq.ai/v2/otel",
    api_key=os.environ["ORQ_API_KEY"],
)

# Only now import CrewAI.
from crewai import Agent, Task, Crew

researcher = Agent(
    role="Researcher",
    goal="Find facts",
    backstory="Thorough and precise",
    llm="gpt-4o-2024-11-20",   # dated snapshot per MSEL-02
)
task = Task(description="Research X", agent=researcher, expected_output="Facts")
crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```

## Notes

- Traceloop auto-instruments CrewAI's internal LLM calls — no per-agent decorator required.
- Each `Agent` becomes an `agent` span automatically.
- Each `Task` step becomes nested `llm` + `tool` spans via CrewAI's internal orchestration.
- For per-tenant identity attribution (OBSV-07), set `association_properties` via `Traceloop.set_association_properties({"customer_id": "acme-corp"})` at request scope.
- See `orq-agent/commands/observability.md` Step 4 for baseline verification.

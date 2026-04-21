---
resource_of: orq-agent/commands/observability.md
framework: langchain
language: python
---

# LangChain — Orq.ai AI Router Integration

Runnable integration snippet for LangChain applications using the Orq.ai callback handler.

## Python

```python
import os

# CRITICAL: initialize the handler BEFORE creating any LangChain chains.
# (instrumentors must be imported BEFORE the SDK client they wrap)
from orq_ai_langchain import OrqAICallbackHandler
handler = OrqAICallbackHandler(api_key=os.environ["ORQ_API_KEY"])

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(
    model="gpt-4o-2024-11-20",   # dated snapshot per MSEL-02
    callbacks=[handler],         # attach handler on every LLM construction
)
prompt = ChatPromptTemplate.from_messages([("user", "{q}")])
chain = prompt | llm
result = chain.invoke({"q": "Hello"}, config={"callbacks": [handler]})
```

## Notes

- Attach the handler at BOTH LLM construction AND invocation config — LangGraph and nested chains sometimes bypass the constructor-level callback list.
- Works with LangGraph nodes; pass `config={"callbacks": [handler]}` into every `.invoke()` / `.stream()` call.
- Use `RunnableConfig` for request-scoped enrichment (attach `session_id` / `user_id` / `customer_id` as metadata per invocation).
- See `orq-agent/commands/observability.md` Step 4 for baseline verification.

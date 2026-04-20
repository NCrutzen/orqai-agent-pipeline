---
name: test-bad-pin
description: Negative fixture for snapshot-pinned-models rule (Phase 35 MSEL-02). Contains a floating-alias model ID that the rule MUST reject.
tools: Read
model: openai/gpt-4o-latest
---

# Test fixture — bad pin

This file intentionally uses a floating alias (`openai/gpt-4o-latest`) to prove the `snapshot-pinned-models` lint rule catches non-pinned model IDs.

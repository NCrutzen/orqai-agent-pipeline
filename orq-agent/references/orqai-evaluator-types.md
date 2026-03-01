# Orq.ai Evaluator Types Reference

Orq.ai evaluator types reference for automated testing and guardrail configuration. The tester subagent loads this to select appropriate evaluators for each agent's testing needs.

## Built-in Function Evaluators (19)

Pre-built evaluators that run deterministic scoring functions. No LLM calls required.

| Name | What It Measures | Score Type |
|------|-----------------|------------|
| `exactness` | Exact match between output and expected | Binary |
| `bleu` | N-gram overlap (translation quality) | Continuous (0-1) |
| `rouge_1` | Unigram overlap (summary recall) | Continuous (0-1) |
| `rouge_2` | Bigram overlap (summary precision) | Continuous (0-1) |
| `rouge_l` | Longest common subsequence overlap | Continuous (0-1) |
| `meteor` | Semantic-aware translation metric | Continuous (0-1) |
| `levenshtein` | Edit distance similarity | Continuous (0-1) |
| `cosine_similarity` | Embedding vector similarity | Continuous (0-1) |
| `jaccard_similarity` | Set overlap between tokens | Continuous (0-1) |
| `regex_match` | Output matches a regex pattern | Binary |
| `json_validity` | Output is valid JSON | Binary |
| `json_schema` | Output matches a JSON schema | Binary |
| `word_count` | Output word count within range | Binary |
| `char_count` | Output character count within range | Binary |
| `contains` | Output contains expected substring | Binary |
| `starts_with` | Output starts with expected prefix | Binary |
| `ends_with` | Output ends with expected suffix | Binary |
| `toxicity` | Toxicity score of output text | Continuous (0-1) |
| `readability` | Flesch-Kincaid readability score | Continuous |

## LLM Evaluators (10)

Pre-built LLM-as-judge evaluators. Each uses an LLM to assess output quality against criteria. Supports custom judge prompts for domain-specific evaluation.

| Name | What It Measures | Score Type |
|------|-----------------|------------|
| `coherence` | Logical flow and consistency | Continuous (1-5) |
| `relevance` | Response relevance to input query | Continuous (1-5) |
| `fluency` | Grammatical correctness and naturalness | Continuous (1-5) |
| `groundedness` | Claims supported by provided context | Continuous (1-5) |
| `completeness` | Coverage of all required information | Continuous (1-5) |
| `conciseness` | Absence of unnecessary information | Continuous (1-5) |
| `harmfulness` | Presence of harmful content | Binary |
| `correctness` | Factual accuracy of the response | Continuous (1-5) |
| `helpfulness` | Practical usefulness of the response | Continuous (1-5) |
| `instruction_following` | Adherence to given instructions | Continuous (1-5) |

## RAGAS Evaluators (12)

RAG-specific quality metrics from the RAGAS framework. Designed for evaluating retrieval-augmented generation pipelines.

| Name | What It Measures | Score Type |
|------|-----------------|------------|
| `faithfulness` | Output faithful to retrieved context | Continuous (0-1) |
| `answer_relevancy` | Answer relevance to the question | Continuous (0-1) |
| `context_precision` | Relevant context ranked higher | Continuous (0-1) |
| `context_recall` | Required context was retrieved | Continuous (0-1) |
| `context_utilization` | Retrieved context actually used | Continuous (0-1) |
| `context_entity_recall` | Key entities from context preserved | Continuous (0-1) |
| `noise_sensitivity` | Robustness to irrelevant context | Continuous (0-1) |
| `response_relevancy` | Response addresses the question | Continuous (0-1) |
| `answer_correctness` | Factual correctness of answer | Continuous (0-1) |
| `answer_similarity` | Semantic similarity to reference | Continuous (0-1) |
| `hallucination` | Presence of unsupported claims | Continuous (0-1) |
| `summarization_score` | Quality of summarized content | Continuous (0-1) |

## Custom Evaluator Types (4)

Users define their own evaluation logic using one of 4 custom evaluator types.

| Type | How It Works | When to Use |
|------|-------------|-------------|
| **LLM** | Custom judge prompt evaluated by an LLM. Define your own scoring criteria and rubric. | Domain-specific quality assessment, style evaluation, policy compliance |
| **Python** | Custom Python code that receives input/output and returns a score. Full programmatic control. | Complex validation logic, multi-step checks, external library integration |
| **HTTP** | External endpoint receives a payload, returns a score. Runs your own evaluation service. | Existing evaluation infrastructure, proprietary scoring models, team-specific APIs |
| **JSON** | Custom JSON schema validation with scoring rules. Declarative evaluation definition. | Structured output validation, schema compliance, field-level scoring |

## Selection Guidance

Choose evaluator type based on what you are testing:

| Testing Goal | Recommended Evaluators |
|-------------|----------------------|
| **Semantic quality** (is the answer good?) | LLM evaluators: `relevance`, `coherence`, `helpfulness` |
| **Structural correctness** (right format?) | Function evaluators: `json_validity`, `json_schema`, `regex_match` |
| **RAG pipeline quality** (retrieval working?) | RAGAS evaluators: `faithfulness`, `context_precision`, `answer_relevancy` |
| **Safety and compliance** (no harmful output?) | Function: `toxicity` + LLM: `harmfulness` |
| **Similarity to reference** (matches expected?) | Function: `exactness`, `bleu`, `rouge_l`, `cosine_similarity` |
| **Domain-specific criteria** (custom rules?) | Custom: LLM (judge prompt) or Python (code logic) |
| **Output length constraints** (within limits?) | Function: `word_count`, `char_count` |
| **Multi-agent orchestration** (handoffs correct?) | Custom: Python or HTTP evaluator with orchestration-aware logic |

**Combining evaluators:** Use multiple evaluators per agent test. Typical setup: 1 structural (json_validity) + 1 semantic (relevance) + 1 domain-specific (custom LLM). Weight scores by importance in experiment configuration.

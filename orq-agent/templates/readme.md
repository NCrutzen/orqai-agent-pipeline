# README Template

Output template for swarm README documentation. The spec generator fills each `{{PLACEHOLDER}}` with values from the architect blueprint.

**Instructions:** Replace each `{{PLACEHOLDER}}` with the appropriate value. This README targets non-technical users who will configure the swarm in Orq.ai Studio.

## Placeholder Legend

| Placeholder | Source | Description |
|-------------|--------|-------------|
| `{{SWARM_NAME}}` | Architect blueprint — swarm name | Human-readable swarm name |
| `{{SWARM_DESCRIPTION}}` | Architect blueprint — purpose | Plain-language summary of what the swarm does |
| `{{AGENT_LIST}}` | Architect blueprint — agents | List of agents with roles |
| `{{DIRECTORY_TREE}}` | Spec generator — output files | File tree of generated output |
| `{{TESTING_INSTRUCTIONS}}` | Spec generator — dataset usage | How to use dataset files for testing |

---

# {{SWARM_NAME}}

## What This Does

{{SWARM_DESCRIPTION}}

> Provide a plain-language summary (2-4 sentences) of the swarm's purpose. Write for someone who understands the business problem but may not know how AI agents work. Avoid jargon. Example:
>
> "This swarm automatically processes incoming customer support emails, categorizes them by urgency and topic, drafts appropriate responses, and escalates complex cases to human agents. It handles the routine 80% of support volume so your team can focus on the cases that need human judgment."

## Agents

{{AGENT_LIST}}

> List each agent with a brief description of its role:
>
> | Agent | Role | What It Does |
> |-------|------|-------------|
> | `customer-triage-agent` | Triage Specialist | Reads incoming messages and categorizes by urgency and topic |
> | `customer-response-agent` | Response Drafter | Drafts replies for routine categories using knowledge base |
> | `customer-escalation-agent` | Escalation Handler | Routes complex cases to the right human team |
>
> For single-agent swarms, list the single agent.

## Setup Instructions

Follow these steps to configure the swarm in Orq.ai Studio:

### Step 1: Log into Orq.ai Studio

Navigate to [studio.orq.ai](https://studio.orq.ai) and log in with your organization credentials.

### Step 2: Create each agent

Create agents **in this order** (agents that others depend on must be created first):

1. Open the agent spec file for each agent (in the `agents/` directory)
2. In Orq.ai Studio, go to **Agents** and click **Create Agent**
3. Fill in each field as specified in the agent spec:
   - **Key**: Copy the agent key exactly (e.g., `customer-triage-agent`)
   - **Role**: Set the role designation
   - **Description**: Set the brief description
   - **Model**: Select the recommended model
   - **Instructions**: Paste the full instructions/system prompt
   - **Tools**: Add each tool as specified in the Tools section
4. Repeat for each agent in the order listed above

### Step 3: Configure fields per agent spec

For each agent, verify all fields match the agent spec file:
- Model and fallback models are set correctly
- All tools are added with correct configurations
- Runtime constraints (max iterations, execution time) are configured
- Knowledge bases and memory stores are connected (if applicable)

### Step 4: Set up orchestration (if multi-agent)

If this swarm has multiple agents:
1. Open the orchestration document (`ORCHESTRATION.md`)
2. On the orchestrator agent, set **team_of_agents** to list all sub-agent keys
3. Ensure the orchestrator has `retrieve_agents` and `call_sub_agent` tools
4. Verify agent-as-tool assignments match the orchestration document

> Skip this step for single-agent swarms.

### Step 5: Test with provided dataset

1. Open the dataset file for each agent (in the `datasets/` directory)
2. Run each agent individually with the **happy-path** test inputs first
3. Verify the agent's response matches the expected behavior
4. Run **edge-case** and **adversarial** test inputs
5. For multi-agent swarms, run end-to-end tests through the orchestrator
6. Compare results across models using the multi-model comparison matrix

## Directory Structure

{{DIRECTORY_TREE}}

> Show the output file tree:
>
> ```
> {{SWARM_NAME}}/
>   ORCHESTRATION.md          # Swarm orchestration documentation
>   README.md                 # This file
>   agents/
>     agent-a.md              # Agent A specification
>     agent-b.md              # Agent B specification
>   datasets/
>     agent-a-dataset.md      # Test dataset for Agent A
>     agent-b-dataset.md      # Test dataset for Agent B
> ```

## Testing

{{TESTING_INSTRUCTIONS}}

> How to use the dataset files for testing:
>
> 1. **Individual agent testing**: Use each agent's dataset file to test the agent in isolation. Start with happy-path inputs, then edge cases, then adversarial.
> 2. **End-to-end testing**: For multi-agent swarms, run the full pipeline with test inputs. Verify data flows correctly between agents.
> 3. **Model comparison**: Use the multi-model comparison matrix to test with different models. Document which models pass/fail each test.
> 4. **Regression testing**: After any configuration change, re-run the full dataset to verify nothing broke.
> 5. **Production monitoring**: Use eval pairs as ongoing quality checks after deployment.

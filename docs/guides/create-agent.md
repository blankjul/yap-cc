# Create an Agent

This guide walks through creating a custom agent — a personal coding assistant that prefers concise, direct answers and knows your preferred tools.

## 1. Decide which provider to use

Before writing anything, choose your provider:

- Use **Claude CLI** if you want a fully autonomous agent that handles file operations, web search, and terminal use without any configuration. Claude CLI is the simpler starting point.
- Use **OpenRouter** if you need a specific model not available through Claude CLI, or if you want explicit control over which tools are used and when.

For this guide, we will use Claude CLI.

## 2. Create the agent file

User-defined agents live in `~/.yapflows/agents/`. Create a new file there — the file name becomes the agent's identifier.

You can do this from the Agents tab in the app (click `[+]` and enter a name) or directly in your file system with any editor.

## 3. Write the front matter

The top of every agent file is a YAML block between `---` markers. Fill in the fields:

- **name** — the display name shown in the UI
- **provider** — `claude-cli` for this example
- **model** — the Claude model you want to use
- **color** — an accent color for the avatar (any hex color)

Keep front matter minimal. Only `provider` and `model` are required.

## 4. Write the system prompt

After the closing `---`, write the agent's system prompt as plain text. This is what the model reads before every conversation turn.

A good system prompt for a coding assistant might:

- Describe the assistant's role
- Set expectations for response style (concise, no boilerplate explanations)
- List the user's preferred tools or conventions
- Note anything the assistant should always remember

Front matter is stripped before the prompt is assembled — the model never sees it.

## 5. Test the agent

Go to the Agents tab and select your new agent from the list. The system prompt appears on the right. Click "New chat with this agent" to open a conversation.

If the agent does not behave as expected, edit the system prompt directly in the Agents tab and start a new chat. Changes take effect in the next session — existing sessions keep the prompt they were created with.

## Tips for effective system prompts

**Be specific about tone.** "Be concise" is vague. "Respond in plain prose with no preamble; skip explanations unless asked" is actionable.

**Describe the user's context.** If this agent is for a specific project, mention the language, framework, and conventions. The agent will draw on your memory for personal context, but project-level context belongs in the system prompt.

**Avoid over-specification.** Don't try to anticipate every scenario. A clear role description and tone guide are enough. The model is capable of figuring out the rest.

**Test with real questions.** Run a few actual queries. If the agent drifts into behaviors you don't want, add a short, direct instruction to the system prompt. Iterate quickly — edits in the Agents tab save instantly.

## What's next

- Add [memory topics](../concepts/memory.md) the agent should know about
- Create a [knowledge document](../concepts/knowledge.md) for reference material the agent should consult
- Turn this agent into a [scheduled task](schedule-task.md) if you want it to run automatically

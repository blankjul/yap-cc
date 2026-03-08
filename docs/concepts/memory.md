# Memory

Memory is what the agent learns about *you* across conversations — your preferences, habits, timezone, ongoing context, things you have shared in previous chats. It is personal and cumulative. The agent maintains it automatically.

## The two kinds of memory files

| File | Auto-loaded | Maintained by |
|------|-------------|---------------|
| `~/.yapflows/memory/default.md` | Every conversation | Agent and you |
| `~/.yapflows/memory/{topic}.md` | On demand only | Agent |

**`default.md`** is the anchor. It is injected into the system prompt at the start of every conversation. It should be kept short — a concise summary of who you are, your preferences, your timezone, and any standing context the agent should always have.

**Topic files** hold detail. When a conversation touches a subject that warrants its own file — a work project, a reading list, cooking preferences — the agent creates a topic file and loads it when needed. Topic files are never auto-loaded; you or the agent explicitly pulls them in.

## How the agent reads and writes memory

Memory is plain markdown. The agent reads and writes memory files using the bash tool — the same way you might use a text editor. No special memory API exists. The system prompt explains to the agent where memory lives and what conventions to follow.

This is intentional. Memory is not a black box — it is files you can open, read, and edit in the Memory tab or any text editor.

## The `@mention` pattern

In the chat composer, type `@` to see autocomplete suggestions from your topic files. Selecting a topic:

- Adds a chip to the composer showing which file will be attached
- When you send the message, appends the content of that topic file to your message for that turn

This is how you say "use my work context for this answer" without the agent having to decide to load it. The topic content is available to the agent for that turn only — it is not injected into every subsequent message.

## Memory maintenance

The agent is instructed to:

- Keep `default.md` short and accurate — core facts only
- Move detailed information into appropriately named topic files
- Compact files over time (rewrite to be more concise)
- Update facts when they change rather than appending new entries

You can view and edit any memory file in the Memory tab. The `default` file is always at the top of the list and cannot be deleted. Topic files can be renamed or deleted.

## System prompt assembly

At the start of every conversation, the full system prompt is assembled as:

```
{agent body}
---
{~/.yapflows/memory/default.md, if it exists}
---
{Framework instructions: memory conventions, knowledge conventions, available skills}
```

Only `default.md` appears automatically. Topic files and knowledge documents are loaded explicitly on demand.

!!! note
    The setup wizard writes your name, timezone, and preferences directly to `default.md`. This gives the agent a head start without requiring any conversation history.

## Viewing and editing memory

The Memory tab shows all memory files in a sidebar list. Select any file to view or edit it. Changes are saved back to the markdown file.

`default.md` is always shown first. Other topic files are listed below it in alphabetical order. Use the `[+]` button to create a new topic file by name.

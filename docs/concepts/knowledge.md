# Knowledge

Knowledge is a collection of reference documents — structured notes on subjects, not personal context about you. Where memory is a diary the agent keeps about you, the knowledge base is more like a wiki: articles and notes on topics that are useful to have at hand.

## What knowledge is for

Use the knowledge base for:

- How-to guides you want the agent to follow
- Architecture notes for a project you work on
- Research summaries
- Reference material for a specific domain
- Any structured document you want to pull into a conversation selectively

Knowledge documents are loaded on demand — never automatically. You or the agent brings them in only when they are relevant to the current conversation.

## Storage

Knowledge documents live at `~/.yapflows/knowledge/{name}.md`. They are plain markdown files. The name becomes the document's identifier and is what you use in the `#mention` syntax.

## The `#mention` pattern

In the chat composer, type `#` to see autocomplete suggestions from your knowledge documents. Selecting a document:

- Adds a chip to the composer showing which document will be attached
- When you send the message, appends the document's content to your message for that turn

This is how you say "use this reference doc for this answer." The content is available to the agent for that turn only.

## Full-text search

The knowledge list supports full-text search across document titles and content, so you can find the right document quickly even when you have many.

## Memory vs. Knowledge

| Aspect | Memory | Knowledge |
|--------|--------|-----------|
| What it is | Things learned *about you* across conversations | Reference docs on topics and subjects |
| Examples | Preferences, work habits, timezone | Project architecture, how-to guides, research summaries |
| Maintained by | Agent (automatic) | Agent or you (deliberate) |
| Size | Small — kept concise | Large, arbitrary |
| Loading | `default.md` always; topics on demand | On demand only |
| Location | `~/.yapflows/memory/` | `~/.yapflows/knowledge/` |

The distinction is intentional. Memory grows automatically as you have conversations. Knowledge is curated — you write it when you want the agent to have reference material on a specific subject.

## Managing knowledge

The Knowledge tab shows all documents in a sidebar list. Select any document to view and edit it. Each document shows its last-edited timestamp.

Use the `[+]` button to create a new document (you choose the name). Use the row actions menu (`...`) to rename or delete a document.

The agent can also create and edit knowledge documents via bash, following the instructions in its system prompt about the knowledge directory and naming conventions.

# Skills

A skill is a reusable capability packaged as a directory. Skills are not automatically executed — the agent reads what skills are available from its system prompt, decides when to use one, inspects its instructions, and invokes it via the bash tool.

## What skills are

Skills bridge the gap between general-purpose agents and task-specific tools. Instead of hard-coding a capability into an agent's system prompt, you extract it into a skill directory. The agent discovers it, reads the instructions, and calls the provided scripts.

A skill might be:

- A script that pulls your daily calendar and formats it as a standup report
- A tool that summarises a git repository's recent changes
- A web scraper configured for a specific site
- Any reusable workflow you want to invoke repeatedly across conversations

## Skill structure

A skill is a directory with a single required file:

```
skills/
└── my-skill/
    ├── skill.md          (required) Description and usage instructions
    ├── scripts/          Executable scripts the agent calls
    └── assets/           Supporting files: templates, data, configs
```

`skill.md` is the interface between the skill and the agent. It explains what the skill does, how to invoke it (which script, what arguments, what output to expect), and any prerequisites. Write it as clear prose aimed at an AI reader.

## Skill discovery

Yapflows searches for skills in this order:

1. `~/.yapflows/skills/{name}/` — user-defined
2. `backend/skills/{name}/` — built-in

User skills override built-ins with the same name. At the start of each conversation, the assembled system prompt lists all available skills by name and path, so the agent knows what to look for.

## How agents use skills

The agent receives a list of available skills in its system prompt, for example:

> Available skills: daily-standup, git-summary. Read skill.md in any skill directory for usage instructions.

When the agent decides to use a skill, it:

1. Reads the `skill.md` file to understand the interface
2. Calls the appropriate script via bash with the required arguments
3. Processes the output as part of its response

No special tool integration is needed. Skills work entirely through the bash tool.

## Skill access in chat

Type `/` in the chat composer to open the command autocomplete. The `/skills` command lists all available skills in the chat, with their descriptions. This is a quick way to remind yourself what skills the current agent has access to.

## Skills tab

The Skills tab shows all discovered skills — built-in and user-defined. Select a skill to see:

- Its resolved path on disk
- The full contents of its `skill.md`
- A list of files in its directory

Skills are view-only in the UI. To create or modify a skill, write the files directly to `~/.yapflows/skills/{name}/`. The `[↺]` button refreshes the list from disk.

!!! note
    There is no "create skill" button in the UI. Skills are managed as files, not through the app interface. This keeps them version-controllable and editable with your preferred tools.

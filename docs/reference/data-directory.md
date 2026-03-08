# Data Directory

All Yapflows user data lives in `~/.yapflows/`. This directory is created on first run by the setup wizard. Everything here is plain files — no database, no binary formats you cannot inspect.

## Directory tree

```
~/.yapflows/
│
├── settings.json               Global settings: providers, integrations, logging
│
├── agents/                     User-defined agent files
│   └── {name}.md               YAML front matter + system prompt body
│                               Overrides any built-in agent with the same name
│
├── memory/
│   ├── default.md              Auto-loaded in every conversation
│   └── {topic}.md              Topic files — loaded on demand via @mention or by agent
│
├── knowledge/
│   └── {name}.md               Reference documents — loaded on demand via #mention
│
├── chats/
│   └── {session_id}.json       Active chat sessions (JSON)
│
├── archive/
│   └── {session_id}.json       Archived sessions (JSON, read-only in UI)
│
├── tasks/
│   └── {name}.md               Task definitions: cron + agent + prompt
│
├── runs/
│   └── {id}.json               Task run records (one per execution, JSON)
│
├── triggers/
│   └── {name}.md               Webhook trigger definitions: agent + prompt template
│
├── skills/
│   └── {name}/                 User-defined skills (override built-ins by name)
│       ├── skill.md            Description and usage instructions (required)
│       ├── scripts/            Executable scripts the agent calls via bash
│       └── assets/             Supporting files: templates, data, configs
│
├── environments/
│   └── {id}.json               User-defined environment presets (provider + model)
│
└── log/
    └── YYYY-MM-DD_HHMMSS.log   One log file per server start; oldest removed on startup
```

## What each directory contains

### `agents/`

User-defined agent markdown files. These override any built-in agent with the same file stem. Creating `~/.yapflows/agents/assistant.md` replaces the built-in assistant.

### `memory/`

Personal context files the agent maintains about you. `default.md` is always loaded. All other files are topic-specific and loaded on demand — either by you using `@mention` in the chat composer, or by the agent using bash when it decides the topic is relevant.

### `knowledge/`

Reference documents — anything you want available to consult but not auto-loaded. These are loaded on demand via `#mention` in the chat composer.

### `chats/` and `archive/`

Chat sessions are JSON files. Active sessions are in `chats/`. When you archive a session, it moves to `archive/`. Restoring a session moves it back. Deleting a session removes the file permanently.

### `tasks/`

Task definition files. Each file is a markdown document with YAML front matter specifying the cron schedule, agent, model, and options. The body is the prompt sent to the agent on each run.

### `runs/`

One JSON file per task execution. Written immediately when a run is created (before it starts), updated when the run starts and completes. These are records — they are not cleaned up automatically.

### `triggers/`

Webhook trigger definitions. Each file corresponds to an endpoint at `/api/triggers/{name}`. Unlike tasks, triggers have no UI management — create and edit the files directly.

### `skills/`

User-defined skills. Each skill is a directory containing `skill.md` (required) and optionally `scripts/` and `assets/` subdirectories. Skills here take precedence over any built-in skill with the same directory name.

### `environments/`

User-defined environment presets, each as a JSON file. User environments can override built-in environments by using the same `id`.

### `log/`

Log files named by server start timestamp. One file is created per server start. Old files are pruned on startup according to the `log_keep` setting (default: keep the last 30).

## Backup and portability

Because everything is files, backing up Yapflows is a single directory copy. Restoring means copying the directory back.

Sessions, memory, and tasks are all plain text or simple JSON — human-readable and editable in any text editor. There is no migration step or database schema to manage.

## Built-in content

Built-in agents, skills, and environments live in the project directory (`backend/agents/`, `backend/skills/`, `backend/environments/`), not in `~/.yapflows/`. User files always take precedence over built-ins with the same identifier.

# Quickstart

Get Yapflows running in four steps.

## 1. Clone the repository

Clone Yapflows to your machine. It does not need to be installed system-wide — it runs entirely from the project directory.

```bash
git clone https://github.com/yourname/yapflows.git
cd yapflows
```

## 2. Install dependencies

A single command installs both the Python backend and the Node frontend. Yapflows auto-detects your Python version (3.11+ required).

```bash
make install
```

This creates a virtual environment for the backend and runs `npm install` for the frontend. Nothing is installed globally.

## 3. Start the development server

```bash
make dev
```

This starts the backend (port 8000) and frontend (port 3000) concurrently with live reload. On first run, the backend creates `~/.yapflows/` and launches the setup wizard in your browser.

## 4. Complete the setup wizard

Open [http://localhost:3000](http://localhost:3000) in your browser. The setup wizard walks you through:

- Testing your Claude CLI connection (or entering an OpenRouter API key)
- Entering a few details about yourself so the agent can personalise responses

Once setup is complete, you land on the new chat screen. Pick an agent and start talking.

## What's next

- [Concepts: Agents](concepts/agents.md) — understand how agents work and what you can configure
- [Guide: Create an Agent](guides/create-agent.md) — write your first custom agent end-to-end
- [Concepts: Memory](concepts/memory.md) — learn how memory is loaded and maintained across conversations
- [Guide: Schedule a Task](guides/schedule-task.md) — set up an automated daily standup task

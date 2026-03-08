# Setup

## Install

### 1. Clone the repository

```bash
git clone https://github.com/yourname/yapflows.git
cd yapflows
```

### 2. Install all dependencies

```bash
make install
```

This command:

- Detects your Python version (3.11+ required)
- Creates a virtual environment at `backend/.venv`
- Installs backend Python packages
- Runs `npm install` for the frontend

### 3. Start the development server

```bash
make dev
```

Backend starts on port 8000, frontend on port 3000. Both reload automatically on file changes.

## Setup wizard

On first launch, Yapflows detects that no settings exist and redirects to the setup wizard at `/setup`. This is the only route that bypasses the normal app shell.

### Step 1 — Providers

Test and configure each provider. At least one must pass before you can continue.

**Claude CLI** — Yapflows runs `claude --version` to check the connection. If the command is found and returns successfully, the provider is marked as connected. No configuration needed beyond having Claude CLI installed.

**OpenRouter** — Enter your API key. Yapflows makes a minimal test call to verify the key is valid and saves it on success. This step is optional if you already have Claude CLI working.

### Step 2 — About you

A short form where you enter a few details about yourself:

- Your name
- Your timezone (auto-detected from the browser, editable)
- What you do
- Any preferences for how the agent should communicate

These answers are written directly to `~/.yapflows/memory/default.md` and become part of the context the agent sees at the start of every conversation. All fields are optional. You can edit the memory file at any time in the Memory tab.

### Step 3 — Done

A summary of what was configured. Click "Start chatting" to go to the new chat screen.

## Re-running setup

You can re-run the setup wizard at any time from Settings → "Re-run setup wizard". All fields are pre-filled from your current settings and memory. Provider tests can be re-run without resetting anything else.

## Make targets

| Command | What it does |
|---------|-------------|
| `make install` | Install all dependencies (Python + Node) |
| `make dev` | Start backend + frontend with live reload |
| `make build` | Build the frontend for production |
| `make start` | Serve the production build (frontend served by backend) |
| `make test` | Run backend tests |
| `make kill` | Kill processes on ports 8000 and 3000 |
| `make clean` | Remove build artifacts |
| `make venv` | Create the Python virtual environment only |
| `make docs` | Preview documentation locally |

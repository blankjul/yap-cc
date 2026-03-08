# Requirements

## System requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11 or later | Auto-detected by the build system |
| Node.js | 18 or later | Required for the frontend |
| Git | Any recent version | For cloning the repository |
| macOS or Linux | — | Windows is not tested |

## Provider requirements

You need at least one of the following:

### Claude CLI

The Claude CLI is the `claude` command-line tool distributed by Anthropic. It runs as a subprocess — Yapflows sends messages to it and reads back the output.

- Install from the Anthropic CLI installation guide
- Requires an active Anthropic subscription (no API key configuration needed in Yapflows)
- Verify it works by running `claude --version` in your terminal

!!! note
    Claude CLI is the recommended starting point. It requires no API key and gives you access to the full Claude model family.

### OpenRouter (optional)

OpenRouter lets you access models from many providers through a single API key.

- Sign up at [openrouter.ai](https://openrouter.ai) and create an API key
- The key is entered during setup or in Settings → Providers at any time

## Optional dependencies

### Playwright (for browser tool)

The OpenRouter provider includes a browser tool powered by Playwright. It is optional — if not installed, the browser tool is unavailable but everything else works normally.

Playwright is installed automatically if present in your Python environment. The setup wizard will note if it is missing.

## Storage

Yapflows stores all user data in `~/.yapflows/`. This directory is created on first run. It contains conversations, memory, tasks, and settings — all as plain files.

There is no database. Storage requirements are minimal: a typical installation with months of conversation history uses less than 50 MB.

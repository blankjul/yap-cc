# Configuration

All Yapflows configuration lives in `~/.yapflows/settings.json`. This file is created by the setup wizard on first run and can be edited directly or through the Settings tab in the app.

## Settings file

```json
{
  "openrouter_api_key": "sk-or-v1-...",
  "telegram_bot_token": "...",
  "telegram_allowed_chat_ids": [123456789],
  "log_level": "INFO",
  "log_keep": 30,
  "dev_mode": false
}
```

| Field | Default | Purpose |
|-------|---------|---------|
| `openrouter_api_key` | `null` | API key for the OpenRouter provider |
| `telegram_bot_token` | `null` | Bot token from BotFather for Telegram integration |
| `telegram_allowed_chat_ids` | `[]` | List of Telegram user/chat IDs allowed to message the bot |
| `log_level` | `"INFO"` | Log verbosity: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `log_keep` | `30` | Number of log files to retain on each server start |
| `dev_mode` | `false` | When true, logs are also written to stdout with colour |

## Provider configuration

### Claude CLI

Claude CLI requires no configuration in `settings.json`. It runs via the `claude` subprocess using your existing Anthropic subscription. The setup wizard verifies it is installed by running `claude --version`.

### OpenRouter

Set `openrouter_api_key` to your OpenRouter API key. The key can be entered through the setup wizard or the Settings tab, which writes it to `settings.json`. You can also set it as the environment variable `OPENROUTER_API_KEY` — Yapflows reads this as a fallback if the settings file does not contain a key.

## Logging

A new log file is created each time the server starts, named by timestamp:

```
~/.yapflows/log/
├── 2026-03-03_091544.log
├── 2026-03-02_143022.log
└── 2026-03-01_200133.log
```

Old files are cleaned up on startup. The `log_keep` setting controls how many are retained (default: 30).

Set `log_level` to `DEBUG` to see chunk-level provider traffic, memory reads and writes, and detailed tool output. `INFO` is appropriate for normal use.

In development (`make dev`), logs are also printed to the terminal with colour coding. In production, only the log file is written.

## Environment variables

| Variable | Equivalent setting | Notes |
|----------|-------------------|-------|
| `OPENROUTER_API_KEY` | `openrouter_api_key` | Fallback if not in settings file |
| `TELEGRAM_BOT_TOKEN` | `telegram_bot_token` | Fallback if not in settings file |

Environment variables take lower priority than `settings.json`. If both are present, the settings file wins.

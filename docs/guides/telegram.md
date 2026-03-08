# Connect Telegram

This guide walks through creating a Telegram bot with BotFather, connecting it to Yapflows, and testing that messages route correctly to an agent session.

## 1. Create a bot with BotFather

Open Telegram and search for `@BotFather`. Start a conversation and send the `/newbot` command.

BotFather will ask for:

- A display name for the bot (shown in Telegram)
- A username ending in `bot` (e.g. `myassistant_bot`)

Once created, BotFather gives you a bot token — a long string that looks like `123456789:AABBCCdd...`. Copy this token.

## 2. Find your Telegram chat ID

Yapflows requires a list of allowed Telegram chat IDs to control who can message your bot.

The easiest way to find your chat ID is to send a message to the `@userinfobot` Telegram account. It replies with your user ID.

For group chats, the chat ID is negative (e.g. `-100123456789`). You can find it using the same bot or by checking the Telegram API.

## 3. Configure Yapflows

Open Settings → Integrations in the Yapflows app.

Enter:

- **Bot token** — the token from BotFather
- **Allowed chat IDs** — a comma-separated list of Telegram user IDs and/or group IDs that are permitted to message your bot

Click Save. Yapflows starts polling for incoming messages immediately.

## 4. Configure the trigger

Yapflows uses a trigger definition to decide which agent handles Telegram messages. Create a trigger file at `~/.yapflows/triggers/telegram.md`.

The front matter specifies the agent (and optionally a model override). The body is the prompt template. Use `{{payload}}` where you want the incoming Telegram message to appear.

See [Trigger file format](../reference/file-formats.md#trigger-files) for the exact fields.

## 5. Send a test message

Open Telegram and send a message to your bot. Within a few seconds, the bot should reply with the agent's response.

In the Yapflows Chats tab, a new session appears with the Telegram logo. All subsequent messages from the same Telegram chat go to the same sticky session — the agent builds up conversation history with that contact.

## How Telegram sessions work

Each Telegram chat (a user or a group) maps to exactly one sticky session in Yapflows. Sticky means the session is pinned at the top of the chat list and is never auto-archived.

When a message arrives:

1. Yapflows looks up (or creates) the sticky session for that Telegram chat
2. The message is sent to the agent as a new turn
3. The agent's response is sent back via the Telegram API

The conversation history accumulates in the Yapflows session, so the agent has context from all previous Telegram messages.

## Allowed chat IDs

Only chat IDs in the `telegram_allowed_chat_ids` list can trigger the Telegram integration. Messages from other users or groups are silently ignored. This is your primary access control mechanism.

!!! warning
    Keep your bot token private. Anyone with the token can control the bot. Do not commit `settings.json` to version control.

## Troubleshooting

**Bot does not respond** — Check that the bot token is correct in Settings and that the Yapflows server is running.

**Bot responds but the chat ID is blocked** — Verify your Telegram user ID is in the allowed list. You can find your ID using `@userinfobot`.

**Responses are delayed** — Yapflows polls Telegram on a short interval. Slight delays of a few seconds are normal.

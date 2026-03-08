# Schedule a Task

This guide creates a task that runs every weekday morning, asks an agent to generate a standup report, and saves the result as a chat session you can review later.

## 1. Pick an agent

Tasks use an existing agent. For a standup report, any general-purpose agent works — the built-in `assistant` is a good starting point.

If you want the standup to be especially tailored, create a dedicated agent first (see [Create an Agent](create-agent.md)) and use that instead.

## 2. Create the task

Go to the Tasks tab and click `[+]`. Enter the task name — for example, `daily-standup`. This becomes the file name and the identifier shown in the UI.

An inline form opens with the following fields:

- **Agent** — pick the agent from the list
- **Cron** — the schedule expression
- **Model** — leave blank to use the agent's default
- **Prompt** — what to ask the agent each time the task runs
- **Sticky session** — whether runs accumulate in one session or each get a new one

## 3. Write the cron expression

Standard cron format: `minute hour day-of-month month day-of-week`.

For weekdays at 9:00 AM: `0 9 * * 1-5`

Some useful patterns:

| Expression | Meaning |
|-----------|---------|
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 8 * * 1` | Every Monday at 8:00 AM |
| `0 17 * * *` | Every day at 5:00 PM |
| `*/30 * * * *` | Every 30 minutes |

The next scheduled run time appears in the task detail after saving.

## 4. Write the prompt

The prompt body is plain text sent to the agent each time the task fires. Write it as you would write a message in a chat:

> Generate my daily standup report. Include what I worked on yesterday, what I'm working on today, and any blockers. Keep it brief — three short bullet points per section maximum.

The agent has access to its memory (including `default.md`) and any skills available to it. If you want it to pull in work-related memory automatically, add an `@mention` to the prompt or instruct the agent in its system prompt to load the relevant topic.

## 5. Enable the task and verify

Save the task. It appears in the Tasks list with a green "enabled" indicator and shows the next scheduled run time.

To test without waiting for the cron schedule, click "Run now" in the task detail panel. The run appears immediately in the run history with a spinner. Once complete, a link to the generated chat session appears.

Open the session to review the agent's output.

## Sticky sessions

If you set `sticky_session: true`, every run of this task appends to the same chat session instead of creating a new one. This is useful when you want to see the standup history in one place, or when the agent should build on previous runs.

For a standup, a new session per run is usually better — each day's report is independent and easy to find.

## Monitoring runs

The Tasks tab shows run history for the selected task:

- A spinner for in-flight runs, with a link to the live session
- A checkmark for completed runs, with duration and a link to the session
- A warning for failed runs, with the error message

If a run fails, check the session it created (if any) and the log files at `~/.yapflows/log/` for details.

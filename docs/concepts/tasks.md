# Tasks

A task is a scheduled agent run. You define what an agent should do and when it should do it, and Yapflows runs it automatically in the background, creating a chat session for each execution.

## Task definitions and runs

Two distinct concepts work together:

**Task definitions** declare what to run and when. They are stored as files in `~/.yapflows/tasks/{name}.md`. Like agents, they use YAML front matter for configuration and a plain text body for the prompt the agent will receive.

**Task runs** record each individual execution. Every time a task fires, a new run record is created immediately — even if the run is still in progress. Runs are stored in `~/.yapflows/runs/{id}.json`.

## Task configuration

| Field | Purpose |
|-------|---------|
| `cron` | A standard cron expression defining when the task fires |
| `agent` | Which agent runs this task |
| `model` | Model override (leave blank to use the agent's default) |
| `enabled` | Whether the task is active |
| `sticky_session` | Whether all runs of this task reuse the same session |

The body of the task file is the prompt sent to the agent on each run. It is plain text.

## Sticky session tasks

By default, each task run creates a new chat session. The session is visible in the Chats tab under the Scheduled filter, with a link to the task that created it.

When `sticky_session` is true, every run of the task reuses the same session — the agent appends each run's message and response to the same conversation history. This is useful for tasks that accumulate state over time, such as a heartbeat that tracks something incrementally.

## The execution queue

Yapflows processes task runs one at a time through a single background queue. When a cron expression fires:

1. A run record is created (status: pending) and written to disk
2. The run is placed on the queue
3. The background worker picks it up, runs the session, and updates the run status

"Run now" places a run on the back of the queue — it does not jump ahead of any already-queued runs.

## Run history

The Tasks tab shows the selected task's definition alongside its recent run history:

- An in-flight run shows a spinner and a link to the live session
- Completed runs show status (done or failed), timestamp, duration, and a link to the session
- Failed runs show the error message

## Managing tasks

Tasks can be created, edited, enabled, disabled, and deleted from the Tasks tab. You can also trigger a manual run with the "Run now" button.

Editing a task opens an inline form where you can change the cron expression, prompt, model, and sticky session setting.

!!! note
    Tasks run in the background even when the browser is closed. You will see the run history and resulting sessions when you next open the app.

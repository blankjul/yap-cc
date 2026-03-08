# Build a Custom Skill

This guide creates a skill that generates a weekly summary of git activity across a repository. After completing it, any agent will be able to invoke the skill by name.

## 1. Create the skill directory

User-defined skills live in `~/.yapflows/skills/{name}/`. Create a directory for your skill:

```
~/.yapflows/skills/git-summary/
```

The directory name is the skill identifier — it appears in the Skills tab and in the system prompt the agent receives.

## 2. Write the skill instructions (skill.md)

`skill.md` is the only required file. It is the interface between your skill and the agent — the agent reads it to understand what the skill does and how to invoke it.

Write it as clear prose aimed at an AI reader. Include:

- What the skill does (one paragraph)
- How to invoke it: which script to call, what arguments it accepts
- What output to expect
- Any prerequisites or limitations

Be explicit. The agent uses this file verbatim to decide how to call the skill.

## 3. Write the script

Create a `scripts/` directory inside your skill directory and put your executable there.

The script can be written in any language available on your system — shell, Python, Ruby, anything. It receives arguments from the agent and writes output to stdout, which the agent reads back.

Design the script's interface around what an agent needs:

- Accept arguments as positional parameters or flags
- Output plain text or markdown that the agent can include in its response
- Exit with a non-zero code and a clear error message if something goes wrong

## 4. Test the script manually

Before involving the agent, run the script from the terminal to verify it works correctly. Fix any issues in the script directly. Once the script behaves as expected, the agent invocation will work.

## 5. Verify the skill appears in the UI

Open the Skills tab in Yapflows and click `[↺]` to refresh. Your new skill should appear in the list with its name and the first paragraph of `skill.md` as the description.

Select it to see the full `skill.md` content and the list of files in the directory.

## 6. Use the skill in a chat

Start a new chat with any agent. The system prompt now includes a reference to your skill and its path. Ask the agent to use the skill in natural language — for example:

> Summarise the git activity in my main project from the past week using the git-summary skill.

The agent will read `skill.md`, construct the bash command, and run it. The output comes back as part of the response.

## Tips for good skills

**Keep the script output agent-friendly.** Markdown works well. Avoid binary output, ANSI escape codes, or heavily structured data unless the skill.md tells the agent exactly how to parse it.

**Make skill.md the authoritative reference.** If the script changes, update skill.md too. The agent has no other way to know the interface changed.

**Fail loudly.** If the script encounters an error, print a clear error message to stdout and exit non-zero. The agent will relay the error message in its response, making debugging straightforward.

**Use assets for supporting files.** Templates, configuration files, and reference data belong in the `assets/` subdirectory. Reference them using the script's own directory as the base path.

## Skill structure reference

```
~/.yapflows/skills/{name}/
├── skill.md          Description and usage instructions (required)
├── scripts/          Executables the agent calls via bash
│   └── run.sh
└── assets/           Supporting files: templates, data, configs
```

The only file Yapflows reads directly is `skill.md`. Everything else is up to you.

# YAP (Yet Another Prompt)

**Fast, token-efficient meta prompting framework for Claude Code**

Yap through your projects with structured workflows, specialized AI agents, and autonomous execution.

## What is YAP?

YAP is a workflow system that helps you build software features efficiently with Claude Code:

- **Token-efficient**: <100k tokens per feature (50% less than alternatives)
- **Fast execution**: Uses Haiku/Sonnet models (3x faster than Opus)
- **Quality code**: Specialized agents for planning, execution, and verification
- **Git-integrated**: Atomic commits per task with conventional commit messages
- **Autonomous**: 4 deviation rules allow auto-fixing bugs without constant user input

## Who This Is For

Developers who want to build features efficiently with AI assistance - without token bloat or context degradation.

## Getting Started

```bash
npx yap
```

The installer prompts you to choose:

1. **Runtime** — Claude Code (more runtimes coming soon)
2. **Location** — Global (all projects) or local (current project only)

Verify with `/yap:start` inside Claude Code.

## Staying Updated

YAP evolves fast. Update periodically:

```bash
npx yap@latest
```

## Non-interactive Install

For Docker, CI, or scripts:

```bash
# Claude Code
npx yap --claude --global   # Install to ~/.claude/
npx yap --claude --local    # Install to ./.claude/

# Short flags
npx yap -c -g               # Same as above
npx yap -c -l               # Same as above
```

Use `--global` (`-g`) or `--local` (`-l`) to skip the location prompt.
Use `--claude` (`-c`) to skip the runtime prompt.

## Development Installation

Clone the repository and run the installer locally:

```bash
git clone https://github.com/blankjul/yap.git
cd yap
node bin/install.js --claude --local
```

Installs to `./.claude/` for testing modifications before contributing.

## Quick Start

After installation:

```bash
# Start Claude Code
claude-code

# Inside Claude Code:
/yap:start              # Initialize new project or show progress
/yap:feature "name"     # Create a new feature
/yap:execute 1          # Execute feature 1
/yap:verify 1           # Verify completion
```

## Core Commands

- `/yap:start` - Smart session starter (init new/brownfield or show progress)
- `/yap:feature` - Create new feature
- `/yap:execute` - Plan and execute feature
- `/yap:verify` - Verify with automated + manual checks
- `/yap:discuss` - Design discussion (optional)
- `/yap:research` - Research libraries (optional)

## Documentation

Full documentation is available in `.claude/CLAUDE.md` after installation.

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

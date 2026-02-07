# YAP Architecture - Skills-Based Design

**Date:** 2026-02-07
**Version:** 2.0 (Skills-based)

## Overview

YAP uses a **modular skills architecture** where lightweight orchestrator commands route to specialized skills that run in forked subagent contexts.

### Key Benefit

**Before:** 905-line monolithic command with inline agent spawning
**After:** Modular skills (100-200 lines each) + lightweight orchestrators (~200 lines)

---

## File Structure

```
yap/
├── .claude/
│   └── skills/                    # Specialized skills
│       ├── yap-research/
│       │   └── SKILL.md           # Research libraries/patterns
│       ├── yap-discuss/
│       │   └── SKILL.md           # Design discussion
│       ├── yap-execute/
│       │   └── SKILL.md           # Planning + implementation
│       ├── yap-verify/
│       │   └── SKILL.md           # Quality verification
│       └── yap-explore/
│           └── SKILL.md           # Brownfield codebase scanning
│
├── commands/yap/                  # Lightweight orchestrators
│   ├── start.md                   # Smart starter (routes to skills)
│   └── feature.md                 # Feature manager (routes to skills)
│
├── PROJECT.md                     # Project vision
├── ROADMAP.md                     # Progress tracker
└── .yap/
    ├── features/                  # Feature files (F##-name.md)
    ├── research/                  # Research findings (R##-topic.md)
    └── config.json                # Configuration
```

---

## Architecture Layers

### Layer 1: User Interface (Orchestrators)

**Commands users invoke:**
- `/yap:start` - Smart session starter
- `/yap:feature` - Feature manager

**Responsibilities:**
- Parse user input
- Route to appropriate skill
- Handle simple queries (list, status)
- Create feature files (inline)

**Size:** ~200 lines each

---

### Layer 2: Workflow Skills (Core Phases)

**Phase skills users can invoke directly:**
- `/yap-research` - Investigate libraries/patterns
- `/yap-discuss` - Clarify requirements
- `/yap-execute` - Plan + implement
- `/yap-verify` - Validate completion

**Responsibilities:**
- Execute specific workflow phase
- Run in `context: fork` (fresh subagent)
- Use built-in agents (general-purpose, Explore)
- Dynamic context injection with `!`command``
- Update feature files
- Git commits

**Size:** 150-250 lines each

---

### Layer 3: Utility Skills

**Helper skills:**
- `/yap-explore` - Brownfield codebase scanning
- `/yap-plan` - Just planning (used by execute)
- `/yap-status` - Progress reporting

**Responsibilities:**
- Support main workflow
- Can be invoked by other skills
- Modular, reusable

---

## Data Flow

### Example: Execute Workflow

```
User: /yap:feature F01 execute
  ↓
[Orchestrator: commands/yap/feature.md]
  - Parses "F01 execute"
  - Resolves F01
  - Routes to skill
  ↓
[Skill: .claude/skills/yap-execute/SKILL.md]
  - context: fork (runs in subagent)
  - Loads feature context with !`cat .yap/features/F01-*.md`
  - Checks if planning needed
  - Plans if needed (2-3 tasks)
  - Executes each task
  - Applies deviation rules
  - Makes atomic git commits
  - Updates ROADMAP.md
  - Returns summary
  ↓
User sees: Complete execution summary with commits
```

---

## Skill Details

### yap-research (Research Skill)

**Purpose:** Investigate libraries and patterns
**Agent:** general-purpose (Sonnet)
**Context:** fork
**Tools:** Read, Grep, Glob, WebSearch, WebFetch, Write, Edit, Bash(git *)

**Workflow:**
1. Load feature context dynamically
2. Identify research questions
3. Research 2-3 options per question
4. Compare pros/cons
5. Provide recommendation with code example
6. Write to `.yap/research/R##-{topic}.md`
7. Update feature Research section
8. Git commit

**Output:** Research file + updated feature

---

### yap-discuss (Discussion Skill)

**Purpose:** Clarify requirements through interactive discussion
**Agent:** (none - runs in main session for interactivity)
**Context:** (no fork - needs user interaction)
**Tools:** Read, Write, Edit, AskUserQuestion, Bash(git *)

**Workflow:**
1. Load feature description
2. Ask clarifying questions (AskUserQuestion)
3. Identify edge cases
4. Define verification strategy
5. Update Discussion section
6. Update Verification section
7. Git commit

**Output:** Updated feature with requirements, edge cases, verification

**Note:** Doesn't use `context: fork` because it needs interactive Q&A

---

### yap-execute (Execution Skill)

**Purpose:** Plan and implement features with atomic tasks
**Agent:** general-purpose (Haiku, escalates to Sonnet)
**Context:** fork
**Tools:** Read, Write, Edit, Grep, Glob, Bash, Task

**Workflow:**
1. Check if Plan section exists
2. If missing: Create 2-3 atomic tasks
3. For each task:
   - Mark in-progress
   - Implement
   - Apply 4 deviation rules
   - Run verification
   - Atomic git commit
   - Mark complete
4. Update ROADMAP.md
5. Return summary

**Output:** Implemented feature with commits

---

### yap-verify (Verification Skill)

**Purpose:** Verify completion with automated + manual checks
**Agent:** general-purpose (Haiku)
**Context:** fork
**Tools:** Read, Grep, Glob, Bash, Write, Edit, AskUserQuestion

**Workflow:**
1. Run automated checks (tests, builds, API calls)
2. Artifact verification (exists, substantive, wired)
3. Prompt manual verification (AskUserQuestion)
4. If pass: Mark complete in ROADMAP.md
5. If fail: Create fix tasks
6. Git commit
7. Return results

**Output:** Verification report + PASS/FAIL status

---

### yap-explore (Exploration Skill)

**Purpose:** Scan brownfield codebases and generate features
**Agent:** Explore (optimized for codebase scanning)
**Context:** fork
**Tools:** Read, Grep, Glob, Bash(find *, wc *, cloc *)

**Workflow:**
1. Scan project structure
2. Identify tech stack
3. Find subsystems
4. Identify gaps (missing tests, error handling, etc.)
5. Generate 3-5 feature recommendations
6. Create feature files
7. Create PROJECT.md and ROADMAP.md
8. Git commit

**Output:** Generated features for brownfield project

---

## Orchestrator Details

### /yap:start (Smart Starter)

**Responsibilities:**
- Detect project state (greenfield, brownfield, existing)
- Brownfield: Call `/yap-explore`
- Greenfield: Initialize structure
- Existing: Show progress

**Routes to:**
- `/yap-explore` (if brownfield)

**Handles inline:**
- Project initialization
- Progress display

**Size:** ~200 lines

---

### /yap:feature (Feature Manager)

**Responsibilities:**
- Parse arguments
- Route to workflow skills
- Create feature files
- Show status/list

**Routes to:**
- `/yap-research F##` (research phase)
- `/yap-discuss F##` (discuss phase)
- `/yap-execute F##` (execute phase)
- `/yap-verify F##` (verify phase)

**Handles inline:**
- Feature file creation
- Status display
- List all features

**Size:** ~200 lines

---

## Dynamic Context Injection

Skills use `!`command`` syntax to load exactly what they need:

```yaml
# yap-execute/SKILL.md
---
context: fork
---

Feature file: !`cat .yap/features/$ARGUMENTS-*.md`
Project state: !`cat PROJECT.md`
Roadmap: !`cat ROADMAP.md`
```

**Benefits:**
- Only load needed context
- Always fresh data
- No stale context bugs
- Token-efficient

---

## Skills vs Agents

### Current Approach: Skills with Built-in Agents

```yaml
# yap-research/SKILL.md
---
context: fork
agent: general-purpose  # Built-in agent
model: sonnet
---

Research instructions here...
```

**Pros:**
- Simpler (one file per capability)
- Built-in agents sufficient
- Dynamic context injection
- Fast to implement

### Future: Custom Agents (if needed)

If we need reusable agent personalities:

```yaml
# .claude/agents/yap-executor.md
---
name: yap-executor
model: haiku
---

You follow the 4 deviation rules...
```

Then reference from skill:

```yaml
# yap-execute/SKILL.md
---
context: fork
agent: yap-executor  # Custom agent
---
```

**When to add custom agents:**
- Shared behavior across multiple skills
- Complex tool permission patterns
- Reusable personalities

---

## Comparison: Before vs After

### Before (Monolithic)

```
commands/yap/feature.md (905 lines)
├── CREATE handler (inline)
├── RESEARCH handler (spawn Task tool)
│   └── Spawns Researcher agent
├── DISCUSS handler (inline 100 lines)
├── EXECUTE handler (spawn Task tool)
│   ├── Spawns Planner agent
│   └── Spawns Executor agent(s)
├── VERIFY handler (spawn Task tool)
│   └── Spawns Verifier agent
├── STATUS handler (inline)
└── LIST handler (inline)
```

**Problems:**
- 905 lines in one file
- Mixed responsibilities
- Hard to maintain
- Can't reuse phases
- Double-spawning (command → Task → agent)

---

### After (Modular)

```
commands/yap/feature.md (~200 lines)
├── CREATE handler (inline)
├── RESEARCH → /yap-research
├── DISCUSS → /yap-discuss
├── EXECUTE → /yap-execute
├── VERIFY → /yap-verify
├── STATUS handler (inline)
└── LIST handler (inline)

.claude/skills/
├── yap-research/SKILL.md (200 lines, context: fork)
├── yap-discuss/SKILL.md (150 lines, main session)
├── yap-execute/SKILL.md (250 lines, context: fork)
└── yap-verify/SKILL.md (200 lines, context: fork)
```

**Benefits:**
- ✅ Modular (150-250 lines per file)
- ✅ Single responsibility per skill
- ✅ Easy to maintain
- ✅ Reusable (invoke directly or via orchestrator)
- ✅ Native Claude Code skills (no double-spawning)
- ✅ Fresh contexts (context: fork)
- ✅ Dynamic context injection

---

## Token Efficiency

### Skills with `context: fork`

Each skill runs in a **fresh 200k context**:
- No degradation from prior conversation
- Peak quality throughout
- Only loads what it needs via `!`command``

### Example: Execute Skill

**Context loaded:**
```
Feature file: ~2k tokens
PROJECT.md: ~1k tokens
ROADMAP.md: ~1k tokens
Dependencies: ~500 tokens
---
Total: ~4.5k tokens
```

**Remaining:** 195.5k for execution

**Result:** Can implement 3 tasks comfortably within one feature (<100k total)

---

## Workflow Examples

### Greenfield Project

```bash
/yap:start
→ Initializes structure, asks questions
→ Creates PROJECT.md, ROADMAP.md

/yap:feature "user authentication"
→ Creates F01-user-authentication.md

/yap-discuss F01
→ Clarifies requirements (optional)

/yap-research F01
→ Investigates JWT libraries (optional)

/yap-execute F01
→ Plans + implements feature

/yap-verify F01
→ Verifies completion
```

---

### Brownfield Project

```bash
/yap:start
→ Detects existing code
→ Calls /yap-explore
→ Generates F01, F02, F03 features

/yap-execute F01
→ Implements first feature (e.g., "Add test coverage")

/yap-verify F01
→ Verifies tests work
```

---

## Future Enhancements

### Phase 1 (Current): Skills with Built-in Agents
- ✅ Implemented
- Use general-purpose, Explore agents
- Simple, fast

### Phase 2 (Future): Custom Agents
- Create `.claude/agents/yap-executor.md`
- Reusable agent personalities
- Shared tool permissions

### Phase 3 (Future): Skill Composition
- Skills calling other skills
- `/yap-execute` calls `/yap-plan` internally
- Nested workflows

### Phase 4 (Future): Parallel Execution
- Execute independent tasks in parallel
- Multiple executor agents simultaneously
- Coordinated by execute skill

---

## Summary

**Old architecture:** Monolithic commands spawning Task tools
**New architecture:** Modular skills with `context: fork`

**Result:**
- 80% less code per file
- Better separation of concerns
- Easier to maintain and extend
- Native Claude Code skills
- Fresh contexts for quality
- Token-efficient

**Ready to use:**
- `/yap:start` - Smart starter
- `/yap:feature` - Feature manager
- `/yap-research` - Research skill
- `/yap-discuss` - Discussion skill
- `/yap-execute` - Execution skill
- `/yap-verify` - Verification skill
- `/yap-explore` - Exploration skill

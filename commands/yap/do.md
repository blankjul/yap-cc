---
name: yap:do
description: Orchestrate quick task workflow - description, execute, verify
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - AskUserQuestion
  - Skill
---

# /yap:do Command

Orchestrate the lightweight "do" workflow for quick tasks.

## Responsibilities
- Create new do task files (D##-name.md)
- Update ROADMAP.md with new do tasks
- Manage workflow phases: Description → Execute → Verify
- Resume from current phase based on file contents
- Handle loop-backs for verification failures
- Update .claude/CLAUDE.md with learnings

## Usage

```bash
/yap:do "fix login redirect"    # Create new do task D01
/yap:do D01                     # Continue existing do task
/yap:do 1                       # Continue do task D01 (number only, must use D prefix to avoid confusion with features)
/yap:do "fix bug"               # Fuzzy match on name
/yap:do                         # Continue current do task
```

## Execution Flow

### Phase 0: Target Resolution

1. Parse argument
   - No argument: Read ROADMAP.md, find current 🔄 do task
   - D## format: Use directly
   - Number alone: Error (ambiguous - use D## or F##)
   - Name: Fuzzy match existing do tasks or create new

2. Determine mode:
   - Do file exists: **Continue mode** (resume workflow)
   - Do doesn't exist: **Create mode** (new do task)

### Create Mode (New Do Task)

3. Check if ROADMAP.md exists
   - If not: Warn to run /yap:init first
   - If exists: Continue

4. Scan .yap/do/ for next number
   - Find highest D## number
   - Next = highest + 1 (or D01 if none)

5. Ask task type
   - Question: "What type of task is this?"
   - Options:
     - "Fix/Bug fix"
     - "Refactor"
     - "Update dependencies"
     - "Documentation"
     - "Other"

6. Ask priority
   - Question: "What's the priority?"
   - Options:
     - "High (urgent)"
     - "Medium (normal)"
     - "Low (nice to have)"

7. Create do task file
   - Filename: D##-{slug}.md
   - Load template from .yap/templates/do.md
   - Fill frontmatter with number, name, type, priority
   - Write to .yap/do/

8. Update ROADMAP.md
   - Add to Quick Tasks (Do) section
   - Format:
     ```markdown
     - [ ] D##: {Task Name} ☐
       - Description: [Brief description]
       - Status: Not started
     ```

9. Start workflow at Description phase

### Continue Mode (Resume Workflow)

10. Read do task file
    - Parse all sections
    - Determine current phase (see Phase Detection)

11. Resume at current phase:
    - **Description**: Define what needs doing
    - **Execute**: Implement changes
    - **Verify**: Verify completion

### Workflow Phases

#### Phase 1: Description
12. Define task
    - Ask: "What needs to be done?"
    - Ask: "Why is this needed now?"
    - Ask: "Any relevant context?"
    - Update Description section with:
      - What (clear statement)
      - Why (context/reason)
      - Context (related features, background)
    - Move to Execute phase

#### Phase 2: Execute
13. Execute task
    - Create inline simple plan (1-3 steps)
    - Use Haiku model (light task)
    - Implement changes
    - Make atomic git commit
    - Update Execution section
    - Move to Verify phase

#### Phase 3: Verify
14. Verify completion
    - Run automated checks (tests, build)
    - Prompt manual verification
    - If pass: Call `/yap-memory D##`, then mark do task ✅ in ROADMAP.md
    - If fail: Loop back to Execute with fixes

### Loop-back Handling

15. If verification fails:
    - Add fix steps to Execution section
    - Mark as "Fixes" in file
    - Return to Execute phase
    - Re-verify when complete

## Phase Detection Logic

```
Read do task file and check sections:

1. Description empty → Start at Description
2. Description exists, Execution empty → Execute
3. Execution complete, Verification empty → Verify
4. Verification complete → Already done (offer to verify again)
```

## Output Examples

### New Do Task Creation
```
✓ Do task D03 created: fix-login-redirect

File: .yap/do/D03-fix-login-redirect.md
Type: Fix
Priority: High
Added to ROADMAP.md (Quick Tasks)

Starting workflow: Description phase
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Let's describe this task...
[Questions follow]
```

### Resuming Do Task
```
Resuming D03-fix-login-redirect...

Current phase: Execute
Description: Fix redirect loop in login flow

Executing changes...
```

### Verification Loop-back
```
⚠️ Verification failed for D03-fix-login-redirect

Issues:
- Tests still failing: login.test.ts

Adding fix steps...

Returning to Execute phase...
```

## Comparison: /yap:do vs /yap:feature

| | Do Task | Feature |
|---|---|---|
| **Workflow** | 3 phases (Description, Execute, Verify) | 6 phases (Discuss, Requirements, Research, Plan, Execute, Verify) |
| **Planning** | Inline/simple | Full Planner agent |
| **Size** | Small, quick (1 file, few changes) | Large, structured (multiple files, multiple tasks) |
| **Model** | Haiku (fast) | Haiku → Sonnet as needed |
| **Example** | "Fix bug", "Update deps", "Add logging" | "User authentication", "Shopping cart", "Payment flow" |

## Memory System

After successful verification, call `/yap-memory D##` skill to:
- Extract learnings (token-conscious!)
- Update .claude/CLAUDE.md (only high-signal learnings)
- Update ROADMAP.md status
- Git commit

The skill handles all memory operations - do NOT update CLAUDE.md directly.

## Error Handling

- If ROADMAP.md missing: Suggest /yap:init
- If do number doesn't exist: List available do tasks
- If fuzzy match returns multiple: Ask user to choose
- If workflow gets stuck: Offer to skip phase

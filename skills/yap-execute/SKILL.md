---
name: yap-execute
description: Execute a YAP feature with planning and implementation. Creates 2-3 atomic tasks, implements them, and makes git commits.
argument-hint: [feature-number]
context: fork
agent: general-purpose
model: haiku
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Task
disable-model-invocation: true
---

# Feature Execution Agent

You are the YAP Executor agent. Your job is to plan (if needed) and implement a feature with atomic tasks and commits.

## Context

**Feature file:** !`cat .yap/features/$ARGUMENTS-*.md 2>/dev/null || echo "Feature $ARGUMENTS not found"`

**Project state:** !`cat PROJECT.md 2>/dev/null || echo "No PROJECT.md"`

**Roadmap:** !`cat ROADMAP.md 2>/dev/null || echo "No ROADMAP.md"`

**Dependencies:** !`grep -A5 "^requires:" .yap/features/$ARGUMENTS-*.md 2>/dev/null | grep -v "^--$" || echo "[]"`

## Phase 1: Check if Planning is Needed

Read the feature file and check if the `## Plan` section exists and has content.

**If Plan section is empty or missing:** Go to Planning Phase

**If Plan section exists:** Skip to Execution Phase

---

## Planning Phase

### Create 2-3 Atomic Tasks

Break the feature into 2-3 tasks that:
- Can be completed independently (or have clear dependencies)
- Result in one git commit each
- Have clear verification criteria
- Are roughly equal in complexity

**Task structure:**
```markdown
- [ ] Task {FEATURE}.1: {Short description}
  - [ ] Subtask 1
  - [ ] Subtask 2
  - [ ] Subtask 3
  - Verification: `{command to verify}`
  - Model: haiku/sonnet
```

### Assign Models

- **haiku** for straightforward implementation (80% of tasks)
- **sonnet** for complex logic, algorithms, or intricate patterns

### Determine Execution Strategy

- **Sequential:** Tasks must run in order (default)
- **Parallel:** Tasks can run simultaneously (rare, only if truly independent)

### Write Plan Section

Update the feature file's `## Plan` section:

```markdown
## Plan

**Created:** $(date +%Y-%m-%d)
**Strategy:** Sequential
**Estimated tokens:** ~{estimate}k

### Task Breakdown

- [ ] Task $ARGUMENTS.1: {Description}
  - [ ] Subtask 1
  - [ ] Subtask 2
  - Verification: `{command}`
  - Model: haiku

- [ ] Task $ARGUMENTS.2: {Description}
  - [ ] Subtask 1
  - [ ] Subtask 2
  - Verification: `{command}`
  - Model: haiku

- [ ] Task $ARGUMENTS.3: {Description}
  - [ ] Subtask 1
  - [ ] Subtask 2
  - Verification: `{command}`
  - Model: sonnet

### Dependencies

- Task 2 depends on Task 1 (uses auth utilities)
- Task 3 independent

### Commit Strategy

- Task 1 → `feat($ARGUMENTS-1): {description}`
- Task 2 → `feat($ARGUMENTS-2): {description}`
- Task 3 → `feat($ARGUMENTS-3): {description}`
```

### Commit the Plan

```bash
git add .yap/features/$ARGUMENTS-*.md
git commit -m "plan(F$ARGUMENTS): create execution plan

Tasks:
- Task 1: {description}
- Task 2: {description}
- Task 3: {description}

Strategy: Sequential
Estimated: ~{X}k tokens

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Execution Phase

### For Each Task (Sequential or Parallel)

#### 1. Mark Task In-Progress

Update the feature file:
```markdown
- [x] Task $ARGUMENTS.1: {Description}  ← Change ☐ to 🔄
```

#### 2. Implement the Task

Follow the task definition exactly:
- Complete all subtasks
- Apply the 4 deviation rules (see below)
- Ensure code is production-ready (no TODOs, no stubs)
- Wire everything together (imports, exports, usage)

#### 3. Apply the 4 Deviation Rules

**Rule 1: Auto-fix bugs** (no permission needed)
- Broken behavior, logic errors, type errors
- Security vulnerabilities (XSS, SQL injection, etc.)
- **Just fix it and note in commit**

**Rule 2: Auto-add missing critical functionality** (no permission needed)
- Missing error handling for expected failures
- Missing validation for user input
- Missing security checks (auth, rate limiting)
- **Add it and note in commit**

**Rule 3: Auto-fix blocking issues** (no permission needed)
- Missing dependencies (install them)
- Broken imports (fix them)
- Configuration errors (fix them)
- **Fix it and note in commit**

**Rule 4: Ask about architectural changes** (requires permission)
- Adding database tables
- Switching frameworks or major libraries
- Changing authentication approach
- **STOP and ask user before proceeding**

**Format for deviations in commit:**
```
Deviations:
- Added rate limiting (Rule 2: missing critical security)
- Fixed import paths (Rule 3: blocking issue)
```

#### 4. Run Task Verification

Execute the verification command from the plan:
```bash
{verification_command}
```

If it fails:
- **Apply Rule 1** (auto-fix bugs)
- Fix the issue
- Re-run verification
- Include fix in commit

#### 5. Make Atomic Git Commit

```bash
git add .
git commit -m "feat($ARGUMENTS-{task_num}): {description}

{2-3 line explanation of what was implemented}

Verification: {verification_command} ✓

Deviations:
- {deviation 1 if any}
- {deviation 2 if any}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

#### 6. Mark Task Complete

Update the feature file:
```markdown
- [x] Task $ARGUMENTS.1: {Description}  ← Change 🔄 to ✅
  Commit: {hash} - {message}
```

#### 7. Update ROADMAP.md

Update the progress for this feature:
```markdown
F$ARGUMENTS {name}    🔄  {percentage}%
```

Calculate percentage: (completed_tasks / total_tasks) * 100

---

## After All Tasks Complete

### 1. Update Feature Status

If all tasks are ✅, update ROADMAP.md:
```markdown
F$ARGUMENTS {name}    ✅ 100%
```

### 2. Output Summary

Return to the user:

```
✓ Feature F$ARGUMENTS: {Feature Name} - COMPLETE

Tasks executed:
✅ Task $ARGUMENTS.1: {description} (15k tokens, Haiku)
   Commit: abc123 - feat(F$ARGUMENTS-1): {message}

✅ Task $ARGUMENTS.2: {description} (18k tokens, Haiku)
   Commit: def456 - feat(F$ARGUMENTS-2): {message}
   Deviations: Added rate limiting (Rule 2)

✅ Task $ARGUMENTS.3: {description} (22k tokens, Sonnet)
   Commit: ghi789 - feat(F$ARGUMENTS-3): {message}

Total tokens: ~55k (under budget ✓)
Model usage: 2 Haiku, 1 Sonnet

Next steps:
- /yap-verify $ARGUMENTS - Verify the implementation
- git log --oneline -3 - Review commits
```

## Token Estimation Guidelines

Estimate tokens per task:
- **Simple CRUD:** 10-15k tokens (haiku)
- **Business logic:** 15-25k tokens (haiku)
- **Complex algorithms:** 25-40k tokens (sonnet)
- **Integration work:** 20-30k tokens (haiku→sonnet)

**Target:** <100k tokens total per feature

## Quality Standards

**NO STUBS:**
- Every function must have real implementation
- No `// TODO:` comments
- No placeholder functions that return null/undefined

**WIRED:**
- New files must be imported where they're used
- New functions must be called somewhere
- New components must be rendered in the app

**TESTED:**
- Run verification command for each task
- If tests exist, they must pass
- If no tests, manual verification in final verify phase

## Error Handling

- If feature not found: Error "Feature $ARGUMENTS not found"
- If dependency incomplete: Error "Feature depends on F{X} which is incomplete"
- If Rule 4 triggered: Ask user and wait for response
- If task verification fails: Auto-fix (Rule 1), re-verify, note in commit
- If auto-escalate to Sonnet: Note in output summary

## Model Auto-Escalation

If a task assigned to Haiku fails:
1. Retry with Sonnet automatically
2. Note in output: "Task X: Auto-escalated to Sonnet"
3. Include escalation reason in summary

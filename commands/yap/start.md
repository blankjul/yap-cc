---
name: yap:start
description: Smart session starter - initialize new/brownfield project OR load context for existing project
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
  - Glob
  - Skill
---

# /yap:start - Session Starter

Detects project state and routes to appropriate flow.

## Execution Logic

### 1. Detect State

```
.yap/ exists + code exists     → Existing Project Flow
.yap/ missing + code exists    → Brownfield Flow
.yap/ missing + no code        → Greenfield Flow
```

Brownfield detection: Check for `src/`, `app/`, `package.json`, `requirements.txt`, etc.

---

### 2A. Brownfield Flow (Existing Code, No YAP)

1. **Welcome:** "Welcome to YAP! I detected existing code."

2. **Ask:** Use AskUserQuestion
   - "Explore codebase and generate features (Recommended)"
   - "Start fresh, I'll create features manually"

3. **If Explore chosen:**
   - Create `.yap/` structure
   - Call `/yap-explore` skill (handles everything: scan, generate features, create PROJECT.md/ROADMAP.md, git commit)
   - Relay skill output to user

4. **If Start fresh:**
   - Continue to Greenfield Flow

---

### 2B. Greenfield Flow (New Project)

1. **Ask project questions:**
   - Project name
   - Vision (1-2 sentences)
   - Goals (3-5 specific goals)
   - Tech stack (frontend, backend, database)
   - Constraints (time, budget)
   - Success criteria
   - Non-goals

2. **Create structure:**
   - `PROJECT.md` (from template)
   - `.yap/ROADMAP.md` (empty state)
   - `.yap/features/`, `.yap/do/`, `.yap/research/`, `.yap/templates/`
   - `.yap/config.json`

3. **Ask:** "Plan features now?" (yes → suggest `/yap:roadmap`, no → manual)

4. **Git commit:** `"chore(init): initialize YAP project structure"`

5. **Output:**
   ```
   ✓ YAP project initialized!

   Next steps:
   1. /yap:roadmap (plan features)
      OR
   2. /yap:feature "name" (create first feature)
   3. /yap:do "task" (quick tasks)
   ```

---

### 2C. Existing Project Flow

1. **Read context:**
   - `PROJECT.md` (name, vision)
   - `.yap/ROADMAP.md` (features, status)
   - `.yap/features/F*.md` (scan for in-progress)

2. **Welcome back:** "Welcome back to [ProjectName]!"

3. **Show progress:** `"Progress: 3/8 features (38%)"`

4. **Detect unfinished work:**
   - Check ROADMAP.md for `in-progress` status or `🔄`
   - Check feature files for incomplete tasks (`- [ ]`)
   - Find most recently modified feature

5. **If unfinished work:**
   - Ask: "Resume F04?" (Yes/No)
   - If yes: Call `/yap:feature F04 execute`
   - If no: Show next actions

6. **Suggested actions:**
   ```
   1. /yap:feature F05 execute
   2. /yap:feature "name"
   3. /yap:do "task"
   ```

7. **Load context:** Summarize tech stack, constraints, recent features

---

## Error Handling

- PROJECT.md exists but .yap/ missing → "Partial init detected, re-run /yap:start"
- ROADMAP.md missing → Generate from feature files
- No git → Skip commits (warn user)

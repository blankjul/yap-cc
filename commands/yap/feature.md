---
name: yap:feature
description: Create and manage features - lightweight orchestrator that routes workflow phases to specialized skills
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Skill
  - AskUserQuestion
---

# /yap:feature - Lightweight Orchestrator

Routes feature operations to specialized skills. Handles feature creation and status queries inline.

## Usage

```bash
# Workflow order:
/yap:feature "user authentication"    # 1. Create new feature
/yap:feature F01 discuss              # 2. Discuss requirements (optional)
/yap:feature F01 research             # 3. Research libraries (optional)
/yap:feature F01 execute              # 4. Execute (auto-calls /yap-plan, then executes)
/yap:feature F01 verify               # 5. Verify (auto-calls /yap-memory)

# Status queries:
/yap:feature F01                      # Show status
/yap:feature                          # List all features
```

## Execution Logic

### 1. Parse Arguments

```
"user authentication" → CREATE mode
"F01 discuss"         → Route to /yap-discuss F01
"F01 research"        → Route to /yap-research F01
"F01 execute"         → Route to /yap-execute F01 (auto-calls /yap-plan if needed)
"F01 verify"          → Route to /yap-verify F01 (auto-calls /yap-memory at end)
"F01"                 → Show status
(empty)               → List features
```

### 2. CREATE Mode

1. Check ROADMAP.md exists (else error: "Run /yap:start first")
2. Get next number: `F(MAX+1)` from `.yap/features/F*.md`
3. Create slug: lowercase, hyphens
4. Write feature file `.yap/features/F##-slug.md`:
   ```markdown
   ---
   feature: F##
   name: Feature Name
   status: pending
   requires: []
   subsystem: ""
   tech: []
   wave: 1
   ---

   # Feature F##: Name

   ## Description
   (To be filled)

   ## Tasks
   (Created during /yap-execute)

   ## Verification
   ```bash
   npm test
   ```

   ## Discussion
   (Add via /yap-discuss)

   ## Research
   (Add via /yap-research)
   ```

5. Update ROADMAP.md: Add `F## slug ☐ 0%`
6. Git commit: `"feat(F##): create slug"`
7. Output: Next steps (discuss/research/execute)

### 3. Route to Skills

**Workflow order:** discuss → research → execute (auto-plans) → verify (auto-memory)

**discuss/research/execute/verify** → Call corresponding `/yap-{cmd}` skill

Smart defaults when no F## specified:
- `discuss` → Latest feature
- `research` → Latest feature (highest number)
- `execute` → Next incomplete (grep ROADMAP.md for ☐|🔄)
  - Auto-calls `/yap-plan F##` first if Plan section empty
- `verify` → Last modified (.yap/features/*.md by mtime)
  - Auto-calls `/yap-memory F##` at end if verification passes

**Fuzzy matching:** If arg doesn't match F##, search feature names. If multiple matches, ask user to choose.

### 4. STATUS Mode (`/yap:feature F01`)

1. Find file: `.yap/features/F01-*.md`
2. Parse frontmatter + tasks
3. Show: status, tasks (✅/🔄), recent commits, next action

### 5. LIST Mode (`/yap:feature`)

1. Read ROADMAP.md
2. Show: progress %, all features with status icons
3. Suggest: next action

## Error Handling

- No ROADMAP.md → "Run /yap:start first"
- Feature not found → "Feature F## not found"
- Invalid subcommand → "Valid: research, discuss, execute, verify"

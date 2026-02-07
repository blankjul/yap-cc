---
name: yap:roadmap
description: Plan features upfront with dependency mapping and wave organization for large projects
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# /yap:roadmap Command

Interactive feature planning for large projects.

## Responsibilities
- Understand project scope
- Identify major features
- Map dependencies between features
- Organize into waves/phases
- Update ROADMAP.md with structured plan
- Check for conflicts when adding new features

## Usage

```bash
/yap:roadmap              # Create initial roadmap
/yap:roadmap update       # Update existing roadmap (add/reorder features)
```

## Execution Flow

### Initial Roadmap Creation

1. Check if ROADMAP.md exists
   - If exists and has features: Use "update" mode
   - If empty or missing: Create new

2. Understand project scope
   - Read PROJECT.md for context
   - Ask clarifying questions:
     - "What are the main areas of functionality?"
     - "Who are the primary users?"
     - "What's the MVP scope?"

3. Identify features
   - Ask user to list major features
   - Use AskUserQuestion for multi-select or open text
   - Examples: "Authentication", "Product catalog", "Checkout flow"
   - Aim for 5-10 features for initial planning

4. For each feature, gather:
   - Brief description (1-2 sentences)
   - Subsystem (auth, api, ui, database, etc.)
   - Technologies needed
   - Dependencies on other features

5. Analyze dependencies
   - Build dependency graph
   - Identify foundation features (no dependencies)
   - Find potential circular dependencies (warn user)

6. Organize into waves
   - Wave 1: Foundation features (no dependencies)
   - Wave 2: Features depending on Wave 1
   - Wave 3+: Higher-level features
   - Ask user to confirm wave organization

7. Create feature stub entries
   - DO NOT create F##.md files yet
   - Only update ROADMAP.md with planned features
   - Number sequentially: F01, F02, F03...

8. Update ROADMAP.md
   - Write Features section with waves
   - Add dependency graph visualization
   - Set status to "Not started" for all
   - Add timestamp

### Update Mode

9. If adding features to existing roadmap:
   - Read current ROADMAP.md
   - Parse existing features (F##) and do tasks (D##)
   - Check for conflicts:
     - Does new feature depend on incomplete features?
     - Does it block existing features?
     - Wave violations?

10. Warn about conflicts:
    ```
    ⚠️ Roadmap Check

    Adding "F06: Payment Processing"

    Dependencies:
    - F04: Shopping Cart (50% complete)
    - F05: Checkout Flow (not started)

    This creates chain: F04 → F05 → F06

    Recommendation: Complete F04 and F05 first

    Options:
    - Add F06 now (will be blocked)
    - Wait until F04 and F05 complete
    - Reorganize roadmap
    ```

11. Update ROADMAP.md
    - Add new features with appropriate numbers
    - Update dependency graph
    - Recalculate waves if needed

### Conflict Resolution

12. Help user resolve conflicts:
    - Suggest reordering features
    - Identify missing dependencies
    - Recommend splitting large features
    - Offer to adjust wave assignments

## Output

### Initial Creation
```
✓ Roadmap created with 7 features!

Wave 1: Foundation
- F01: Database Schema
- F02: User Authentication

Wave 2: Core
- F03: Product Catalog (requires F01)
- F04: Shopping Cart (requires F01, F02)

Wave 3: Transactions
- F05: Checkout Flow (requires F04)
- F06: Payment Integration (requires F05)

Wave 4: Admin
- F07: Admin Dashboard (requires F02, F03)

Dependencies: 6 identified, 0 circular ✓
Estimated scope: ~700k tokens, 8-10 weeks

Next steps:
1. Run /yap:feature F01 to start first feature
2. Run /yap:start to see progress
```

### Update Mode
```
✓ Roadmap updated!

Added: F08: Email Notifications

Wave: 3 (Core functionality)
Dependencies: F02 (User Authentication)
Status: Ready to start (no blockers)

Updated: .yap/ROADMAP.md

Next: Run /yap:feature F08 when ready
```

## Error Handling

- If PROJECT.md missing: Warn to run /yap:init first
- If circular dependencies detected: Show cycle, ask user to break it
- If too many features (>15): Suggest focusing on MVP first
- If user provides conflicting dependencies: Clarify and resolve

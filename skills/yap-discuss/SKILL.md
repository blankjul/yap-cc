---
name: yap-discuss
description: Facilitate design discussion for a YAP feature. Clarifies requirements, edge cases, and verification strategy through interactive questions.
argument-hint: [feature-number]
allowed-tools: Read, Write, Edit, AskUserQuestion, Bash(git *)
---

# Feature Discussion Facilitator

You facilitate design discussions for YAP features. Your job is to clarify requirements, identify edge cases, and define verification strategy.

**Note:** This skill runs in the main session (not forked) to enable interactive discussion.

## Context

**Feature file:** !`cat .yap/features/$ARGUMENTS-*.md 2>/dev/null || echo "Feature $ARGUMENTS not found"`

**Project context:** !`cat PROJECT.md 2>/dev/null | head -50 || echo "No PROJECT.md"`

## Your Task

### 1. Read Feature Description

Load the feature file and understand:
- What is being built
- What subsystem it affects
- What technologies are involved
- Any existing discussion notes

### 2. Facilitate Discussion

Ask clarifying questions using AskUserQuestion. Focus on:

#### Requirements Clarification

Use AskUserQuestion to ask:
- "What are the key requirements for this feature?"
- "Who are the primary users/personas?"
- "What problem does this solve?"
- "What would success look like?"

#### Edge Cases

Ask about:
- "What should happen if {edge_case}?"
- "How should we handle {error_condition}?"
- "What are the boundary conditions?"
- "What assumptions should we NOT make?"

Examples:
- Auth feature: "What if user is already logged in?"
- Payment feature: "What if payment provider is down?"
- Search feature: "What if no results found?"

#### Technical Constraints

Ask about:
- "Are there performance requirements?"
- "Any security considerations?"
- "Browser/platform compatibility needs?"
- "Data volume expectations?"

#### Verification Strategy

Ask:
- "How will we know this works correctly?"
- "What automated checks should we run?" (tests, builds, API calls)
- "What must you manually verify?" (UI, UX, visual elements)
- "What specific scenarios should we test?"

### 3. Update Feature Discussion Section

Append to the feature file's `## Discussion` section with timestamp:

```markdown
## Discussion

### $(date +%Y-%m-%d) - Requirements and Edge Cases

**Participants:** User + Claude

#### Key Requirements
- {Requirement 1}
- {Requirement 2}
- {Requirement 3}

**User Personas:**
- {Persona 1}: {description}
- {Persona 2}: {description}

**Success Criteria:**
- {Criterion 1}
- {Criterion 2}

#### Edge Cases Identified
- **{Edge Case 1}:** {How to handle}
- **{Edge Case 2}:** {How to handle}
- **{Edge Case 3}:** {How to handle}

#### Technical Constraints
- Performance: {requirement}
- Security: {consideration}
- Compatibility: {requirement}

#### Verification Strategy

**Automated checks:**
\`\`\`bash
npm test -- {specific test file}
npm run build
curl -X POST {endpoint} -d '{test data}'
{other commands}
\`\`\`

**Manual verification:**
- [ ] {Manual test 1}
- [ ] {Manual test 2}
- [ ] {Manual test 3}

**Test scenarios:**
1. **Happy path:** {description}
2. **Error case:** {description}
3. **Edge case:** {description}
```

### 4. Update Verification Section

If verification commands were defined, update the `## Verification` section:

```markdown
## Verification

**Automated:**
\`\`\`bash
npm test -- auth.test.ts
npm run build
curl -X POST http://localhost:3000/api/login -d '{"email":"test@test.com","password":"pass123"}'
\`\`\`

**Manual:**
- [ ] User can log in with valid credentials
- [ ] Invalid credentials show error message
- [ ] Error handling works for network failures
- [ ] User remains logged in after page refresh
- [ ] Logout clears session properly
```

### 5. Update Frontmatter (if needed)

If new technologies or subsystems were mentioned:

```yaml
---
tech: [jose, bcrypt, express-rate-limit]  # Add new tech
subsystem: auth  # Update if clarified
---
```

### 6. Git Commit

```bash
git add .yap/features/$ARGUMENTS-*.md
git commit -m "docs(F$ARGUMENTS): add design discussion

Requirements:
- {Requirement 1}
- {Requirement 2}

Edge cases:
- {Edge case 1}
- {Edge case 2}

Verification strategy defined.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### 7. Output Summary

```
✓ Discussion complete for Feature $ARGUMENTS: {Feature Name}

## Key Points Captured

**Requirements:**
- {Requirement 1}
- {Requirement 2}
- {Requirement 3}

**Edge Cases:**
- {Edge case 1}: {How to handle}
- {Edge case 2}: {How to handle}

**Verification Strategy:**
- Automated: {X} checks defined
- Manual: {Y} test scenarios

**Updated:**
- .yap/features/$ARGUMENTS-*.md (Discussion + Verification sections)

## Next Steps

{Choose based on context:}

**If unknowns remain:**
- /yap-research $ARGUMENTS - Research library/pattern options

**If ready to build:**
- /yap-execute $ARGUMENTS - Start implementation

**If want to refine:**
- Edit .yap/features/$ARGUMENTS-*.md directly
- Re-run /yap-discuss $ARGUMENTS to continue discussion
```

## Discussion Tips

**Ask open-ended questions:**
- ✅ "What should happen when...?"
- ❌ "Should we do X?" (too leading)

**Dig deeper on vague answers:**
- If user says "handle errors gracefully"
- Ask: "What specific errors? What does graceful mean - retry, show message, log?"

**Challenge assumptions:**
- "You mentioned users log in - but should we support OAuth too?"
- "This assumes the API is always available - what if it's down?"

**Prioritize verification:**
- "Of all these features, which is most critical to test?"
- "What would worry you most if it broke in production?"

**Be concrete:**
- ✅ "What should the error message say exactly?"
- ❌ "Should we show an error?"

## Error Handling

- If feature not found: Error "Feature $ARGUMENTS not found. Create it with: /yap:feature '{name}'"
- If Discussion section missing: Create it
- If Verification section missing: Create it
- If user unsure about something: Note it as "TBD during implementation" and continue

## Quality Standards

**Good discussion captures:**
- **Specific requirements** (not vague goals)
- **Concrete edge cases** (not generic "handle errors")
- **Actionable verification** (commands you can actually run)
- **Clear decisions** (not "we'll figure it out later")

**Example:**
- ❌ "Handle login errors"
- ✅ "Show 'Invalid credentials' message for 401, 'Server error, try again' for 500, disable button during request"

## Notes

- This skill does NOT use `context: fork` because it needs interactive discussion
- Use AskUserQuestion liberally - better to over-clarify than under-clarify
- Discussion can happen multiple times - append with new timestamps
- It's OK if not everything is resolved - note uncertainties for the executor

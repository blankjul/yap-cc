---
feature: F{NUMBER}-{NAME}
requires: []
provides: []
affects: []
subsystem: {SUBSYSTEM}
tech: []
wave: 1
key_files:
  created: []
  modified: []
---

# Feature F{NUMBER}: {TITLE}

## Description
[What this feature accomplishes - user perspective]

## Requirements

### Functional Requirements
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

### Success Criteria
- [ ] [Success criterion 1]
- [ ] [Success criterion 2]
- [ ] [Success criterion 3]

**Updates:**
[Track requirement changes during loop-backs]

## Discussion
[Optional - design decisions from /yap:discuss]

## Research
[Optional - link to .yap/research/R##-name.md with summary]

## Plan
[Execution approach - filled by Planner during /yap:execute]

### Task Breakdown
[Detailed task decomposition with file assignments]

### Dependencies
[What must happen before what]

### Model Assignments
[Which tasks use Haiku vs Sonnet]

### Execution Strategy
[Sequential vs parallel waves]

**Fix Tasks:**
[Added during verification loop-backs]

## Execution
[Track task completion and commits]

- [ ] Task {NUMBER}.1: [Description]
- [ ] Task {NUMBER}.2: [Description]

## Pitfalls
[Edge cases, security concerns, things to watch]

## Verification

### Automated Checks
```bash
# Tests
npm test

# Build
npm run build

# API checks (if applicable)
curl -X POST http://localhost:3000/api/endpoint
```

### Manual Verification
- [ ] User can [action 1]
- [ ] User can [action 2]
- [ ] [Visual/UX requirement]

**Verification Rounds:**
[Track multiple verification attempts during loop-backs]

## Summary
[Filled after completion - what was built, deviations, learnings]

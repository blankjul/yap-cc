# Changelog

All notable changes to YAP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-07

### Added
- Initial release of YAP
- NPX-based installer (`npx yap`)
- Core commands:
  - `/yap:start` - Smart session starter
  - `/yap:feature` - Create new feature
  - `/yap:discuss` - Design discussion
  - `/yap:research` - Research libraries
  - `/yap:execute` - Plan and execute
  - `/yap:verify` - Verify completion
  - `/yap:explore` - Explore existing codebase
- 4 specialized agents:
  - Planner (Sonnet) - Task decomposition
  - Executor (Haiku→Sonnet) - Implementation with deviation rules
  - Verifier (Haiku) - Goal-backward verification
  - Researcher (Sonnet) - Targeted investigation
- Global and local installation options
- Token-optimized architecture (<100k tokens per story target)
- Comprehensive documentation

### Features
- YAML frontmatter in all command files
- Atomic git commits per task
- 4 deviation rules for autonomous execution
- Three-level artifact verification
- Frontmatter-driven context loading
- Fresh subagent contexts for peak quality
- Haiku-first execution with auto-escalation

### Documentation
- Complete README with quick start
- Command reference
- Workflow examples (greenfield + brownfield)
- Token optimization strategies
- Troubleshooting guide
- Comparison to get-shit-done

[1.0.0]: https://github.com/blankjul/yap/releases/tag/v1.0.0

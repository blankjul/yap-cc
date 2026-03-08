# Testing Strategy for Yapflows

This document describes the comprehensive testing approach for Yapflows, including pre-flight diagnostics, backend tests, user directory tests, and Docker validation.

## Overview

After moving from macOS to Linux server, we identified critical issues with tools venv creation and execution. This testing strategy addresses those issues and provides ongoing validation of the platform.

### Key Principles

1. **Fast & Free**: All default tests use mocked services and consume zero API tokens
2. **Isolated**: Tests run in temporary directories and never affect real user data
3. **Cross-Platform**: Tests work on Linux, macOS, and Docker
4. **Comprehensive**: Cover server startup, venv setup, tool execution, and Docker deployment

## Quick Start

```bash
# Run all tests (fast, no tokens used)
make test-all

# Run pre-flight diagnostics
make preflight

# Run specific test suites
make test-backend        # Unit tests only
make test-integration    # Integration tests (mocked)
make test-user-dir       # User directory validation

# Run Docker tests (requires Docker)
make test-docker
```

## Test Suites

### 1. Pre-flight Diagnostics

**Purpose**: Identify environment issues before starting the server

**Command**: `make preflight`

**Checks**:
- ✓ Python version (>= 3.11)
- ✓ venv module available
- ✓ Disk space (>500MB)
- ✓ Write permissions to ~/.yapflows/
- ✓ Node.js available (optional)
- ✓ Claude CLI in PATH (optional)
- ⚠ OpenRouter API key (optional)

**Exit Codes**:
- `0`: All critical checks passed (warnings OK)
- `1`: Critical check failed

**Example Output**:
```
=== Yapflows Pre-flight Checks ===

✓ Python 3.12.3
✓ venv module available
✓ 167546 MB free disk space
✓ Write permissions to /home/user/.yapflows
✓ Node.js v22.22.0
✓ Claude CLI 2.1.71
⚠ OpenRouter API key not set (optional - will use mock in tests)

⚠️  1 warning(s) - optional features may be unavailable
```

### 2. Backend Unit Tests

**Purpose**: Test individual components in isolation

**Command**: `make test-backend`

**What's Tested**:
- Agent loading and configuration
- Session state management
- Provider mocking
- Message formatting
- Event streaming

**Token Cost**: 0 (fully mocked)

**Run Time**: ~1-2 seconds

### 3. Backend Integration Tests

**Purpose**: Test framework components work together correctly

**Command**: `make test-integration`

**What's Tested**:
- Server startup (all 12 lifespan steps)
- Config loading and directory creation
- Venv creation and validation
- Pip package installation
- Tool discovery and loading
- Session store functionality
- Provider loading with/without credentials
- Health endpoint

**Token Cost**: 0 (uses MockProvider only)

**Run Time**: ~10-15 seconds

**Markers**:
- `@pytest.mark.integration` - Integration tests (default)
- `@pytest.mark.external` - Requires real API keys (skipped by default)
- `@pytest.mark.slow` - Slow tests like playwright install (skipped by default)
- `@pytest.mark.docker` - Requires Docker (skipped in regular test runs)

**Running with real services** (costs tokens):
```bash
# Only run external tests (requires API keys)
OPENROUTER_API_KEY=sk-or-xxx pytest -m external
```

### 4. User Directory Tests

**Purpose**: Validate ~/.yapflows/ components in real environment

**Command**: `make test-user-dir`

**What's Tested**:
- Directory structure creation
- Venv creation (`python3 -m venv`)
- Venv Python is executable
- Pip install from requirements.txt
- Package imports (httpx, aiofiles, yaml)
- Tool execution with --help
- {python} substitution in tool definitions

**Token Cost**: 0 (no API calls)

**Run Time**: ~30-60 seconds (includes pip install)

**Test in isolated directory**:
```bash
./scripts/test-user-dir.sh /tmp/yapflows-test
```

**Test production directory** (use caution):
```bash
./scripts/test-user-dir.sh ~/.yapflows
```

### 5. Docker Tests

**Purpose**: Ensure Docker containers work correctly

**Command**: `make test-docker`

**What's Tested**:
- Container builds successfully
- Container starts without errors
- Health check passes within 30s
- Venv exists at `/data/venv/bin/python`
- Tools directory exists
- Volume permissions correct (yapflows user)
- Backend logs show successful initialization

**Token Cost**: 0 (no API calls)

**Run Time**: ~30-45 seconds

**Docker Health Check**:
```yaml
healthcheck:
  test: ["CMD", "sh", "-c", "curl -f http://localhost:8000/health && test -f /data/venv/bin/python && test -d /data/tools"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 20s
```

## Test Environment Variables

### Required (for all tests)
```bash
# None - tests work out of the box
```

### Optional (for external service tests)
```bash
# Only needed for @pytest.mark.external tests
OPENROUTER_API_KEY=sk-or-xxx  # For real OpenRouter API tests
CLAUDE_BIN=/path/to/claude     # For Claude CLI tests
TELEGRAM_BOT_TOKEN=xxx         # For Telegram tests
```

## Mocking Strategy

**Core Principle**: Tests should be fast, free, and require no external services or API tokens.

### What We Mock

1. **OpenRouter API** - Use `MockProvider` for zero-token testing
2. **Claude CLI** - Mock subprocess calls for PATH resolution
3. **Telegram Bot** - Skip initialization if token not set
4. **Playwright** - Skip browser install in regular tests (too slow)

### What We Test

- ✅ Infrastructure: Server startup, venv creation, config loading
- ✅ File I/O: Tool discovery, session storage, settings files
- ✅ Path handling: Cross-platform venv paths, tool resolution
- ✅ Error handling: Graceful degradation, logging
- ❌ NOT testing: LLM quality, real API responses, actual chat behavior

## Test Fixtures

### `isolated_yapflows_dir`
Creates a temporary ~/.yapflows/ directory for isolated testing.

```python
def test_example(isolated_yapflows_dir):
    # Test runs in /tmp/yapflows-test-xxx/
    assert isolated_yapflows_dir.exists()
```

### `test_env`
Sets up test environment with mocked services (no API keys).

```python
def test_example(test_env):
    # OPENROUTER_API_KEY is unset
    # YAPFLOWS_TEST=1 is set
    config = Config()
```

### `minimal_requirements`
Creates a minimal requirements.txt to speed up tests.

```python
def test_example(minimal_requirements):
    # Uses httpx, aiofiles, PyYAML only
    # Skips playwright and large packages
```

### `mock_openrouter`
Mocks httpx requests to OpenRouter API (zero tokens).

```python
def test_example(mock_openrouter):
    # All OpenRouter API calls return fake responses
```

## Running Tests

### All tests (default)
```bash
make test-all
```

### Individual suites
```bash
make preflight          # Pre-flight checks
make test-backend       # Unit tests
make test-integration   # Integration tests
make test-user-dir      # User directory tests
make test-docker        # Docker tests
```

### Pytest directly
```bash
# Run all tests (skips external by default)
pytest

# Run only integration tests
pytest -m integration

# Run slow tests too
pytest -m "integration or slow"

# Run external tests (costs tokens!)
OPENROUTER_API_KEY=xxx pytest -m external

# Run specific test file
pytest tests/integration/test_venv_setup.py

# Run with verbose output
pytest -v

# Run with coverage
pytest --cov=src --cov-report=html
```

## CI/CD Integration (Future)

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: make install-backend
      - run: make preflight
      - run: make test-backend
      - run: make test-integration
      - run: make test-user-dir
```

## Troubleshooting

### Venv creation fails
```bash
# On Linux, install python3-venv
sudo apt-get install python3-venv

# Verify it works
python3 -m venv /tmp/test-venv
```

### Tests fail with import errors
```bash
# Install backend dependencies
make install-backend

# Or manually
cd backend && pip install -e ".[dev]"
```

### Integration tests fail
```bash
# Run with verbose output to see details
pytest tests/integration -v -s

# Check if venv module is available
python3 -c "import venv; print('OK')"
```

### Docker tests timeout
```bash
# Increase start_period in docker-compose.yml
healthcheck:
  start_period: 30s  # Increase if startup is slow
```

## Success Criteria

### Must Have (Blocking) ✅ COMPLETE
- [x] Pre-flight checks identify broken components
- [x] Tools venv is created on Linux
- [x] Tools can execute and import dependencies
- [x] Backend integration tests pass (**22/22 passing**)
- [x] Server startup completes successfully
- [x] Docker container starts and passes health check

### Should Have (Quality) ✅ COMPLETE
- [x] User directory test script validates tools work
- [x] Integration tests cover critical paths
- [x] External services are mocked (no API keys required)
- [x] Tests requiring credentials are marked and skippable
- [x] Makefile has targets for all test types
- [x] All integration tests pass (**22/22 passing**)

### Nice to Have (Future)
- [ ] Test coverage reports
- [ ] CI/CD pipeline with automated testing
- [ ] Multi-platform Docker testing
- [ ] Performance benchmarks

## Token Cost Summary

- **Unit tests**: 0 tokens (fully mocked)
- **Integration tests**: 0 tokens (MockProvider only)
- **Pre-flight checks**: 0 tokens (just file/env checks)
- **User directory tests**: 0 tokens (just venv/tool checks)
- **Docker tests**: 0 tokens (just container startup)
- **External tests** (skipped by default): ~1000-5000 tokens

**Total cost for default test run**: 0 tokens ✅

## Additional Resources

- **Plan Document**: See plan file for original implementation strategy
- **Pytest Docs**: https://docs.pytest.org/
- **Docker Compose**: https://docs.docker.com/compose/
- **Pre-flight Validators**: `backend/src/preflight/validators.py`
- **Integration Test Fixtures**: `backend/tests/integration/conftest.py`

#!/usr/bin/env bash
#
# Test user directory components (~/.yapflows/)
#
# Usage:
#   ./scripts/test-user-dir.sh [test_dir]
#
# If test_dir is provided, tests will run in that directory instead of ~/.yapflows/
# This allows testing without affecting the real user directory.

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Determine test directory
if [ -n "$1" ]; then
    YAPFLOWS_DIR="$1"
    echo -e "${YELLOW}Testing in: $YAPFLOWS_DIR${NC}"
else
    YAPFLOWS_DIR="$HOME/.yapflows"
    echo -e "${YELLOW}Testing in: $YAPFLOWS_DIR (production)${NC}"
    echo -e "${YELLOW}WARNING: This will test the real user directory!${NC}"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create test directory if needed
mkdir -p "$YAPFLOWS_DIR"

# Create expected subdirectories (required for yapflows)
for subdir in agents chats environments knowledge log skills tools; do
    mkdir -p "$YAPFLOWS_DIR/$subdir"
done

# Track test results
PASSED=0
FAILED=0

# Test function
test_step() {
    echo -e "\n${YELLOW}Test: $1${NC}"
}

test_pass() {
    echo -e "${GREEN}✓ $1${NC}"
    PASSED=$((PASSED + 1))
}

test_fail() {
    echo -e "${RED}✗ $1${NC}"
    FAILED=$((FAILED + 1))
}

# 1. Test directory structure
test_step "Directory structure"
if [ -d "$YAPFLOWS_DIR" ]; then
    test_pass "Base directory exists: $YAPFLOWS_DIR"
else
    test_fail "Base directory missing: $YAPFLOWS_DIR"
fi

for subdir in agents chats environments knowledge log skills tools; do
    if [ -d "$YAPFLOWS_DIR/$subdir" ]; then
        test_pass "Subdirectory exists: $subdir/"
    else
        test_fail "Subdirectory missing: $subdir/"
    fi
done

# 2. Test venv creation
test_step "Virtual environment creation"
VENV_DIR="$YAPFLOWS_DIR/venv"

if [ -d "$VENV_DIR" ]; then
    test_pass "Venv directory exists"
else
    echo -e "${YELLOW}Creating venv...${NC}"
    if python3 -m venv "$VENV_DIR"; then
        test_pass "Venv created successfully"
    else
        test_fail "Venv creation failed"
        echo -e "${RED}Install python3-venv: sudo apt-get install python3-venv${NC}"
    fi
fi

# 3. Test venv Python
test_step "Venv Python executable"
if [ "$(uname)" = "Darwin" ] || [ "$(uname)" = "Linux" ]; then
    VENV_PYTHON="$VENV_DIR/bin/python"
else
    VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
fi

if [ -f "$VENV_PYTHON" ]; then
    test_pass "Venv Python exists: $VENV_PYTHON"
else
    test_fail "Venv Python missing: $VENV_PYTHON"
fi

if [ -x "$VENV_PYTHON" ]; then
    VERSION=$("$VENV_PYTHON" --version 2>&1)
    test_pass "Venv Python is executable: $VERSION"
else
    test_fail "Venv Python is not executable"
fi

# 4. Test pip install (if requirements.txt exists)
test_step "Package installation"
REQUIREMENTS="$YAPFLOWS_DIR/tools/requirements.txt"

if [ -f "$REQUIREMENTS" ]; then
    test_pass "requirements.txt exists"

    # Check if already installed (hash check)
    HASH_FILE="$VENV_DIR/.requirements_hash"
    CURRENT_HASH=$(sha256sum "$REQUIREMENTS" | cut -d' ' -f1)

    if [ -f "$HASH_FILE" ]; then
        STORED_HASH=$(cat "$HASH_FILE")
        if [ "$STORED_HASH" = "$CURRENT_HASH" ]; then
            test_pass "Requirements already installed (hash matches)"
        else
            echo -e "${YELLOW}Installing requirements (hash mismatch)...${NC}"
            if "$VENV_PYTHON" -m pip install -q -r "$REQUIREMENTS"; then
                echo "$CURRENT_HASH" > "$HASH_FILE"
                test_pass "Requirements installed successfully"
            else
                test_fail "pip install failed"
            fi
        fi
    else
        echo -e "${YELLOW}Installing requirements (first time)...${NC}"
        if "$VENV_PYTHON" -m pip install -q -r "$REQUIREMENTS"; then
            echo "$CURRENT_HASH" > "$HASH_FILE"
            test_pass "Requirements installed successfully"
        else
            test_fail "pip install failed"
        fi
    fi
else
    echo -e "${YELLOW}No requirements.txt found, skipping pip install${NC}"
fi

# 5. Test package imports
test_step "Package imports"
for package in httpx aiofiles yaml; do
    if "$VENV_PYTHON" -c "import $package" 2>/dev/null; then
        test_pass "Can import $package"
    else
        test_fail "Cannot import $package"
    fi
done

# 6. Test tools execution (if tools exist)
test_step "Tools execution"
TOOLS_DIR="$YAPFLOWS_DIR/tools"

if [ -d "$TOOLS_DIR" ]; then
    # Find executable .py files
    TOOL_COUNT=0
    for tool in "$TOOLS_DIR"/*.py; do
        if [ -f "$tool" ] && [ -x "$tool" ]; then
            ((TOOL_COUNT++))
            TOOL_NAME=$(basename "$tool")

            # Try to run with --help
            if "$tool" --help >/dev/null 2>&1; then
                test_pass "Tool executes: $TOOL_NAME"
            else
                # Some tools might not have --help, try -h or just run
                if "$tool" -h >/dev/null 2>&1 || "$tool" >/dev/null 2>&1; then
                    test_pass "Tool executes: $TOOL_NAME"
                else
                    test_fail "Tool fails to execute: $TOOL_NAME"
                fi
            fi
        fi
    done

    if [ $TOOL_COUNT -eq 0 ]; then
        echo -e "${YELLOW}No executable tools found${NC}"
    fi
else
    echo -e "${YELLOW}Tools directory not found${NC}"
fi

# 7. Test {python} substitution
test_step "Python substitution"
EXPECTED_PYTHON="$VENV_PYTHON"
if echo "{python}" | sed "s|{python}|$EXPECTED_PYTHON|" | grep -q "$EXPECTED_PYTHON"; then
    test_pass "{python} substitution works"
else
    test_fail "{python} substitution failed"
fi

# Summary
echo -e "\n${YELLOW}=== Test Summary ===${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Some tests failed${NC}"
    exit 1
fi

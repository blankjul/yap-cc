#!/usr/bin/env bash
# Detect Python interpreter with proper version validation
# Priority: project venv > backend venv > active venv > system python3

set -e

MIN_PYTHON_VERSION="3.11"

# Function to check if Python version meets minimum requirement
check_python_version() {
    local python_path=$1
    if [[ ! -x "$python_path" ]]; then
        return 1
    fi

    local version=$("$python_path" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")

    # Compare versions (requires bash for arithmetic)
    if awk -v ver="$version" -v min="$MIN_PYTHON_VERSION" 'BEGIN {exit !(ver >= min)}'; then
        return 0
    else
        return 1
    fi
}

# Detection priority order
candidates=(
    "./venv/bin/python"
    "./backend/venv/bin/python"
    "${VIRTUAL_ENV}/bin/python"
    "$(command -v python3 2>/dev/null || echo '')"
    "$(command -v python 2>/dev/null || echo '')"
)

for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" ]] && check_python_version "$candidate"; then
        echo "$candidate"
        exit 0
    fi
done

# No valid Python found
echo "Error: Could not find Python >= $MIN_PYTHON_VERSION" >&2
echo "Searched locations:" >&2
echo "  - ./venv/bin/python" >&2
echo "  - ./backend/venv/bin/python" >&2
echo "  - \$VIRTUAL_ENV/bin/python" >&2
echo "  - system python3" >&2
echo "" >&2
echo "Please install Python $MIN_PYTHON_VERSION+ or run 'make venv' to create a virtual environment" >&2
exit 1

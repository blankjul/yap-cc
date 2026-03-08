"""Pre-flight validation checks for Yapflows environment."""

import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class ValidationResult:
    """Result of a validation check."""

    name: str
    passed: bool
    message: str
    level: str = "error"  # "error", "warning", "info"


def check_python_version() -> ValidationResult:
    """Check if Python version >= 3.11."""
    version = sys.version_info
    passed = version >= (3, 11)
    version_str = f"{version.major}.{version.minor}.{version.micro}"

    if passed:
        return ValidationResult(
            name="Python Version",
            passed=True,
            message=f"✓ Python {version_str}",
            level="info",
        )
    else:
        return ValidationResult(
            name="Python Version",
            passed=False,
            message=f"✗ Python {version_str} (requires >= 3.11)",
            level="error",
        )


def check_venv_module() -> ValidationResult:
    """Check if venv module is available."""
    try:
        import venv  # noqa: F401

        return ValidationResult(
            name="Venv Module",
            passed=True,
            message="✓ venv module available",
            level="info",
        )
    except ImportError:
        return ValidationResult(
            name="Venv Module",
            passed=False,
            message="✗ venv module not available (install python3-venv)",
            level="error",
        )


def check_disk_space(required_mb: int = 500) -> ValidationResult:
    """Check if sufficient disk space is available."""
    try:
        home = Path.home()
        stat = shutil.disk_usage(home)
        free_mb = stat.free // (1024 * 1024)

        if free_mb >= required_mb:
            return ValidationResult(
                name="Disk Space",
                passed=True,
                message=f"✓ {free_mb} MB free disk space",
                level="info",
            )
        else:
            return ValidationResult(
                name="Disk Space",
                passed=False,
                message=f"✗ {free_mb} MB free (requires {required_mb} MB)",
                level="error",
            )
    except Exception as e:
        return ValidationResult(
            name="Disk Space",
            passed=False,
            message=f"✗ Could not check disk space: {e}",
            level="warning",
        )


def check_yapflows_permissions() -> ValidationResult:
    """Check write permissions to ~/.yapflows/."""
    yapflows_dir = Path(os.environ.get("USER_DIR", Path.home() / "yapflows"))

    try:
        # Create directory if it doesn't exist
        yapflows_dir.mkdir(parents=True, exist_ok=True)

        # Try to create a test file
        test_file = yapflows_dir / ".preflight_test"
        test_file.write_text("test")
        test_file.unlink()

        return ValidationResult(
            name="Yapflows Permissions",
            passed=True,
            message=f"✓ Write permissions to {yapflows_dir}",
            level="info",
        )
    except Exception as e:
        return ValidationResult(
            name="Yapflows Permissions",
            passed=False,
            message=f"✗ Cannot write to {yapflows_dir}: {e}",
            level="error",
        )


def check_nodejs() -> ValidationResult:
    """Check if Node.js is available."""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            return ValidationResult(
                name="Node.js",
                passed=True,
                message=f"✓ Node.js {version}",
                level="info",
            )
        else:
            return ValidationResult(
                name="Node.js",
                passed=False,
                message="⚠ Node.js not found (optional - required for Claude CLI)",
                level="warning",
            )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ValidationResult(
            name="Node.js",
            passed=False,
            message="⚠ Node.js not found (optional - required for Claude CLI)",
            level="warning",
        )


def check_claude_cli() -> ValidationResult:
    """Check if Claude CLI is available."""
    try:
        result = subprocess.run(
            ["claude", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            version = result.stdout.strip()
            return ValidationResult(
                name="Claude CLI",
                passed=True,
                message=f"✓ Claude CLI {version}",
                level="info",
            )
        else:
            return ValidationResult(
                name="Claude CLI",
                passed=False,
                message="⚠ Claude CLI not found (optional - will use mock in tests)",
                level="warning",
            )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ValidationResult(
            name="Claude CLI",
            passed=False,
            message="⚠ Claude CLI not found (optional - will use mock in tests)",
            level="warning",
        )


def check_openrouter_api_key() -> ValidationResult:
    """Check if OpenRouter API key is set."""
    api_key = os.getenv("OPENROUTER_API_KEY")

    if api_key:
        return ValidationResult(
            name="OpenRouter API Key",
            passed=True,
            message="✓ OpenRouter API key set",
            level="info",
        )
    else:
        return ValidationResult(
            name="OpenRouter API Key",
            passed=False,
            message="⚠ OpenRouter API key not set (optional - will use mock in tests)",
            level="warning",
        )


def run_all_checks() -> List[ValidationResult]:
    """Run all validation checks."""
    checks = [
        check_python_version(),
        check_venv_module(),
        check_disk_space(),
        check_yapflows_permissions(),
        check_nodejs(),
        check_claude_cli(),
        check_openrouter_api_key(),
    ]
    return checks


def print_results(results: List[ValidationResult]) -> bool:
    """Print validation results and return True if all critical checks passed."""
    print("\n=== Yapflows Pre-flight Checks ===\n")

    errors = []
    warnings = []

    for result in results:
        print(result.message)
        if not result.passed:
            if result.level == "error":
                errors.append(result)
            elif result.level == "warning":
                warnings.append(result)

    print()

    if errors:
        print(f"❌ {len(errors)} critical error(s) found:")
        for error in errors:
            print(f"   - {error.name}: {error.message}")
        print()
        return False
    elif warnings:
        print(f"⚠️  {len(warnings)} warning(s) - optional features may be unavailable")
        print()
        return True
    else:
        print("✅ All checks passed!")
        print()
        return True

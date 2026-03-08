"""Standalone CLI tool for pre-flight diagnostics."""

import sys
from .validators import run_all_checks, print_results


def main():
    """Run all pre-flight checks and exit with appropriate code."""
    results = run_all_checks()
    success = print_results(results)

    # Exit with error code if critical checks failed
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

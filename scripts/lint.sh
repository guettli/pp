#!/usr/bin/env bash
# Bash Strict Mode: https://github.com/guettli/bash-strict-mode
trap 'echo -e "\n🤷 🚨 🔥 Warning: A command has failed. Exiting the script. Line was ($0:$LINENO): $(sed -n "${LINENO}p" "$0" 2>/dev/null || true) 🔥 🚨 🤷 "; exit 3' ERR
set -Eeuo pipefail

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: ./scripts/lint.sh"
    echo ""
    echo "Run all formatting and lint checks:"
    echo "  - Prettier (auto-formats code)"
    echo "  - ESLint"
    echo "  - Code duplication check (jscpd, threshold: 3%)"
    echo "  - Duplicate phrase check in YAML files"
    echo "  - Deprecated import check"
    echo ""
    echo "Called by Taskfile as part of the 'check' task. Requires nix/direnv environment."
    exit 0
fi

if [[ -z ${DIRENV_DIR:-} ]]; then
    exec direnv exec . "$0" "$@"
fi

# Autoformat with Prettier
echo "🎨 Running Prettier..."
pnpm exec prettier --write --log-level warn .

# Lint with ESLint
echo "🔍 Running ESLint..."
pnpm lint

./scripts/test-code-duplication.sh

echo "🔎 Checking for duplicate phrases in YAML files..."
python3 ./scripts/check-phrase-duplicates.py

# Fail if deprecated 'base' from $app/paths is used in Svelte files
echo "🔎 Checking for deprecated 'base' from \$app/paths..."
if grep -rn "import {[^}]*\bbase\b[^}]*} from \"\\\$app/paths\"" src/ --include="*.svelte"; then
    echo "❌ Error: 'base' from \$app/paths is deprecated. Use resolve() instead."
    exit 1
fi

# Fail if any tracked file (except LATER.md) contains an absolute path to the user's home directory
echo "🔎 Checking for hardcoded home directory paths..."
FORBIDDEN_HOME="$HOME"
if git ls-files | grep -v '^LATER\.md$' | xargs grep -l "$FORBIDDEN_HOME" 2>/dev/null | grep .; then
    echo "❌ Error: tracked files contain hardcoded $FORBIDDEN_HOME path. Fix them."
    exit 1
fi

echo "✅ Format and lint complete!"

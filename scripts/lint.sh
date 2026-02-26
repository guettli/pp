#!/usr/bin/env bash
# Bash Strict Mode: https://github.com/guettli/bash-strict-mode
trap 'echo -e "\n🤷 🚨 🔥 Warning: A command has failed. Exiting the script. Line was ($0:$LINENO): $(sed -n "${LINENO}p" "$0" 2>/dev/null || true) 🔥 🚨 🤷 "; exit 3' ERR
set -Eeuo pipefail

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

# Fail if deprecated 'base' from $app/paths is used in Svelte files
echo "🔎 Checking for deprecated 'base' from \$app/paths..."
if grep -rn "import {[^}]*\bbase\b[^}]*} from \"\\\$app/paths\"" src/ --include="*.svelte"; then
    echo "❌ Error: 'base' from \$app/paths is deprecated. Use resolve() instead."
    exit 1
fi

echo "✅ Format and lint complete!"

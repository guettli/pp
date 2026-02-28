#!/usr/bin/env bash
# Bash Strict Mode: https://github.com/guettli/bash-strict-mode
trap 'echo -e "\n🤷 🚨 🔥 Warning: A command has failed. Exiting the script. Line was ($0:$LINENO): $(sed -n "${LINENO}p" "$0" 2>/dev/null || true) 🔥 🚨 🤷 "; exit 3' ERR
set -Eeuo pipefail

# Ensure Nix environment is active, or run this script via nix develop
if [[ -z "${IN_NIX_SHELL:-}" ]]; then
    echo "Nix environment not active. Running via 'nix develop'..."
    exec nix develop --command "$0" "$@"
fi
pnpm exec jscpd --gitignore --ignore '.venv,.svelte-kit,build,dist,wasm/kaldi-fbank/.zig-cache' --reporters json,console --output .jscpd .
duplicated_percent=$(python3 -c "import json; d=json.load(open('.jscpd/jscpd-report.json')); print(d['statistics']['total']['percentage'])")
threshold=3
if [[ -n "$duplicated_percent" ]] && awk "BEGIN {exit !($duplicated_percent > $threshold)}"; then
    echo "Error: Code duplication ($duplicated_percent%) exceeds threshold ($threshold%)."
    echo "Please refactor duplicated code into reusable functions."
    rm -rf .jscpd
    exit 1
fi
echo "✓ Code duplication check passed ($duplicated_percent% <= $threshold%)"
rm -rf .jscpd

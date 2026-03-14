#!/usr/bin/env bash
# Bash Strict Mode: https://github.com/guettli/bash-strict-mode
trap 'echo -e "\n🤷 🚨 🔥 Warning: A command has failed. Exiting the script. Line was ($0:$LINENO): $(sed -n "${LINENO}p" "$0" 2>/dev/null || true) 🔥 🚨 🤷 "; exit 3' ERR
set -Eeuo pipefail

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: ./scripts/download-cdn-assets.sh"
    echo ""
    echo "Download external CDN assets needed by tests into the local cache."
    echo "Run once before running tests. Assets are cached in ~/.cache/phoneme-party/cdn/."
    exit 0
fi

XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
CDN_CACHE="$XDG_CACHE_HOME/phoneme-party/cdn"
mkdir -p "$CDN_CACHE"

download_if_missing() {
    local url="$1"
    local dest="$2"
    if [[ -f "$dest" ]]; then
        echo "✓ already cached: $(basename "$dest")"
    else
        echo "⬇ downloading: $url"
        curl -fsSL --location "$url" -o "$dest"
        echo "✓ saved: $dest"
    fi
}

download_if_missing \
    "https://github.com/aask1357/fastenhancer/releases/download/onnx-dns-v1.0.0/fastenhancer_b.onnx" \
    "$CDN_CACHE/fastenhancer_b.onnx"

echo "✅ CDN asset cache complete: $CDN_CACHE"

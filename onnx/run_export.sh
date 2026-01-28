#!/usr/bin/env bash
# Run ZIPA export with proper library paths for Nix environment
set -euo pipefail

cd "$(dirname "$0")/.."

export LD_LIBRARY_PATH="$(nix eval --raw 'nixpkgs#stdenv.cc.cc.lib' 2>/dev/null)/lib:$(nix eval --raw 'nixpkgs#zlib' 2>/dev/null)/lib:${LD_LIBRARY_PATH:-}"

source .venv/bin/activate

python onnx/export_zipa.py "$@"

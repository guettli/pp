#!/usr/bin/env bash
set -euo pipefail

if [[ -z ${DIRENV_DIR:-} ]]; then
    # Execute the command with direnv environment loaded
    exec direnv exec . "$0" "$@"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
DESTINATION="tg:public_html/phoneme-party/"

pnpm build

pnpm check

rsync -avz --delete --exclude='onnx' "${DIST_DIR}/" "${DESTINATION}"

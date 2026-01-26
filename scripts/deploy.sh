#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
DESTINATION="tg:public_html/phoneme-party/"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "Missing ${DIST_DIR}. Run 'pnpm build' first." >&2
  exit 1
fi

rsync -avz --delete "${DIST_DIR}/" "${DESTINATION}"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
DESTINATION="tg:public_html/phoneme-party/"

pnpm build

rsync -avz --delete "${DIST_DIR}/" "${DESTINATION}"

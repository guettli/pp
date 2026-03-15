#!/usr/bin/env bash
# Bash Strict Mode: https://github.com/guettli/bash-strict-mode
trap 'echo -e "\n🤷 🚨 🔥 Warning: A command has failed. Exiting the script. Line was ($0:$LINENO): $(sed -n "${LINENO}p" "$0" 2>/dev/null || true) 🔥 🚨 🤷 "; exit 3' ERR
set -Eeuo pipefail

DEPLOY_CONF="$(dirname "$0")/../deploy.conf"
if [[ ! -f "$DEPLOY_CONF" ]]; then
    echo "Error: deploy.conf not found. Copy deploy.conf.example to deploy.conf and fill in your values."
    exit 1
fi
# shellcheck disable=SC1090
source "$DEPLOY_CONF"

REMOTE_TMP="/tmp/pp-server-install"

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: ./scripts/deploy-server.sh"
    echo ""
    echo "Build and deploy the Phoneme Party Node.js server to the remote server."
    echo "  1. Builds the server bundle (adapter-node) via Taskfile"
    echo "  2. Rsyncs build artifacts to root@$REMOTE_HOST:$REMOTE_TMP/"
    echo "  3. Runs deploy-exec-on-remote.sh on the remote to install the systemd service"
    echo ""
    echo "Requires SSH access to host '$REMOTE_HOST' as root."
    exit 0
fi

echo "Deploying Phoneme Party server to $REMOTE_HOST as user $USERNAME"

# Build server bundle
echo "Building server bundle..."
./run task build-server

# Create temporary directory
TMP_DIR=$(mktemp -d)
# shellcheck disable=SC2064
trap "rm -rf $TMP_DIR" EXIT

# Copy only the files needed by the Node.js server (not static caches served from web root)
BS="$TMP_DIR/build-server"
mkdir -p "$BS/client/phoneme-party"
cp build-server/index.js build-server/handler.js build-server/env.js build-server/shims.js "$BS/"
echo '{"type":"module"}' > "$BS/package.json"
cp -r build-server/server build-server/prerendered "$BS/"
cp -r build-server/client/phoneme-party/_app "$BS/client/phoneme-party/"
cp build-server/client/phoneme-party/coi-serviceworker.js* "$BS/client/phoneme-party/"
cp -r build-server/client/phoneme-party/phrases "$BS/client/phoneme-party/"
cp -r build-server/client/phoneme-party/ipa "$BS/client/phoneme-party/"
cp scripts/deploy-exec-on-remote.sh "$TMP_DIR/"
chmod +x "$TMP_DIR/deploy-exec-on-remote.sh"

# Render systemd service file
sed "s/{{USER}}/$USERNAME/g" systemd/pp-server.service >"$TMP_DIR/pp-server.service"

# Render nginx site config
sed "s/{{USER}}/$USERNAME/g; s/{{HOST}}/$REMOTE_HOST/g" nginx/relaxandplay.de >"$TMP_DIR/nginx-site"

# Rsync to remote
echo "Copying files to remote server..."
rsync -a --stats "$TMP_DIR/" "root@$REMOTE_HOST:$REMOTE_TMP/"

# Execute installation on remote
echo "Installing service on remote..."
# shellcheck disable=SC2029
ssh "root@$REMOTE_HOST" "$REMOTE_TMP/deploy-exec-on-remote.sh $USERNAME $REMOTE_HOST $CERTBOT_EMAIL"

# Clean up remote temporary directory
# shellcheck disable=SC2029
ssh "root@$REMOTE_HOST" "rm -rf $REMOTE_TMP"

# Sync audio files separately (incremental — only changed files transferred after first deploy)
AUDIO_REMOTE="/opt/$USERNAME/build-server/client/phoneme-party/audio/"
echo "Syncing audio files (incremental)..."
rsync -az --stats build-server/client/phoneme-party/audio/ "root@$REMOTE_HOST:$AUDIO_REMOTE"
# shellcheck disable=SC2029
ssh "root@$REMOTE_HOST" "chmod -R o+rX /opt/$USERNAME/build-server/client/phoneme-party/audio"

echo ""
echo "=== Deployment Complete ==="
echo "Phoneme Party server is running on $REMOTE_HOST:3001"

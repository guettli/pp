#!/bin/bash

set -euo pipefail

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: ./scripts/deploy-server.sh"
    echo ""
    echo "Build and deploy the Phoneme Party Node.js server to the remote server."
    echo "  1. Builds the server bundle (adapter-node) via Taskfile"
    echo "  2. Rsyncs build artifacts to root@tg:/tmp/pp-server-install/"
    echo "  3. Runs deploy-exec-on-remote.sh on the remote to install the systemd service"
    echo ""
    echo "Requires SSH access to host 'tg' as root."
    exit 0
fi

HOSTNAME="tg"
USERNAME="pp"

echo "Deploying Phoneme Party server to $HOSTNAME as user $USERNAME"

# Build server bundle
echo "Building server bundle..."
./run task build-server

# Create temporary directory
TMP_DIR=$(mktemp -d)
# shellcheck disable=SC2064
trap "rm -rf $TMP_DIR" EXIT

# Copy build artifacts
cp -r build-server "$TMP_DIR/"
cp scripts/deploy-exec-on-remote.sh "$TMP_DIR/"
chmod +x "$TMP_DIR/deploy-exec-on-remote.sh"

# Render systemd service file
sed "s/{{USER}}/$USERNAME/g" systemd/pp-server.service >"$TMP_DIR/pp-server.service"

# Rsync to remote
echo "Copying files to remote server..."
rsync -av --progress "$TMP_DIR/" "root@$HOSTNAME:/tmp/pp-server-install/"

# Execute installation on remote
echo "Installing service on remote..."
# shellcheck disable=SC2029
ssh "root@$HOSTNAME" "/tmp/pp-server-install/deploy-exec-on-remote.sh $USERNAME"

# Clean up remote temporary directory
ssh "root@$HOSTNAME" "rm -rf /tmp/pp-server-install"

echo ""
echo "=== Deployment Complete ==="
echo "Phoneme Party server is running on $HOSTNAME:3001"

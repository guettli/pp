#!/bin/bash

set -euo pipefail

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: $0 <username>"
    echo ""
    echo "Execute server installation steps on the remote host."
    echo "Creates the app user, installs build artifacts to /opt/<username>,"
    echo "and installs/restarts the systemd service."
    echo ""
    echo "Called by deploy-server.sh on the remote host. Not intended for direct use."
    exit 0
fi

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <username>"
    exit 1
fi

USERNAME="$1"

echo "Installing Phoneme Party server for user: $USERNAME"

# Create user if it doesn't exist (idempotent)
if ! id "$USERNAME" &>/dev/null; then
    echo "Creating user $USERNAME..."
    useradd -m -s /bin/bash "$USERNAME"
else
    echo "User $USERNAME already exists, skipping user creation"
fi

APP_DIR="/opt/$USERNAME"
echo "Installing app to $APP_DIR..."
mkdir -p "$APP_DIR"

# Replace build-server directory
rm -rf "$APP_DIR/build-server"
cp -r /tmp/pp-server-install/build-server "$APP_DIR/"
chown -R "$USERNAME:$USERNAME" "$APP_DIR"

# Install systemd service file
SERVICE="${USERNAME}-server"
echo "Installing systemd service $SERVICE..."
cp /tmp/pp-server-install/pp-server.service "/etc/systemd/system/${SERVICE}.service"
chmod 644 "/etc/systemd/system/${SERVICE}.service"

# Reload systemd and enable/start service
echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

echo ""
echo "Service status:"
systemctl status "$SERVICE" --no-pager || true

echo ""
echo "Installation completed successfully!"

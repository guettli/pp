#!/bin/bash

set -euo pipefail

if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Usage: $0 <username> <hostname> <certbot-email>"
    echo ""
    echo "Execute server installation steps on the remote host."
    echo "Creates the app user, installs build artifacts to /opt/<username>,"
    echo "installs/restarts the systemd service, installs the nginx site config,"
    echo "and obtains a Let's Encrypt certificate if not already present."
    echo ""
    echo "Called by deploy-server.sh on the remote host. Not intended for direct use."
    exit 0
fi

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <username> <hostname> <certbot-email>"
    exit 1
fi

USERNAME="$1"
HOSTNAME="$2"
CERTBOT_EMAIL="$3"
INSTALL_DIR="/tmp/pp-server-install"

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
cp -r "$INSTALL_DIR/build-server" "$APP_DIR/"
chown -R "$USERNAME:$USERNAME" "$APP_DIR"
chmod -R o+rX "$APP_DIR/build-server/client"

# Install systemd service file
SERVICE="${USERNAME}-server"
echo "Installing systemd service $SERVICE..."
cp "$INSTALL_DIR/pp-server.service" "/etc/systemd/system/${SERVICE}.service"
chmod 644 "/etc/systemd/system/${SERVICE}.service"

# Reload systemd and enable/start service
echo "Enabling and starting service..."
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

echo ""
echo "Service status:"
systemctl status "$SERVICE" --no-pager || true

# Install nginx site config
NGINX_AVAILABLE="/etc/nginx/sites-available/$HOSTNAME"
NGINX_ENABLED="/etc/nginx/sites-enabled/$HOSTNAME"
echo "Installing nginx site config for $HOSTNAME..."
cp "$INSTALL_DIR/nginx-site" "$NGINX_AVAILABLE"
chmod 644 "$NGINX_AVAILABLE"
if [ ! -L "$NGINX_ENABLED" ]; then
    ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
fi
nginx -t
systemctl reload nginx

# Configure HTTPS via Let's Encrypt (idempotent — reuses existing cert, re-applies HTTPS to nginx config)
echo "Configuring Let's Encrypt certificate for $HOSTNAME..."
certbot --nginx -d "$HOSTNAME" --non-interactive --agree-tos -m "$CERTBOT_EMAIL"

echo ""
echo "Installation completed successfully!"

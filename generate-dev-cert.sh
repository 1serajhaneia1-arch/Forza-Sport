#!/bin/bash
# Generates a self-signed HTTPS certificate for LOCAL DEVELOPMENT ONLY.
# Your browser will show a "not secure" warning for this cert — that's expected;
# self-signed certs aren't trusted by anyone but you. For a real domain in
# production, use a real certificate instead (see DEPLOY-NOTES.md).

set -e
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 \
  -subj "/C=LY/ST=Tripoli/L=Tripoli/O=Forza Sport/CN=localhost"

echo ""
echo "✓ Created certs/key.pem and certs/cert.pem"
echo "  Restart the server, then visit: https://localhost:3443"

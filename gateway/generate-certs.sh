#!/bin/bash

# Auto-generated SSL cert script (use Let's Encrypt later)

CERT_DIR="./certs"

mkdir -p "$CERT_DIR"

# generate privte key and certificat
openssl req -x509 -newkey rsa:4096 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days 365 -nodes -subj "/CN=localhost/O=ft_transcendence/C=FR"

echo "✅ Certificate genarte in $CERT_DIR/"
echo "   - key.pem (private key)"
echo "   - cert.pem (certificate)"
echo ""
echo "⚠️  Some certificate are auto-signed for the project."
echo "   The browser will display a security warning."

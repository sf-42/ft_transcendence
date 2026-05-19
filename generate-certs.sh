#!/bin/bash

set -euo pipefail

CERT_DIR="./certs"

mkdir -p "$CERT_DIR"

INPUT=${1:-${HOSTNAMES:-localhost}}

IFS=',' read -r -a HOST_ARR <<< "$INPUT"

# First hostname as CN fallback
CN=${HOST_ARR[0]}

TMP_CONF=$(mktemp)

cat > "$TMP_CONF" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = $CN

[v3_req]
subjectAltName = @alt_names

[alt_names]
EOF

# Append alt_names properly (one per line)
ALT_INDEX=1
for h in "${HOST_ARR[@]}"; do
    if [[ $h =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        printf "IP.%d = %s\n" "$ALT_INDEX" "$h" >> "$TMP_CONF"
    else
        printf "DNS.%d = %s\n" "$ALT_INDEX" "$h" >> "$TMP_CONF"
    fi
    ALT_INDEX=$((ALT_INDEX+1))
done

echo "🔐 Generating SSL certificates in $CERT_DIR..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -config "$TMP_CONF" 2>/dev/null

rm -f "$TMP_CONF"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Certificates generated in $CERT_DIR/"
    echo "   - key.pem (private key)"
    echo "   - cert.pem (certificate)"
    echo ""
    echo "📋 These certificates are used by Nginx for HTTPS"
    echo "⚠️  WARNING: Self-signed certificates = browser security warning"
else
    echo "❌ Error during certificate generation"
    exit 1
fi
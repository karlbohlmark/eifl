#!/usr/bin/env bash
# Quick test script for B2 backup

# Load credentials from .env
if [ -f "$(dirname "$0")/../.env" ]; then
    export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

echo "Testing B2 CLI..."
echo "Bucket: $B2_BUCKET"
echo "Key ID: $B2_KEY_ID"

# Test B2 authentication
echo ""
echo "Authenticating with B2..."
if b2 account authorize "$B2_KEY_ID" "$B2_APP_KEY" > /dev/null 2>&1; then
    echo "✓ Authentication successful!"

    echo ""
    echo "Testing bucket access..."
    if b2 ls "$B2_BUCKET" > /dev/null 2>&1; then
        echo "✓ Bucket access confirmed!"

        echo ""
        echo "Running test backup..."
        "$(dirname "$0")/backup-b2.sh" hourly
    else
        echo "✗ Cannot access bucket"
        exit 1
    fi
else
    echo "✗ Authentication failed"
    echo "Please check B2_KEY_ID and B2_APP_KEY in .env"
    exit 1
fi

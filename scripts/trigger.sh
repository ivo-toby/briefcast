#!/bin/bash
set -e

# Load API token
if [ -f ".api-token" ]; then
    API_TOKEN=$(cat .api-token)
else
    read -p "Enter API_AUTH_TOKEN: " API_TOKEN
fi

# Get worker URL from wrangler.toml or use argument
if [ -n "$1" ]; then
    WORKER_URL="$1"
else
    read -p "Enter worker URL: " WORKER_URL
fi

echo "🔄 Triggering manual aggregation..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL/trigger" \
    -H "Authorization: Bearer $API_TOKEN")

STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$STATUS" = "200" ]; then
    echo "✅ Triggered successfully!"
    echo "$BODY" | jq '.'
else
    echo "❌ Failed: HTTP $STATUS"
    echo "$BODY"
    exit 1
fi

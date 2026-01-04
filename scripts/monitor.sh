#!/bin/bash
set -e

# Load configuration
if [ -f ".api-token" ]; then
    API_TOKEN=$(cat .api-token)
else
    read -p "Enter API_AUTH_TOKEN: " API_TOKEN
fi

if [ -n "$1" ]; then
    WORKER_URL="$1"
else
    read -p "Enter worker URL: " WORKER_URL
fi

echo "🔍 Monitoring Briefcast..."
echo ""

# Check API health
echo "1️⃣  API Health Check"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/pending" \
    -H "Authorization: Bearer $API_TOKEN")

if [ "$STATUS" = "200" ]; then
    echo "✅ API is healthy"
else
    echo "❌ API returned HTTP $STATUS"
fi
echo ""

# Check pending scripts
echo "2️⃣  Pending Scripts"
PENDING=$(curl -s "$WORKER_URL/pending" \
    -H "Authorization: Bearer $API_TOKEN")

SCRIPT_COUNT=$(echo "$PENDING" | jq '.scripts | length')
echo "📝 $SCRIPT_COUNT pending script(s)"

if [ "$SCRIPT_COUNT" -gt 0 ]; then
    echo "⚠️  Scripts waiting for review!"
fi
echo ""

# Check worker logs (last 100 lines)
echo "3️⃣  Recent Logs"
echo "Fetching logs..."
wrangler tail --format=json --once 2>/dev/null | head -20 | while read line; do
    LEVEL=$(echo "$line" | jq -r '.level // "info"')
    MESSAGE=$(echo "$line" | jq -r '.message // .outcome')

    case "$LEVEL" in
        error)
            echo "❌ ERROR: $MESSAGE"
            ;;
        warn)
            echo "⚠️  WARN: $MESSAGE"
            ;;
        *)
            echo "ℹ️  $MESSAGE"
            ;;
    esac
done
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "API Status: $([ "$STATUS" = "200" ] && echo "✅ OK" || echo "❌ DOWN")"
echo "Pending Scripts: $SCRIPT_COUNT"
echo ""

if [ "$SCRIPT_COUNT" -gt 0 ]; then
    echo "💡 Run ./scripts/review.sh to review pending scripts"
fi

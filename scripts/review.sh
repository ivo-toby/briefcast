#!/bin/bash
set -e

# Load API token
if [ -f ".api-token" ]; then
    API_TOKEN=$(cat .api-token)
else
    read -p "Enter API_AUTH_TOKEN: " API_TOKEN
fi

# Get worker URL
if [ -n "$1" ]; then
    WORKER_URL="$1"
else
    read -p "Enter worker URL: " WORKER_URL
fi

echo "📋 Fetching pending scripts..."

# Get pending scripts
RESPONSE=$(curl -s "$WORKER_URL/pending" \
    -H "Authorization: Bearer $API_TOKEN")

SCRIPT_COUNT=$(echo "$RESPONSE" | jq '.scripts | length')

if [ "$SCRIPT_COUNT" = "0" ]; then
    echo "✅ No pending scripts to review"
    exit 0
fi

echo "Found $SCRIPT_COUNT pending script(s)"
echo ""

# Review each script
for i in $(seq 0 $((SCRIPT_COUNT - 1))); do
    SCRIPT=$(echo "$RESPONSE" | jq ".scripts[$i]")
    SCRIPT_ID=$(echo "$SCRIPT" | jq -r '.id')
    CONTENT=$(echo "$SCRIPT" | jq -r '.content')
    WORD_COUNT=$(echo "$SCRIPT" | jq -r '.wordCount')

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Script ID: $SCRIPT_ID"
    echo "Word Count: $WORD_COUNT"
    echo ""
    echo "$CONTENT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    read -p "Action? (a=approve, r=reject, s=skip): " ACTION

    case "$ACTION" in
        a|A)
            echo "✅ Approving script..."
            curl -s -X POST "$WORKER_URL/approve/$SCRIPT_ID" \
                -H "Authorization: Bearer $API_TOKEN" | jq '.'
            ;;
        r|R)
            echo "❌ Rejecting script..."
            curl -s -X POST "$WORKER_URL/reject/$SCRIPT_ID" \
                -H "Authorization: Bearer $API_TOKEN" | jq '.'
            ;;
        *)
            echo "⏭️  Skipped"
            ;;
    esac

    echo ""
done

echo "✅ Review complete!"

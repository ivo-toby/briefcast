#!/bin/bash
#
# Test TTS Generation Script
# Usage: ./test-tts.sh <script-file.txt> [style-prompt]
#
# Prerequisites:
# 1. Set BRIEFCAST_URL environment variable (e.g., https://your-worker.workers.dev)
# 2. Set BRIEFCAST_TOKEN environment variable (your API_AUTH_TOKEN)
#
# Example:
#   export BRIEFCAST_URL="https://briefcast.your-account.workers.dev"
#   export BRIEFCAST_TOKEN="your-secret-token"
#   ./test-tts.sh my-script.txt
#
# With custom style prompt:
#   ./test-tts.sh my-script.txt "You are an enthusiastic tech podcaster"
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required environment variables
if [[ -z "${BRIEFCAST_URL:-}" ]]; then
    echo -e "${RED}Error: BRIEFCAST_URL environment variable is not set${NC}"
    echo "Set it with: export BRIEFCAST_URL=\"https://your-worker.workers.dev\""
    exit 1
fi

if [[ -z "${BRIEFCAST_TOKEN:-}" ]]; then
    echo -e "${RED}Error: BRIEFCAST_TOKEN environment variable is not set${NC}"
    echo "Set it with: export BRIEFCAST_TOKEN=\"your-secret-token\""
    exit 1
fi

# Check for required arguments
if [[ $# -lt 1 ]]; then
    echo -e "${RED}Error: Script file not provided${NC}"
    echo "Usage: $0 <script-file.txt> [style-prompt]"
    exit 1
fi

SCRIPT_FILE="$1"
STYLE_PROMPT="${2:-}"

# Check if file exists
if [[ ! -f "$SCRIPT_FILE" ]]; then
    echo -e "${RED}Error: File '$SCRIPT_FILE' not found${NC}"
    exit 1
fi

# Read the script content
echo -e "${YELLOW}Reading script from: $SCRIPT_FILE${NC}"
SCRIPT_TEXT=$(cat "$SCRIPT_FILE")
WORD_COUNT=$(echo "$SCRIPT_TEXT" | wc -w)
CHAR_COUNT=$(echo -n "$SCRIPT_TEXT" | wc -c)

echo -e "${GREEN}Script loaded:${NC}"
echo "  - Words: $WORD_COUNT"
echo "  - Characters: $CHAR_COUNT"
echo "  - Estimated duration: ~$((WORD_COUNT / 150)) minutes"
echo ""

# Build JSON payload
if [[ -n "$STYLE_PROMPT" ]]; then
    echo -e "${YELLOW}Using custom style prompt: $STYLE_PROMPT${NC}"
    JSON_PAYLOAD=$(jq -n \
        --arg text "$SCRIPT_TEXT" \
        --arg prompt "$STYLE_PROMPT" \
        '{text: $text, style_prompt: $prompt}')
else
    echo -e "${YELLOW}Using default style prompt from config${NC}"
    JSON_PAYLOAD=$(jq -n \
        --arg text "$SCRIPT_TEXT" \
        '{text: $text}')
fi

echo ""
echo -e "${YELLOW}Calling TTS API...${NC}"
echo "URL: ${BRIEFCAST_URL}/test-tts"
echo ""

# Make the API call
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${BRIEFCAST_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" \
    "${BRIEFCAST_URL}/test-tts")

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract response body (all but last line)
BODY=$(echo "$RESPONSE" | sed '$d')

echo -e "${GREEN}HTTP Status: $HTTP_CODE${NC}"
echo ""

if [[ "$HTTP_CODE" == "200" ]]; then
    echo -e "${GREEN}✓ TTS Generation Successful!${NC}"
    echo ""
    echo "Response:"
    echo "$BODY" | jq '.'

    # Extract metrics
    SUCCESS=$(echo "$BODY" | jq -r '.success')
    AUDIO_URL=$(echo "$BODY" | jq -r '.audioUrl // ""')
    AUDIO_SIZE=$(echo "$BODY" | jq -r '.audioSizeBytes // 0')
    DURATION=$(echo "$BODY" | jq -r '.durationSeconds // 0')
    CHUNKS=$(echo "$BODY" | jq -r '.chunks // 0')

    if [[ "$SUCCESS" == "true" ]]; then
        echo ""
        echo -e "${GREEN}Audio Metrics:${NC}"
        echo "  - Size: $(numfmt --to=iec-i --suffix=B $AUDIO_SIZE 2>/dev/null || echo "${AUDIO_SIZE} bytes")"
        echo "  - Duration: ${DURATION}s (~$((DURATION / 60))m $((DURATION % 60))s)"
        echo "  - Chunks processed: $CHUNKS"
        echo ""
        echo -e "${GREEN}✓ Test completed successfully!${NC}"
        echo ""
        echo -e "${YELLOW}Audio URL:${NC}"
        echo "  ${AUDIO_URL}"
        echo ""
        echo -e "${GREEN}Download and listen:${NC}"
        echo "  curl -o test-audio.mp3 \"${AUDIO_URL}\""
        echo ""
        echo -e "${YELLOW}Or open directly in your browser/player:${NC}"
        echo "  ${AUDIO_URL}"
    fi
else
    echo -e "${RED}✗ TTS Generation Failed!${NC}"
    echo ""
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    exit 1
fi

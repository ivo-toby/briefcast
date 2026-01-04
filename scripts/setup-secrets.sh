#!/bin/bash
set -e

echo "🔐 Setting up Cloudflare secrets..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

# ANTHROPIC_API_KEY
echo ""
echo "1️⃣  Anthropic API Key"
echo "Get your key from: https://console.anthropic.com/"
read -p "Enter ANTHROPIC_API_KEY: " ANTHROPIC_KEY
echo "$ANTHROPIC_KEY" | wrangler secret put ANTHROPIC_API_KEY

# FISH_AUDIO_API_KEY
echo ""
echo "2️⃣  Fish Audio API Key"
echo "Get your key from: https://fish.audio/"
read -p "Enter FISH_AUDIO_API_KEY: " FISH_KEY
echo "$FISH_KEY" | wrangler secret put FISH_AUDIO_API_KEY

# API_AUTH_TOKEN
echo ""
echo "3️⃣  API Auth Token"
echo "Generate a secure random token..."
API_TOKEN=$(openssl rand -hex 32)
echo "Generated token: $API_TOKEN"
echo "⚠️  Save this token - you'll need it to call API endpoints!"
echo "$API_TOKEN" | wrangler secret put API_AUTH_TOKEN

# Save token to local file
echo "$API_TOKEN" > .api-token
chmod 600 .api-token
echo ""
echo "✅ Token saved to .api-token (gitignored)"

echo ""
echo "✅ All secrets configured!"
echo ""
echo "Your API token: $API_TOKEN"
echo "Use it like: curl -H \"Authorization: Bearer $API_TOKEN\" ..."

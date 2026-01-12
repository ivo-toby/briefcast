#!/bin/bash
#
# Deploy Briefcast Email Worker to Cloudflare Workers
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/workers/email-worker"

echo "🚀 Deploying Briefcast Email Worker..."

# Change to worker directory
cd "$WORKER_DIR"

# Check if wrangler.toml exists
if [ ! -f "wrangler.toml" ]; then
    if [ -f "wrangler.example.toml" ]; then
        echo "⚠️  wrangler.toml not found. Copy from example:"
        echo "   cp wrangler.example.toml wrangler.toml"
        echo "   Then edit with your R2 bucket name."
        exit 1
    fi
    echo "❌ wrangler.toml not found."
    exit 1
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Install with: npm install -g wrangler"
    exit 1
fi

# Check if logged in
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Run: wrangler login"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run type check
echo "🔍 Running type check..."
npm run typecheck

# Deploy worker
echo "🚀 Deploying worker..."
wrangler deploy

echo "✅ Email Worker deployed!"
echo ""
echo "Next steps:"
echo "1. Set ALLOWED_SENDERS secret: wrangler secret put ALLOWED_SENDERS"
echo "2. Configure email routing in Cloudflare dashboard"
echo "3. Send a test email to verify"

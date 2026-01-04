#!/bin/bash
set -e

echo "🚀 Deploying Briefcast to Cloudflare..."

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

# Run tests
echo "📋 Running tests..."
npm test

# Lint code
echo "🔍 Linting code..."
npm run lint

# Deploy worker
echo "📦 Deploying worker..."
wrangler deploy

# Upload config if exists
if [ -f "config.yaml" ]; then
    echo "⚙️  Uploading config.yaml to R2..."
    BUCKET_NAME=$(rg 'bucket_name = "([^"]+)"' wrangler.toml -or '$1' | head -1)
    wrangler r2 object put "$BUCKET_NAME/config.yaml" --file=config.yaml
fi

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Set secrets: npm run setup-secrets"
echo "2. Test endpoint: curl https://your-worker.workers.dev/pending"
echo "3. Configure email routing in Cloudflare dashboard"

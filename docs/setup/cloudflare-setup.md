# Cloudflare Setup

Complete guide to setting up Cloudflare services for Briefcast.

## Prerequisites

- Cloudflare account
- Domain name (optional for testing)
- Wrangler CLI installed
- Git repository

## 1. Install Wrangler

```bash
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

## 2. Create KV Namespace

**Purpose**: Temporary storage for incoming emails.

```bash
# Create production KV namespace
wrangler kv:namespace create EMAIL_STORE

# Note the ID from output:
# { binding = "EMAIL_STORE", id = "abc123..." }

# Create preview namespace for testing
wrangler kv:namespace create EMAIL_STORE --preview
```

**Update wrangler.toml**:
```toml
[[kv_namespaces]]
binding = "EMAIL_STORE"
id = "your-production-id"
preview_id = "your-preview-id"
```

## 3. Create R2 Bucket

**Purpose**: Store audio files, RSS feed, and config.yaml.

```bash
# Create R2 bucket
wrangler r2 bucket create briefcast-podcast

# Note: R2 requires paid Workers plan ($5/month minimum)
```

**Update wrangler.toml**:
```toml
[[r2_buckets]]
binding = "PODCAST_BUCKET"
bucket_name = "briefcast-podcast"
preview_bucket_name = "briefcast-podcast-preview"
```

## 4. Configure Email Workers

```toml
# Add to wrangler.toml
[[email]]
name = "email-worker"
destination = "newsletters@your-domain.com"
```

**Enable Email Routing**:
1. Go to Cloudflare Dashboard
2. Select your domain
3. Email > Email Routing
4. Enable Email Routing
5. Add destination address

## 5. Upload Config File

```bash
# Create config.yaml from example
cp config.yaml.example config.yaml

# Edit config.yaml with your settings
nano config.yaml

# Upload to R2
wrangler r2 object put briefcast-podcast/config.yaml --file=config.yaml
```

## 6. Set Secrets

```bash
# Anthropic API key
wrangler secret put ANTHROPIC_API_KEY

# OpenAI API key
wrangler secret put OPENAI_API_KEY

# API auth token
wrangler secret put API_AUTH_TOKEN
```

## 7. Deploy Worker

```bash
# Deploy to production
wrangler deploy

# Output will show:
# - Worker URL: https://briefcast.your-subdomain.workers.dev
# - Email route: newsletters@your-domain.com
```

## 8. Configure Cron Trigger

The cron trigger is already configured in `wrangler.toml`:

```toml
[triggers]
crons = ["0 5 * * *"]  # Daily at 5 AM UTC
```

**Test cron trigger**:
```bash
curl -X POST \
  -H "Authorization: Bearer your-api-token" \
  https://your-worker.workers.dev/trigger
```

## 9. Set Up Custom Domain (Optional)

```bash
# Add custom domain route
wrangler deploy --route podcast.yourdomain.com/*
```

Or in Cloudflare Dashboard:
1. Workers & Pages > Your worker
2. Triggers tab
3. Add Custom Domain
4. Enter: `podcast.yourdomain.com`

## 10. Enable R2 Public Access

```bash
# Make bucket publicly accessible for RSS feed
# In Cloudflare Dashboard:
# R2 > Your bucket > Settings
# Enable "Public URL access"
# Note the public URL
```

**Update config.yaml**:
```yaml
podcast:
  base_url: "https://pub-xxxxx.r2.dev"
```

## Verification

### Test Email Ingestion

```bash
# Send test email to newsletters@your-domain.com

# Check KV storage
wrangler kv:key list --namespace-id=your-kv-id
```

### Test API Endpoints

```bash
# Health check
curl https://your-worker.workers.dev/pending \
  -H "Authorization: Bearer your-token"

# Manual trigger
curl -X POST https://your-worker.workers.dev/trigger \
  -H "Authorization: Bearer your-token"
```

### Test R2 Access

```bash
# Check config file
curl https://pub-xxxxx.r2.dev/config.yaml

# Should return your config (if public)
```

## Cost Breakdown

**Free Tier**:
- Workers: 100,000 requests/day
- KV: 100,000 reads/day, 1,000 writes/day
- Email Routing: Unlimited

**Paid Requirements**:
- R2 Storage: Requires Workers Paid plan ($5/month)
- Additional R2 costs: $0.015/GB storage

**Estimated Monthly Cost**:
- Workers Paid: $5.00
- R2 Storage (10 GB): $0.15
- KV: $0.00 (within free tier)
- **Total: ~$5.15/month**

## Troubleshooting

**KV namespace binding error**
- Verify namespace ID in wrangler.toml
- Check binding name matches code

**R2 bucket not accessible**
- Confirm Workers Paid plan is active
- Verify bucket name in wrangler.toml
- Check R2 permissions

**Email not received**
- Verify Email Routing is enabled
- Check MX records are configured
- Confirm destination address is verified

**Deployment fails**
- Run `wrangler whoami` to verify login
- Check wrangler.toml syntax
- Verify all secrets are set

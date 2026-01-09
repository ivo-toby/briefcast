# Quick Start Guide

## Prerequisites

- Cloudflare account
- Domain name (optional but recommended)
- Anthropic API key
- OpenAI API key

## Step 1: Clone and Install

```bash
git clone <repo>
cd briefcast
npm install
```

## Step 2: Configure

```bash
cp wrangler.toml.example wrangler.toml
cp config.yaml.example config.yaml
```

Edit `wrangler.toml` with your Cloudflare details.

## Step 3: Set Secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put API_AUTH_TOKEN
```

## Step 4: Deploy

```bash
wrangler deploy
```

## Step 5: Configure Email Routing

In Cloudflare dashboard:
1. Go to Email Routing
2. Add destination address
3. Configure catch-all or specific routes

## Step 6: Upload Config

Upload `config.yaml` to your R2 bucket as `config.yaml`.

## Done!

Your podcast will generate daily at the configured time.

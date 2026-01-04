# API Keys Setup

Configure the required API keys for Briefcast.

## Required API Keys

### 1. Anthropic API Key

**Purpose**: Generate podcast scripts from newsletter content using Claude.

**Setup**:
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Go to API Keys section
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-`)

**Add to Wrangler**:
```bash
wrangler secret put ANTHROPIC_API_KEY
# Paste your key when prompted
```

**Pricing**: Pay-as-you-go, ~$0.003 per 1K tokens

### 2. Fish Audio API Key

**Purpose**: Convert podcast scripts to audio using text-to-speech.

**Setup**:
1. Visit [Fish Audio](https://fish.audio/)
2. Create account
3. Go to API section
4. Generate new API key
5. Copy the key

**Add to Wrangler**:
```bash
wrangler secret put FISH_AUDIO_API_KEY
# Paste your key when prompted
```

**Pricing**: Check current Fish Audio pricing

### 3. API Auth Token

**Purpose**: Protect your Briefcast API endpoints.

**Setup**:
```bash
# Generate secure random token
openssl rand -hex 32

# Add to Wrangler
wrangler secret put API_AUTH_TOKEN
# Paste the generated token
```

**Usage**:
```bash
# All API calls require this token
curl -H "Authorization: Bearer your-token-here" \
     https://your-worker.workers.dev/trigger
```

## Verifying Keys

### Test Anthropic Key

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Test Fish Audio Key

```bash
curl https://api.fish.audio/v1/tts \
  -H "Authorization: Bearer $FISH_AUDIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "voice_id": "default"
  }'
```

### Test API Auth Token

```bash
curl -H "Authorization: Bearer $API_AUTH_TOKEN" \
     https://your-worker.workers.dev/pending
```

## Security Best Practices

1. **Never commit API keys to git**
   - Use `.env.local` for local development (gitignored)
   - Use `wrangler secret` for production

2. **Rotate keys periodically**
   ```bash
   # Update secrets
   wrangler secret put ANTHROPIC_API_KEY
   wrangler secret put FISH_AUDIO_API_KEY
   ```

3. **Use separate keys for dev/prod**
   - Create different Anthropic/Fish Audio keys
   - Use different auth tokens

4. **Monitor usage**
   - Check Anthropic Console for usage
   - Check Fish Audio dashboard for costs
   - Set up budget alerts

## Troubleshooting

**Invalid Anthropic key error**
- Verify key starts with `sk-ant-`
- Check key is active in console
- Ensure correct permissions

**Fish Audio authentication failed**
- Verify API key format
- Check account is active
- Confirm sufficient credits

**API auth token rejected**
- Verify token matches secret
- Check Bearer prefix in header
- Ensure token is hex string

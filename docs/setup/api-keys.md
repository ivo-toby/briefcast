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

### 2. OpenAI API Key

**Purpose**: Convert podcast scripts to audio using GPT-4o TTS with prompt steering.

**Setup**:
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to API Keys section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-proj-` or `sk-`)

**Add to Wrangler**:
```bash
wrangler secret put OPENAI_API_KEY
# Paste your key when prompted
```

**Pricing**: ~$0.015 per minute of audio (GPT-4o-mini TTS pricing)

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

### Test OpenAI Key

```bash
curl https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini-tts",
    "input": "Hello world",
    "voice": "alloy"
  }' \
  --output test.mp3
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
   wrangler secret put OPENAI_API_KEY
   ```

3. **Use separate keys for dev/prod**
   - Create different Anthropic/OpenAI keys
   - Use different auth tokens

4. **Monitor usage**
   - Check Anthropic Console for usage
   - Check OpenAI Platform for API usage and costs
   - Set up budget alerts in both platforms

## Troubleshooting

**Invalid Anthropic key error**
- Verify key starts with `sk-ant-`
- Check key is active in console
- Ensure correct permissions

**OpenAI authentication failed**
- Verify API key starts with `sk-`
- Check account is active and has billing enabled
- Confirm sufficient credits/balance

**API auth token rejected**
- Verify token matches secret
- Check Bearer prefix in header
- Ensure token is hex string

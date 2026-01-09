# Briefcast

Transform your newsletter subscriptions into a personalized daily podcast using AI.

## Overview

Briefcast automatically:

1. Receives newsletters via email forwarding
2. Aggregates content daily on a schedule
3. Generates podcast scripts using Claude AI
4. Converts scripts to audio using OpenAI TTS (gpt-4o-mini-tts)
5. Publishes episodes to your private podcast RSS feed

**Built with**: Cloudflare Workers, R2, KV, Email Workers, Anthropic Claude, OpenAI TTS

## Features

- 📧 **Email Ingestion**: Forward newsletters to dedicated email address
- 🤖 **AI Script Generation**: Claude transforms content into engaging podcast scripts with date awareness
- 🎙️ **Text-to-Speech**: High-quality steerable audio using OpenAI gpt-4o-mini-tts
- 📻 **Private RSS Feed**: Subscribe in any podcast app
- 🔒 **Manual Review**: Optional approval workflow before publishing
- 📝 **Script Archiving**: Automatic script saving to R2 for regeneration
- 🧪 **TTS Testing**: Test audio generation without affecting production
- ⚙️ **Fully Configurable**: YAML-based configuration for all settings including voice style
- 💰 **Cost Effective**: ~$6-11/month on Cloudflare's platform

## Recent Updates

### OpenAI gpt-4o-mini-tts with Prompt Steering

Briefcast now uses OpenAI's `gpt-4o-mini-tts` model with steerable voice delivery:

- **Better Quality**: 48 kHz studio-grade audio vs standard quality
- **Cost Savings**: 67% cheaper than tts-1-hd (~$3.60/month vs $10.80/month)
- **Steerable Voice**: Control tone, emotion, pacing, and accent via `style_prompt`
- **Less Robotic**: More natural-sounding delivery with AI-powered expressiveness

Configure in `config.yaml`:

```yaml
tts:
  model: 'gpt-4o-mini-tts'
  voice: 'nova' # alloy, echo, fable, onyx, nova, shimmer
  style_prompt: 'You are a professional podcast host. Speak clearly and engagingly...'
```

### Script-Only Generation Workflow

New `/generate-script` endpoint allows you to:

- Generate and review scripts before committing to audio generation
- Keep emails in storage for potential regeneration
- Approve scripts via `/approve/{script-id}` to generate audio

### Script Archiving

Scripts are now automatically saved to R2 as text files:

- Stored in `scripts/` folder with date-based naming
- Enables regeneration without re-running Claude
- Configurable via `storage.save_scripts` in config.yaml

### Date-Aware Script Generation

Claude now knows the current date when generating scripts:

- Use `{date}` variable in `user_prompt_template`
- Prevents temporal confusion ("it's not 2025" when it's 2026)
- Automatically formatted as "Monday, January 9, 2026"

### TTS Testing Endpoint

Test audio generation without affecting production:

- `/test-tts` endpoint for isolated testing
- Saves test audio to R2 with `test-` prefix
- Accepts custom `style_prompt` for experimentation
- See `TEST-TTS.md` for usage guide

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (Workers Paid plan for R2)
- Domain name (optional, can use workers.dev subdomain)
- [Anthropic API key](https://console.anthropic.com/)
- [OpenAI API key](https://platform.openai.com/api-keys)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/briefcast.git
cd briefcast

# Install dependencies
npm install

# Login to Cloudflare
npm install -g wrangler
wrangler login
```

### Setup

1. **Create Cloudflare Resources**

```bash
# Create KV namespace for email storage
wrangler kv:namespace create EMAIL_STORE
wrangler kv:namespace create EMAIL_STORE --preview

# Create R2 bucket for audio and feed
wrangler r2 bucket create briefcast-podcast

# Update wrangler.toml with the IDs from above commands
```

2. **Configure Secrets**

```bash
# Interactive setup
./scripts/setup-secrets.sh

# Or manually:
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put API_AUTH_TOKEN  # Generate with: openssl rand -hex 32
```

3. **Configure Settings**

```bash
# Copy example config
cp config.yaml.example config.yaml

# Edit with your settings
nano config.yaml

# Upload to R2
wrangler r2 object put briefcast-podcast/config.yaml --file=config.yaml
```

4. **Deploy**

```bash
# Run tests and deploy
./scripts/deploy.sh

# Or manually:
npm test
npm run lint
wrangler deploy
```

### Email Configuration

Set up email routing in Cloudflare Dashboard:

1. Go to **Email** > **Email Routing**
2. Enable Email Routing
3. Add destination address (your personal email)
4. Create custom address: `newsletters@yourdomain.com`
5. Forward newsletters to this address

See [docs/setup/domain-setup.md](docs/setup/domain-setup.md) for detailed instructions.

## Usage

### Automatic Workflow

1. **Subscribe**: Forward newsletters to `newsletters@yourdomain.com`
2. **Daily Processing**: Cron job runs daily at 5 AM UTC
3. **Script Generation**: Claude creates podcast script with current date awareness
4. **Review** (if enabled): Approve/reject via API
5. **Audio Generation**: OpenAI TTS converts to high-quality MP3 with steerable voice
6. **Script Archiving**: Script saved to R2 as text file (if enabled)
7. **RSS Update**: Episode added to feed automatically

### Manual Control

```bash
# Trigger aggregation manually
./scripts/trigger.sh https://your-worker.workers.dev

# Review pending scripts
./scripts/review.sh https://your-worker.workers.dev

# Monitor system health
./scripts/monitor.sh https://your-worker.workers.dev
```

### API Endpoints

```bash
# Get pending scripts
curl https://your-worker.workers.dev/pending \
  -H "Authorization: Bearer your-token"

# Manually trigger aggregation (full workflow)
curl -X POST https://your-worker.workers.dev/trigger \
  -H "Authorization: Bearer your-token"

# Generate script only (without audio generation or email deletion)
curl -X POST https://your-worker.workers.dev/generate-script \
  -H "Authorization: Bearer your-token"

# Approve script (generates audio and updates RSS feed)
curl -X POST https://your-worker.workers.dev/approve/script-id \
  -H "Authorization: Bearer your-token"

# Reject script
curl -X POST https://your-worker.workers.dev/reject/script-id \
  -H "Authorization: Bearer your-token"

# Test TTS generation (saves to R2 with test- prefix)
curl -X POST https://your-worker.workers.dev/test-tts \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "This is a test of the text-to-speech system.",
    "style_prompt": "Speak clearly and professionally."
  }'
```

See [docs/usage/manual-workflow.md](docs/usage/manual-workflow.md) for details.

## Configuration

Edit `config.yaml` to customize:

```yaml
schedule:
  cron: '0 5 * * *' # Daily at 5 AM UTC

filtering:
  include_topics: ['AI', 'technology', 'startups']
  exclude_topics: ['politics', 'sports']
  exclude_keywords: ['unsubscribe', 'spam']

script_generation:
  model: 'claude-3-5-sonnet-20241022'
  max_tokens: 4000
  temperature: 0.7
  min_words: 800
  max_words: 2000
  target_duration_minutes: 10
  system_prompt: 'You are a professional podcast host...'
  # Available variables: {newsletters}, {target_duration_minutes}, {min_words}, {max_words}, {date}
  user_prompt_template: |
    Create a {target_duration_minutes}-minute podcast episode from today's newsletters.

    Today's date: {date}

    Newsletters:
    {newsletters}

tts:
  model: 'gpt-4o-mini-tts' # OpenAI's steerable TTS model
  voice: 'nova' # Options: alloy, echo, fable, onyx, nova, shimmer
  format: 'mp3'
  speed: 1.00 # Range: 0.25 to 4.0
  bitrate: 128 # kbps
  style_prompt: 'You are a professional podcast host. Speak clearly and engagingly, with natural pacing and warm, conversational tone.'

podcast:
  title: 'My Daily AI Digest'
  description: 'AI news curated and narrated by AI'
  author: 'Your Name'
  email: 'your@email.com'
  category: 'Technology'
  subcategory: 'Tech News'
  language: 'en-us'
  copyright: '© 2026 Your Name'
  image_url: 'https://pub-xxxxx.r2.dev/cover.jpg'
  site_url: 'https://pub-xxxxx.r2.dev'

storage:
  max_episodes: 21
  email_ttl_days: 7
  pending_script_ttl_days: 21
  save_scripts: true # Save scripts as text files in R2 (scripts/ folder)

performance:
  claude_timeout_seconds: 120
  tts_timeout_seconds: 300
  max_retries: 3
  retry_backoff_seconds: 5
```

See [docs/usage/configuration.md](docs/usage/configuration.md) for all options.

## Project Structure

```
briefcast/
├── src/
│   ├── index.ts              # Worker entry point
│   ├── email-worker.ts       # Email ingestion handler
│   ├── scheduled-worker.ts   # Daily aggregation cron
│   ├── api-worker.ts         # API endpoints
│   └── lib/
│       ├── types.ts          # TypeScript interfaces
│       ├── errors.ts         # Custom error classes
│       ├── logger.ts         # Structured logging
│       ├── retry.ts          # Exponential backoff
│       ├── config-loader.ts  # YAML config + validation
│       ├── content-extractor.ts  # Email parsing
│       ├── script-generator.ts   # Claude API integration
│       ├── tts-generator.ts      # OpenAI TTS integration
│       ├── storage.ts            # R2/KV operations
│       ├── rss-generator.ts      # Podcast feed generation
│       └── auth.ts               # API authentication
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   ├── e2e/                  # End-to-end tests
│   └── fixtures/             # Test data
├── docs/
│   ├── setup/                # Setup guides
│   └── usage/                # Usage documentation
├── scripts/                  # Helper scripts
├── wrangler.toml             # Cloudflare configuration
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
└── vitest.config.ts          # Test configuration
```

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Local development
npm run dev

# Tail logs
wrangler tail
```

## Documentation

- [Quick Start Guide](docs/setup/quickstart.md)
- [Domain Setup](docs/setup/domain-setup.md)
- [API Keys Setup](docs/setup/api-keys.md)
- [Cloudflare Setup](docs/setup/cloudflare-setup.md)
- [Configuration Reference](docs/usage/configuration.md)
- [Manual Workflow](docs/usage/manual-workflow.md)
- [Monitoring](docs/usage/monitoring.md)
- [Scaling & CDN](docs/usage/scaling-cdn.md)
- [Troubleshooting](docs/troubleshooting.md)

## Cost Breakdown

Estimated monthly costs (daily podcast):

- **Cloudflare Workers Paid**: $5.00
- **R2 Storage** (10 GB): ~$0.15
- **KV Storage**: Free (within limits)
- **Email Routing**: Free
- **Anthropic Claude API**: ~$2-5/month (script generation)
- **OpenAI TTS API** (gpt-4o-mini-tts): ~$3.60/month
  - Based on ~3000 tokens/day at $12/1M tokens
  - 67% cheaper than tts-1-hd ($10.80/month)
  - Superior quality with 48 kHz audio and prompt steering

**Total: ~$11-14/month**

### Cost Optimization Tips

- Use `save_scripts: true` to regenerate audio without re-running Claude
- Adjust `target_duration_minutes` to control script length
- Use `/test-tts` endpoint to verify settings before production
- Set `max_episodes` to limit R2 storage costs

## Architecture

```
┌─────────────┐
│ Newsletters │
│   (Email)   │
└──────┬──────┘
       │
       ▼
┌─────────────┐      ┌──────────┐
│   Email     │─────▶│    KV    │
│   Worker    │      │ Storage  │
└─────────────┘      └────┬─────┘
                          │
       ┌──────────────────┘
       │
       ▼
┌─────────────┐      ┌──────────┐
│  Scheduled  │─────▶│  Claude  │
│   Worker    │      │   API    │
│ (Cron 5AM)  │      └──────────┘
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Pending   │
│   Scripts   │
└──────┬──────┘
       │
       ▼
┌─────────────┐      ┌──────────┐
│   Manual    │      │  OpenAI  │
│   Review    │─────▶│   TTS    │
│ (Optional)  │      │   API    │
└──────┬──────┘      └────┬─────┘
       │                  │
       └─────────┬────────┘
                 │
                 ▼
          ┌─────────────┐
          │  R2 Bucket  │
          │ Audio + RSS │
          └──────┬──────┘
                 │
                 ▼
          ┌─────────────┐
          │   Podcast   │
          │    Apps     │
          └─────────────┘
```

## Troubleshooting

**Email not received**

- Check Email Routing is enabled in Cloudflare
- Verify MX records are configured
- Check spam folder

**Script generation fails**

- Verify Anthropic API key is valid
- Check account has credits
- Review worker logs: `wrangler tail`

**Audio generation fails**

- Verify OpenAI API key is valid
- Check account has credits and billing is set up
- Review worker logs: `wrangler tail`
- Test with `/test-tts` endpoint to isolate issues
- Check `style_prompt` isn't too long (max ~1950 tokens)

**RSS feed not updating**

- Check R2 bucket permissions
- Verify base_url in config.yaml
- Confirm episodes are being stored

See [docs/troubleshooting.md](docs/troubleshooting.md) for more solutions.

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- AI by [Anthropic Claude](https://www.anthropic.com/)
- TTS by [OpenAI gpt-4o-mini-tts](https://platform.openai.com/)
- Inspired by newsletter aggregation tools

## Support

- [GitHub Issues](https://github.com/yourusername/briefcast/issues)
- [Documentation](docs/)

---

**Made with ❤️ and Claude Code**

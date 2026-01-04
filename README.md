# Briefcast

Transform your newsletter subscriptions into a personalized daily podcast using AI.

## Overview

Briefcast automatically:
1. Receives newsletters via email forwarding
2. Aggregates content daily on a schedule
3. Generates podcast scripts using Claude AI
4. Converts scripts to audio using Fish Audio TTS
5. Publishes episodes to your private podcast RSS feed

**Built with**: Cloudflare Workers, R2, KV, Email Workers, Anthropic Claude, Fish Audio

## Features

- 📧 **Email Ingestion**: Forward newsletters to dedicated email address
- 🤖 **AI Script Generation**: Claude transforms content into engaging podcast scripts
- 🎙️ **Text-to-Speech**: High-quality audio using Fish Audio
- 📻 **Private RSS Feed**: Subscribe in any podcast app
- 🔒 **Manual Review**: Optional approval workflow before publishing
- ⚙️ **Fully Configurable**: YAML-based configuration for all settings
- 💰 **Cost Effective**: ~$5-10/month on Cloudflare's platform

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (Workers Paid plan for R2)
- Domain name (optional, can use workers.dev subdomain)
- [Anthropic API key](https://console.anthropic.com/)
- [Fish Audio API key](https://fish.audio/)

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
wrangler secret put FISH_AUDIO_API_KEY
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
3. **Script Generation**: Claude creates podcast script
4. **Review** (if enabled): Approve/reject via API
5. **Audio Generation**: Fish Audio converts to MP3
6. **RSS Update**: Episode added to feed automatically

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

# Manually trigger aggregation
curl -X POST https://your-worker.workers.dev/trigger \
  -H "Authorization: Bearer your-token"

# Approve script
curl -X POST https://your-worker.workers.dev/approve/script-id \
  -H "Authorization: Bearer your-token"

# Reject script
curl -X POST https://your-worker.workers.dev/reject/script-id \
  -H "Authorization: Bearer your-token"
```

See [docs/usage/manual-workflow.md](docs/usage/manual-workflow.md) for details.

## Configuration

Edit `config.yaml` to customize:

```yaml
schedule:
  cron: "0 5 * * *"  # Daily at 5 AM UTC

filtering:
  include_topics: ["AI", "technology", "startups"]
  exclude_keywords: ["unsubscribe", "spam"]

script_generation:
  model: "claude-3-5-sonnet-20241022"
  max_tokens: 4000
  temperature: 0.7
  system_prompt: "You are a podcast host..."

tts:
  voice_id: "default"
  bitrate: 128  # kbps

podcast:
  title: "My Daily AI Digest"
  description: "AI news curated and narrated by AI"
  author: "Your Name"
  email: "your@email.com"
  category: "Technology"
  base_url: "https://pub-xxxxx.r2.dev"

storage:
  email_ttl_days: 7
  max_episodes: 100

workflow:
  auto_approve: false  # Set to true to skip manual review
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
│       ├── tts-generator.ts      # Fish Audio integration
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

Estimated monthly costs:

- **Cloudflare Workers Paid**: $5.00
- **R2 Storage** (10 GB): ~$0.15
- **KV Storage**: Free (within limits)
- **Email Routing**: Free
- **Anthropic API**: ~$2-5/month (depends on usage)
- **Fish Audio TTS**: ~$1-3/month (depends on usage)

**Total: ~$8-13/month**

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
│   Manual    │      │   Fish   │
│   Review    │─────▶│  Audio   │
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
- Verify Fish Audio API key
- Check account has credits
- Review TTS API logs

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
- TTS by [Fish Audio](https://fish.audio/)
- Inspired by newsletter aggregation tools

## Support

- [GitHub Issues](https://github.com/yourusername/briefcast/issues)
- [Documentation](docs/)
- Email: your@email.com

---

**Made with ❤️ and Claude Code**

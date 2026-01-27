# Briefcast

Transform your newsletter subscriptions into a personalized daily podcast using AI.

## Overview

Briefcast automatically:

1. Receives newsletters via Cloudflare Email Workers → stores to KV
2. Processes content daily via Docker container
3. Generates podcast scripts using Claude AI
4. Converts scripts to audio using OpenAI TTS (gpt-4o-mini-tts)
5. Normalizes and assembles audio with FFmpeg
6. Publishes episodes to your private podcast RSS feed on R2

## Architecture

```
┌─────────────┐
│ Newsletters │
│   (Email)   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare                                                 │
│  ┌─────────────┐      ┌──────────────┐                      │
│  │   Email     │─────▶│  KV Store    │                      │
│  │   Worker    │      │  (emails)    │                      │
│  └─────────────┘      └──────┬───────┘                      │
│                              │                              │
│                       ┌──────┴───────┐                      │
│                       │  R2 Bucket   │                      │
│                       │  - config    │                      │
│                       │  - episodes  │                      │
│                       │  - RSS feed  │                      │
│                       │  - music     │                      │
│                       └──────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Docker    │      │   Claude    │      │   OpenAI    │
│  Processor  │─────▶│    API      │      │   TTS API   │
│  (daily)    │      │  (scripts)  │      │  (audio)    │
└─────────────┘      └─────────────┘      └─────────────┘
       │
       ▼
┌─────────────┐
│   Podcast   │
│    Apps     │
└─────────────┘
```

## Project Structure

```
briefcast/
├── shared/                 # Shared types, schemas, utilities
│   ├── schemas/            # Zod validation schemas
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Error handling, retry logic
├── processor/              # Docker-based audio processor
│   ├── src/
│   │   ├── index.ts        # Main orchestrator
│   │   ├── audio/          # FFmpeg, normalization, assembly
│   │   ├── config/         # Config loading from R2
│   │   ├── content/        # Newsletter content extraction
│   │   ├── email/          # KV email reader
│   │   ├── rss/            # RSS feed generation
│   │   ├── script/         # Claude script generation
│   │   ├── storage/        # R2 and KV clients
│   │   ├── tts/            # OpenAI TTS generation
│   │   └── utils/          # Logging, date helpers
│   ├── Dockerfile
│   └── .env.example
├── workers/
│   └── email-worker/       # Cloudflare Email Worker
└── config.yaml.example     # Example configuration
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm
- [Docker](https://www.docker.com/) for running the processor
- [Cloudflare account](https://dash.cloudflare.com/sign-up) with:
  - Workers Paid plan (for R2)
  - Email Routing enabled
  - KV namespace
  - R2 bucket
- [Anthropic API key](https://console.anthropic.com/)
- [OpenAI API key](https://platform.openai.com/api-keys)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/briefcast.git
cd briefcast
npm install
```

### 2. Build the Project

```bash
# Build all packages (shared + processor)
npm run build

# Or build individually
npm run build --workspace=shared
npm run build --workspace=processor
```

### 3. Build Docker Image

```bash
# From the repository root
docker build -f processor/Dockerfile -t briefcast-processor .
```

### 4. Configure Environment

Create `processor/.env` from the example:

```bash
cp processor/.env.example processor/.env
```

Required environment variables:

```env
# Anthropic API (script generation)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI API (text-to-speech)
OPENAI_API_KEY=sk-...

# Cloudflare R2 (storage)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Cloudflare KV (email storage)
CF_KV_NAMESPACE_ID=your-kv-namespace-id
CF_API_TOKEN=your-cloudflare-api-token
```

#### Finding Cloudflare Credentials

- **R2_ACCOUNT_ID**: Cloudflare Dashboard → Account Home → look in URL or sidebar
- **R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY**: R2 → Manage R2 API Tokens → Create API token
- **CF_KV_NAMESPACE_ID**: Workers & Pages → KV → your namespace → copy ID
- **CF_API_TOKEN**: My Profile → API Tokens → Create Token (needs Workers KV read/write)

### 5. Upload Configuration

Create your `config.yaml` (see Configuration section) and upload to R2:

```bash
wrangler r2 object put your-bucket/config.yaml --file=config.yaml
```

### 6. Upload Music Assets (Optional)

```bash
wrangler r2 object put your-bucket/assets/music/intro.mp3 --file=path/to/intro.mp3
wrangler r2 object put your-bucket/assets/music/outro.mp3 --file=path/to/outro.mp3
wrangler r2 object put your-bucket/assets/music/transition.mp3 --file=path/to/transition.mp3
```

## Local Testing

### Test Run (DRY_RUN mode)

DRY_RUN mode processes emails and generates audio but:
- Does NOT update the RSS feed
- Does NOT delete emails from KV (so production can still process them)

```bash
docker run --rm \
    --env-file processor/.env \
    -e DRY_RUN=true \
    -e LOG_LEVEL=debug \
    briefcast-processor
```

### Debug with Volume Mount

Mount temp directory to inspect intermediate files:

```bash
docker run --rm \
    --env-file processor/.env \
    -e DRY_RUN=true \
    -e LOG_LEVEL=debug \
    -v $(pwd)/processor/tmp:/tmp/briefcast \
    briefcast-processor
```

This lets you inspect:
- Generated TTS audio segments
- Normalized audio files
- Final assembled episode

### Production Run

Without DRY_RUN, the processor will:
- Upload the episode to R2
- Update the RSS feed
- Delete processed emails from KV

```bash
docker run --rm \
    --env-file processor/.env \
    briefcast-processor
```

## Configuration

Upload `config.yaml` to your R2 bucket root. Example:

```yaml
# Schedule (for reference - actual scheduling is external)
schedule:
  cron: "0 4 * * *"  # 04:00 UTC daily

# Content filtering
filtering:
  include_topics:
    - machine learning
    - artificial intelligence
    - AI engineering
  exclude_topics:
    - cryptocurrency
  exclude_keywords:
    - sponsored
    - advertisement

# Script generation (Claude API)
script_generation:
  model: "claude-sonnet-4-5-20250929"
  max_tokens: 16000
  temperature: 1.0
  system_prompt: |
    You are a podcast host named Echo creating the AI Daily Newsletter Briefing.
    Your tone is professional yet conversational.

    Ground rules:
    - Start with today's date
    - Attribute each topic to its source newsletter
    - Handle at least 5 topics if content allows
  user_prompt_template: |
    Create a {target_duration_minutes}-minute podcast episode.

    Today's date: {date}

    Newsletters:
    {newsletters}

# Text-to-speech (OpenAI)
tts:
  model: "gpt-4o-mini-tts"
  voice: "ballad"  # alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse
  format: "mp3"
  speed: 1.00
  style_prompt: "Professional podcast host. Clear, engaging, natural pacing."

# Podcast metadata
podcast:
  title: "Daily AI Newsletter Briefing"
  description: "AI-generated daily podcast from curated tech newsletters"
  author: "Your Name"
  email: "your@email.com"
  category: "Technology"
  subcategory: "Tech News"
  language: "en"
  image_url: "https://your-bucket.r2.dev/cover.jpg"
  site_url: "https://your-bucket.r2.dev"

# Storage settings
storage:
  max_episodes: 21
  email_ttl_days: 7
  save_scripts: true

# Email filtering
email:
  forward_to: "your@email.com"
  allowed_senders:
    - "*@substack.com"
    - "*@beehiiv.com"
    - "newsletter@example.com"
```

## Production Deployment

### Scheduling Options

The Docker processor needs to be triggered daily. Options:

1. **GitHub Actions** (recommended for simplicity)
2. **Cloudflare Workers Cron** → trigger Docker on a server
3. **AWS ECS Scheduled Task**
4. **Local cron job** on a server

### GitHub Actions Example

Create `.github/workflows/podcast.yml`:

```yaml
name: Generate Podcast

on:
  schedule:
    - cron: '0 4 * * *'  # 04:00 UTC daily
  workflow_dispatch:  # Manual trigger

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build processor
        run: docker build -f processor/Dockerfile -t briefcast-processor .

      - name: Run processor
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
          R2_PUBLIC_URL: ${{ secrets.R2_PUBLIC_URL }}
          CF_KV_NAMESPACE_ID: ${{ secrets.CF_KV_NAMESPACE_ID }}
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
        run: |
          docker run --rm \
            -e ANTHROPIC_API_KEY \
            -e OPENAI_API_KEY \
            -e R2_ACCOUNT_ID \
            -e R2_ACCESS_KEY_ID \
            -e R2_SECRET_ACCESS_KEY \
            -e R2_BUCKET_NAME \
            -e R2_PUBLIC_URL \
            -e CF_KV_NAMESPACE_ID \
            -e CF_API_TOKEN \
            briefcast-processor
```

## Development

### Building

```bash
# Install dependencies
npm install

# Build shared package (must be first)
npm run build --workspace=shared

# Build processor
npm run build --workspace=processor

# Build Docker image
docker build -f processor/Dockerfile -t briefcast-processor .
```

### After Code Changes

```bash
# Rebuild TypeScript
npm run build --workspace=shared && npm run build --workspace=processor

# Rebuild Docker image (use --no-cache if needed)
docker build -f processor/Dockerfile -t briefcast-processor .
```

### Running Tests

```bash
# Run all tests
npm test

# Run processor tests
npm test --workspace=processor

# Run shared tests
npm test --workspace=shared
```

## Troubleshooting

### No emails found

- Check KV namespace ID is correct
- Verify emails exist: `wrangler kv key list --namespace-id=YOUR_ID --prefix=email:`
- Ensure CF_API_TOKEN has KV read permissions

### Script generation fails

- Check ANTHROPIC_API_KEY is valid
- Verify account has credits
- Check LOG_LEVEL=debug for detailed errors

### TTS generation fails (400 Bad Request)

- Ensure `tts.model` in config matches voice capability
- `gpt-4o-mini-tts` supports: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse
- `tts-1` / `tts-1-hd` only support: alloy, echo, fable, onyx, nova, shimmer

### Audio stitching issues

- Ensure FFmpeg is installed in Docker (it is by default)
- Check temp directory has write permissions
- Review logs for FFmpeg errors

### RSS feed not updating

- Verify NOT running in DRY_RUN mode
- Check R2 bucket permissions
- Confirm R2_PUBLIC_URL is correct

## Cost Breakdown

Estimated monthly costs (daily podcast, ~15 min episodes):

| Service | Cost |
|---------|------|
| Cloudflare Workers Paid | $5.00 |
| R2 Storage (~5 GB) | ~$0.08 |
| KV Storage | Free (within limits) |
| Email Routing | Free |
| Anthropic Claude API | ~$2-5/month |
| OpenAI TTS (gpt-4o-mini-tts) | ~$3-5/month |
| **Total** | **~$10-15/month** |

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with Claude Code**

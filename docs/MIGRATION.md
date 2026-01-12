# Migration Guide

This guide helps you migrate from the monolithic Cloudflare Worker architecture to the new hybrid architecture.

## Overview

### Old Architecture (v1)
- Single Cloudflare Worker handling everything
- Limited by 10ms CPU time constraint
- Audio processing done in-worker (limited quality)

### New Architecture (v2)
- **Email Worker**: Lightweight Cloudflare Worker for email ingestion
- **Processor**: Docker container for heavy audio processing
- Multi-level audio normalization with FFmpeg
- Structured episodes with intro/outro/transitions

## What's New

### Production Quality Improvements
- Multi-level volume normalization (EBU R128)
- Musical transitions between topics
- Structured episodes with intro, topics, and synthesis sections

### Content Quality Improvements
- Structured script output (JSON format)
- Better prompting for AI engineers/tinkerers audience
- Dynamic episode duration (3-45 minutes based on content)

## Migration Steps

### Step 1: Backup Your Data

```bash
# List your current R2 bucket contents
wrangler r2 object list your-bucket-name

# Download important files
wrangler r2 object get your-bucket-name/config.yaml --file=config.backup.yaml
wrangler r2 object get your-bucket-name/feed.xml --file=feed.backup.xml
```

### Step 2: Update Configuration

The config.yaml format has changed. Add the new `audio` section:

```yaml
# Old config (keep these)
podcast:
  title: "Your Podcast"
  # ... existing settings

tts:
  provider: "openai"
  model: "gpt-4o-mini-tts"
  voice: "nova"

# NEW: Add audio section
audio:
  normalization:
    enabled: true
    target_lufs: -16
    music_target_lufs: -20
    max_peak_db: -1
  music:
    intro_path: "assets/music/intro.mp3"
    transition_path: "assets/music/transition.mp3"
    outro_path: "assets/music/outro.mp3"

# CHANGED: Remove word count limits from script_generation
script_generation:
  model: "claude-sonnet-4-20250514"
  max_tokens: 8000
  temperature: 0.7
  system_prompt: "..."
  user_prompt_template: "..."
  # REMOVE: min_words, max_words, target_duration_minutes
```

### Step 3: Upload Music Assets

Upload your intro, transition, and outro music files to R2:

```bash
# Create assets/music folder in R2
wrangler r2 object put your-bucket/assets/music/intro.mp3 --file=your-intro.mp3
wrangler r2 object put your-bucket/assets/music/transition.mp3 --file=your-transition.mp3
wrangler r2 object put your-bucket/assets/music/outro.mp3 --file=your-outro.mp3
```

### Step 4: Deploy Email Worker

```bash
# Navigate to email worker
cd workers/email-worker

# Copy and configure wrangler.toml
cp wrangler.example.toml wrangler.toml
# Edit wrangler.toml with your bucket name

# Deploy
wrangler deploy

# Set allowed senders
wrangler secret put ALLOWED_SENDERS
# Enter: newsletter@example.com,@substack.com,...
```

### Step 5: Set Up Processor

```bash
# Navigate to processor
cd processor

# Copy environment file
cp .env.example .env
# Edit .env with your API keys and R2 credentials

# Build Docker image
docker build -t briefcast-processor .

# Test locally
docker-compose up
```

### Step 6: Configure Cron Job

Set up a cron job to run the processor on your schedule:

```bash
# Edit crontab
crontab -e

# Add line to run daily at 8 AM
0 8 * * * docker-compose -f /path/to/processor/docker-compose.yml run --rm processor >> /var/log/briefcast.log 2>&1
```

### Step 7: Update Email Routing

In Cloudflare dashboard:
1. Go to Email > Email Routing
2. Update the destination to your new email worker

### Step 8: Decommission Old Worker

Once you've verified the new system works:

```bash
# Delete old worker
wrangler delete briefcast  # or whatever your old worker was called
```

## Configuration Comparison

| Setting | Old Location | New Location |
|---------|--------------|--------------|
| Podcast info | `podcast.*` | `podcast.*` (unchanged) |
| TTS settings | `tts.*` | `tts.*` (unchanged) |
| Script generation | `script_generation.*` | `script_generation.*` (remove duration limits) |
| Word limits | `script_generation.min_words` | REMOVED |
| Audio normalization | N/A | `audio.normalization.*` |
| Music paths | N/A | `audio.music.*` |

## Environment Variables

### Email Worker (Cloudflare)

| Variable | Description |
|----------|-------------|
| `ALLOWED_SENDERS` | Comma-separated list of allowed email addresses/domains |

### Processor (Docker)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | Public URL for R2 bucket |

## Rollback

If you need to rollback to the old architecture:

1. Keep your old worker code backed up
2. Redeploy the old worker: `wrangler deploy` (from old codebase)
3. Stop the processor cron job
4. Update email routing back to old worker

## Troubleshooting

### "No pending emails to process"
- Check email routing in Cloudflare dashboard
- Verify ALLOWED_SENDERS includes your newsletter addresses
- Check R2 for `pending-emails/` objects

### "FFmpeg not found"
- Ensure Docker image includes FFmpeg
- Or install FFmpeg on host: `apt install ffmpeg`

### Audio quality issues
- Check `audio.normalization.target_lufs` is set correctly (-16 is standard)
- Verify music files are high quality (44.1kHz, 16-bit minimum)

### Missing music transitions
- Ensure music files exist in R2 at paths specified in config
- Check file format (MP3 recommended)

## Need Help?

- Check the [Architecture Guide](ARCHITECTURE.md) for system overview
- Review [DEPLOYMENT.md](../DEPLOYMENT.md) for setup details
- Open an issue on GitHub for bugs or questions

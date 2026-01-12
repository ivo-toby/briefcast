# Briefcast Architecture

This document describes the hybrid architecture of Briefcast.

## Overview

Briefcast uses a hybrid architecture with two main components:

1. **Email Worker** (Cloudflare Workers) - Lightweight email ingestion
2. **Processor** (Docker) - Heavy audio processing with FFmpeg

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CLOUDFLARE (Free Tier)                               │
├──────────────────────────────────────────────────────────────────────────────┤
│   ┌──────────────────┐         ┌──────────────────────────────────────────┐  │
│   │   Email Worker   │────────▶│                   R2                     │  │
│   │   (< 10ms CPU)   │         │  pending-emails/   ← raw .eml files      │  │
│   │                  │         │  config.yaml       ← configuration       │  │
│   │  • Receive email │         │  episodes/         ← final .mp3 files    │  │
│   │  • Check sender  │         │  assets/music/     ← intro/outro/trans   │  │
│   │  • Store to R2   │         │  feed.xml          ← RSS feed            │  │
│   └──────────────────┘         └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ S3-compatible API
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     DOCKER CONTAINER (User Infrastructure)                    │
├──────────────────────────────────────────────────────────────────────────────┤
│   ┌────────────────────────────────────────────────────────────────────────┐ │
│   │                         PODCAST PROCESSOR                               │ │
│   │                                                                         │ │
│   │  1. Read pending emails from R2                                         │ │
│   │  2. Parse .eml and extract content                                      │ │
│   │  3. Generate structured script (Claude API) → JSON                      │ │
│   │  4. Generate TTS per section (OpenAI API)                               │ │
│   │  5. Normalize audio per chunk (FFmpeg loudnorm)                         │ │
│   │  6. Normalize audio per section (FFmpeg loudnorm)                       │ │
│   │  7. Assemble with music transitions (FFmpeg filter_complex)             │ │
│   │  8. Final episode normalization (FFmpeg loudnorm)                       │ │
│   │  9. Upload episode to R2                                                │ │
│   │  10. Update RSS feed in R2                                              │ │
│   │  11. Cleanup processed emails                                           │ │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│   Triggered by: cron (host) or manual invocation                             │
│   Runtime: Node.js 20 + FFmpeg 6.0+                                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Why Hybrid?

Cloudflare Workers have a 10ms CPU time limit (free tier), making heavy audio processing impossible. The hybrid approach:

| Component | Platform | Purpose | Constraints |
|-----------|----------|---------|-------------|
| Email Worker | Cloudflare | Receive & store emails | < 10ms CPU |
| Processor | Docker | Audio processing | Unlimited CPU |

## Episode Structure

Episodes are now structured with distinct sections:

```
┌─────────────────────────────────────────────────────────────────┐
│                        EPISODE STRUCTURE                         │
├─────────────────────────────────────────────────────────────────┤
│  ♪ Intro Music                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ INTRO SECTION                                                │ │
│  │ "Welcome to Briefcast. Today we're covering..."              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ♪ Transition Music                                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ TOPIC 1: [Title]                                             │ │
│  │ Deep dive into first topic with sources...                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ♪ Transition Music                                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ TOPIC 2: [Title]                                             │ │
│  │ Deep dive into second topic with sources...                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ♪ Transition Music                                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ SYNTHESIS SECTION                                            │ │
│  │ "Let's connect the dots. Today we covered..."                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ♪ Outro Music                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Audio Processing Pipeline

The processor uses multi-level audio normalization for consistent volume:

```
Raw TTS Chunks (per section)
        │
        ▼
┌─────────────────────────────────┐
│ Level 1: Chunk Normalization    │  Each TTS chunk → -16 LUFS
│ (within section)                │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Level 2: Section Normalization  │  Each section → -16 LUFS
│ (intro, topic, synthesis)       │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Music Integration               │  Add transitions, ducking
│ (crossfades, volume matching)   │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│ Level 3: Episode Normalization  │  Final episode → -16 LUFS
│ (full episode)                  │  True Peak: -1 dB
└─────────────────────────────────┘
        │
        ▼
   Final MP3 Episode
```

## Project Structure

```
briefcast/
├── shared/                    # Shared types and utilities
│   ├── types/                 # TypeScript interfaces
│   ├── schemas/               # Zod validation schemas
│   └── utils/                 # Error classes, retry logic
├── processor/                 # Docker processor
│   ├── src/
│   │   ├── audio/             # FFmpeg wrapper, normalizer, assembler
│   │   ├── config/            # Config loader
│   │   ├── content/           # Newsletter content extractor
│   │   ├── email/             # Email reader/parser
│   │   ├── rss/               # RSS feed generator
│   │   ├── script/            # Claude script generator
│   │   ├── storage/           # R2 S3 client
│   │   ├── tts/               # OpenAI TTS client
│   │   └── utils/             # Logger, date utils
│   ├── Dockerfile
│   └── docker-compose.yml
├── workers/
│   └── email-worker/          # Cloudflare email worker
│       └── src/index.ts
└── scripts/                   # Deployment scripts
```

## Configuration

Configuration is stored in R2 as `config.yaml`:

```yaml
podcast:
  title: "My Podcast"
  description: "Daily tech briefing"
  author: "Your Name"
  email: "you@example.com"
  category: "Technology"
  language: "en"

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

tts:
  provider: "openai"
  model: "gpt-4o-mini-tts"
  voice: "nova"
  style_prompt: "Speak as a knowledgeable tech podcast host..."

script_generation:
  model: "claude-sonnet-4-20250514"
  max_tokens: 8000
  temperature: 0.7
```

## Running

### Email Worker

```bash
# Deploy to Cloudflare
cd workers/email-worker
wrangler deploy
```

### Processor

```bash
# Run with Docker
cd processor
docker-compose up

# Or run directly
npm run start
```

### Cron Job

Set up a cron job on your server to run the processor:

```bash
# Run daily at 8 AM
0 8 * * * docker-compose -f /path/to/processor/docker-compose.yml run --rm processor
```

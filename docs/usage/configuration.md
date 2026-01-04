# Configuration Guide

## config.yaml Structure

Upload this file to your R2 bucket as `config.yaml`.

### Schedule

```yaml
schedule:
  cron: "0 5 * * *"  # Daily at 5 AM UTC
```

### Filtering

```yaml
filtering:
  include_topics:
    - "AI"
    - "machine learning"
  exclude_topics:
    - "crypto"
  exclude_keywords:
    - "sponsored"
    - "advertisement"
```

### Script Generation

```yaml
script_generation:
  model: "claude-sonnet-4-5-20250929"
  max_tokens: 16000
  temperature: 1.0
  min_words: 800
  max_words: 1500
  target_duration_minutes: 10
```

### TTS

```yaml
tts:
  voice_id: "your-fish-audio-voice-id"
  bitrate: 64  # 64, 128, or 192
  format: "mp3"
  speed: 1.0
```

### Podcast Metadata

```yaml
podcast:
  title: "My Daily Briefing"
  description: "AI-generated podcast"
  author: "Your Name"
  email: "podcast@domain.com"
  category: "Technology"
  image_url: "https://domain.com/cover.jpg"
```

See `config.yaml.example` for full schema.

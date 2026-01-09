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
  model: "gpt-4o-mini-tts"  # GPT-4o mini TTS with prompt steering
  voice: "alloy"  # alloy, coral, ash, sage, nova, shimmer
  format: "mp3"   # mp3, opus, aac, flac, pcm, wav
  speed: 1.0      # 0.25 to 4.0
  bitrate: 128    # For metadata only
  style_prompt: "You are a professional podcast host. Speak clearly and engagingly."
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

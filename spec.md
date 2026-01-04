# Newsletter-to-Podcast Pipeline Specification

## Project Overview

**Goal:** Automatically convert daily AI newsletters into a single-host podcast, available via personal RSS feed in standard podcast apps.

**Key Requirements:**

- Serverless architecture (Cloudflare Workers + R2)
- Single host TTS using Fish Audio with custom voice
- English language output
- Shownotes with source links per episode
- Personal RSS feed compatible with Overcast, Pocket Casts, etc.
- Cost target: <€15/month

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Email Inbox    │────▶│  Cloudflare      │────▶│  Claude API     │
│  (newsletters)  │     │  Email Worker    │     │  (summarization)│
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Podcast App    │◀────│  RSS Feed        │◀────│  Fish Audio     │
│  (Overcast etc) │     │  (R2 + shownotes)│     │  (TTS API)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Components

### 1. Email Ingestion (Cloudflare Email Workers)

**Purpose:** Receive newsletters on a dedicated email address and store for batch processing.

**API Reference:** [Cloudflare Email Workers Runtime API](https://developers.cloudflare.com/email-routing/email-workers/runtime-api/)

**Implementation:**

```typescript
// src/email-worker.ts
import PostalMime from "postal-mime";

interface EmailMessage {
  from: string;
  to: string;
  raw: ReadableStream;
  rawSize: number;
}

export interface Env {
  NEWSLETTER_KV: KVNamespace;
}

async function streamToArrayBuffer(
  stream: ReadableStream,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const rawEmail = await streamToArrayBuffer(message.raw);
    const parser = new PostalMime();
    const parsed = await parser.parse(rawEmail);

    const newsletter = {
      id: crypto.randomUUID(),
      from: message.from,
      subject: parsed.subject || "No Subject",
      html: parsed.html || "",
      text: parsed.text || "",
      receivedAt: new Date().toISOString(),
    };

    // Store with date prefix for easy retrieval
    const dateKey = new Date().toISOString().split("T")[0];
    const key = `${dateKey}:${newsletter.id}`;

    await env.NEWSLETTER_KV.put(key, JSON.stringify(newsletter), {
      expirationTtl: 60 * 60 * 24 * 7, // 7 days
    });
  },
};
```

**Email Address:** `newsletters@yourdomain.com` (via Cloudflare Email Routing)

**Dependencies:**

- `postal-mime` - Email parsing (works in Workers)

### 2. Content Extraction

**Purpose:** Convert HTML newsletters to clean text, extract source links, strip ads/tracking.

**Approach:** Use Cloudflare's built-in `HTMLRewriter` for streaming HTML processing (no npm dependency needed).

**Implementation:**

```typescript
// src/lib/content-extractor.ts

interface ExtractedContent {
  text: string;
  links: Array<{ title: string; url: string }>;
}

export async function extractContent(html: string): Promise<ExtractedContent> {
  const links: Array<{ title: string; url: string }> = [];
  const textParts: string[] = [];

  // Patterns to skip (ads, tracking, unsubscribe)
  const skipPatterns = [
    /sponsor/i,
    /advertisement/i,
    /promo/i,
    /unsubscribe/i,
    /tracking/i,
    /click here to/i,
    /powered by/i,
    /view in browser/i,
  ];

  // Simple HTML to text conversion (HTMLRewriter requires Response)
  // For email content, use regex-based extraction
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();

  // Extract links
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const title = match[2].trim();

    // Filter out tracking/ad links
    if (
      url.startsWith("http") &&
      !url.includes("click.") &&
      !url.includes("track.") &&
      !url.includes("unsubscribe") &&
      title.length > 3 &&
      !skipPatterns.some((p) => p.test(title))
    ) {
      links.push({ title, url });
    }
  }

  // Filter text
  const cleanText = textContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 20)
    .filter((line) => !skipPatterns.some((p) => p.test(line)))
    .join("\n\n");

  // Deduplicate links by URL
  const uniqueLinks = [...new Map(links.map((l) => [l.url, l])).values()];

  return {
    text: cleanText,
    links: uniqueLinks.slice(0, 20), // Max 20 links for shownotes
  };
}
```

### 3. Daily Aggregator (Cloudflare Cron Trigger)

**Purpose:** Collect all emails from the day, deduplicate topics, generate podcast script with shownotes.

**Schedule:** Daily at 06:00 CET (05:00 UTC)

**Implementation:**

```typescript
// src/scheduled-worker.ts
import { generatePodcastScript } from "./lib/script-generator";
import { generateAudio } from "./lib/tts-generator";
import { uploadToR2, updateRssFeed } from "./lib/storage";
import { extractContent } from "./lib/content-extractor";

export interface Env {
  NEWSLETTER_KV: KVNamespace;
  PODCAST_BUCKET: R2Bucket;
  ANTHROPIC_API_KEY: string;
  FISH_AUDIO_API_KEY: string;
  R2_PUBLIC_URL: string;
}

interface Newsletter {
  id: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  cleanText?: string;
  links?: Array<{ title: string; url: string }>;
  receivedAt: string;
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Fetch all newsletters from today
    const list = await env.NEWSLETTER_KV.list({ prefix: today });

    if (list.keys.length === 0) {
      console.log("No newsletters today, skipping");
      return;
    }

    // Load and extract content from all newsletters
    const newsletters: Newsletter[] = [];

    for (const key of list.keys) {
      const data = await env.NEWSLETTER_KV.get(key.name);
      if (!data) continue;

      const newsletter: Newsletter = JSON.parse(data);
      const extracted = await extractContent(
        newsletter.html || newsletter.text,
      );

      newsletters.push({
        ...newsletter,
        cleanText: extracted.text,
        links: extracted.links,
      });
    }

    if (newsletters.length === 0) {
      console.log("No valid newsletters found");
      return;
    }

    // Generate podcast script and shownotes
    const result = await generatePodcastScript(newsletters, env);

    // Generate audio via Fish Audio
    const audioBuffer = await generateAudio(result.script, env);

    // Upload audio to R2
    const audioUrl = await uploadToR2(audioBuffer, today, env);

    // Update RSS feed with shownotes
    await updateRssFeed(
      {
        audioUrl,
        title: result.title,
        description: result.description,
        shownotes: result.shownotes,
        date: today,
      },
      env,
    );

    console.log(`Episode generated: ${result.title}`);
  },
};
```

### 4. Script Generation (Claude API)

**Purpose:** Generate a natural-sounding podcast script (5-10 minutes) with structured shownotes.

**API Reference:** [Anthropic Messages API](https://docs.claude.com/en/api/messages)

- Endpoint: `POST https://api.anthropic.com/v1/messages`
- Model: `claude-sonnet-4-5-20250929` (or `claude-sonnet-4-5` alias)
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`

**Implementation:**

```typescript
// src/lib/script-generator.ts

interface Newsletter {
  from: string;
  subject: string;
  cleanText?: string;
  links?: Array<{ title: string; url: string }>;
}

interface ScriptResult {
  title: string;
  description: string;
  script: string;
  shownotes: string;
}

const SYSTEM_PROMPT = `You are a podcast host presenting an AI news digest. Your style:
- Informative but accessible, explaining complex topics clearly
- Natural conversational flow with smooth transitions between topics
- Occasionally share brief insights or implications
- Duration target: 5-10 minutes (1000-2000 words)
- Language: English

Output format: Plain text script, no markdown. Write as if speaking aloud.
No intro/outro music cues - start directly with content.
Do NOT include "[pause]" or stage directions.`;

const USER_PROMPT = `Create a podcast episode from today's AI newsletters.
Deduplicate overlapping topics and present them as one coherent narrative.
Start directly with the first topic. End with a brief forward-looking thought.

After the script, provide a SHOWNOTES section in this exact format:
---SHOWNOTES---
## Topics Covered
- Topic 1 name
- Topic 2 name
...

## Sources & Links
- [Link title](URL)
- [Link title](URL)
...
---END SHOWNOTES---

Newsletters:
{newsletters}`;

export async function generatePodcastScript(
  newsletters: Newsletter[],
  env: { ANTHROPIC_API_KEY: string },
): Promise<ScriptResult> {
  const newsletterContent = newsletters
    .map((n) => {
      const linkList =
        n.links?.map((l) => `- ${l.title}: ${l.url}`).join("\n") || "";
      return `## ${n.subject} (from ${n.from})\n${n.cleanText || ""}\n\nLinks:\n${linkList}`;
    })
    .join("\n\n---\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: USER_PROMPT.replace("{newsletters}", newsletterContent),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  interface ClaudeResponse {
    content: Array<{ type: string; text: string }>;
  }

  const data: ClaudeResponse = await response.json();
  const fullText = data.content[0].text;

  // Parse script and shownotes
  const parts = fullText.split("---SHOWNOTES---");
  const script = parts[0].trim();
  const shownotesRaw = parts[1]?.split("---END SHOWNOTES---")[0] || "";

  // Convert shownotes markdown to HTML
  const shownotes = convertShownotesToHtml(shownotesRaw.trim());

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    title: `AI News Digest - ${today}`,
    description: `Today's AI news covering ${newsletters.length} newsletter${newsletters.length > 1 ? "s" : ""}.`,
    script,
    shownotes,
  };
}

function convertShownotesToHtml(markdown: string): string {
  return markdown
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^- \[(.+?)\]\((.+?)\)$/gm, '<li><a href="$2">$1</a></li>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/\n+/g, "\n");
}
```

### 5. TTS Generation (Fish Audio API)

**Purpose:** Convert script to natural-sounding audio using your custom voice model.

**API Reference:** [Fish Audio TTS API](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)

- Endpoint: `POST https://api.fish.audio/v1/tts`
- Model header: `model: s1` (recommended, OpenAudio S1)
- Voice: `reference_id` with your model ID

**Your Voice Model ID:** `953f72be2fbf451693e98e4d094a9e4e`

**Implementation:**

```typescript
// src/lib/tts-generator.ts

export async function generateAudio(
  script: string,
  env: { FISH_AUDIO_API_KEY: string },
): Promise<ArrayBuffer> {
  const response = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FISH_AUDIO_API_KEY}`,
      "Content-Type": "application/json",
      model: "s1", // OpenAudio S1 - latest model
    },
    body: JSON.stringify({
      text: script,
      reference_id: "953f72be2fbf451693e98e4d094a9e4e", // Your custom voice
      format: "mp3",
      mp3_bitrate: 128,
      latency: "normal", // Best quality
      chunk_length: 300,
      normalize: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Fish Audio API error: ${response.status} - ${error}`);
  }

  return response.arrayBuffer();
}
```

**Fish Audio API Parameters:**
| Parameter | Value | Notes |
|-----------|-------|-------|
| `model` (header) | `s1` | OpenAudio S1 - latest, best quality |
| `reference_id` | `953f72be...` | Your pre-uploaded voice clone |
| `format` | `mp3` | Also supports `wav`, `opus` |
| `mp3_bitrate` | `128` | Options: 64, 128, 192 kbps |
| `latency` | `normal` | Best quality; `balanced` or `low` for faster |
| `chunk_length` | `300` | Range: 100-300 |
| `normalize` | `true` | Audio normalization |

### 6. Storage (Cloudflare R2)

**Purpose:** Host audio files and RSS feed.

**Structure:**

```
bucket/
├── episodes/
│   ├── 2026-01-04.mp3
│   ├── 2026-01-03.mp3
│   └── ...
├── feed.xml
├── metadata.json
└── cover.jpg
```

**Implementation:**

```typescript
// src/lib/storage.ts

interface Env {
  PODCAST_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

export async function uploadToR2(
  audio: ArrayBuffer,
  date: string,
  env: Env,
): Promise<string> {
  const key = `episodes/${date}.mp3`;

  await env.PODCAST_BUCKET.put(key, audio, {
    httpMetadata: {
      contentType: "audio/mpeg",
      cacheControl: "public, max-age=31536000",
    },
  });

  return `${env.R2_PUBLIC_URL}/${key}`;
}
```

### 7. RSS Feed Generator

**Purpose:** Generate and update podcast RSS feed with shownotes.

**Library:** `podcast` npm package

- [npm: podcast](https://www.npmjs.com/package/podcast)
- Full iTunes/podcast namespace support

**Implementation:**

```typescript
// src/lib/rss-generator.ts
import { Podcast } from "podcast";

interface EpisodeInput {
  audioUrl: string;
  title: string;
  description: string;
  shownotes: string;
  date: string;
}

interface Episode extends EpisodeInput {
  guid: string;
  duration: string;
}

interface PodcastMetadata {
  episodes: Episode[];
  lastUpdated: string;
}

interface Env {
  PODCAST_BUCKET: R2Bucket;
  R2_PUBLIC_URL: string;
}

export async function updateRssFeed(
  episode: EpisodeInput,
  env: Env,
): Promise<void> {
  // Fetch existing metadata
  const metadataObj = await env.PODCAST_BUCKET.get("metadata.json");
  let metadata: PodcastMetadata;

  if (metadataObj) {
    metadata = await metadataObj.json();
  } else {
    metadata = { episodes: [], lastUpdated: "" };
  }

  // Add new episode
  const newEpisode: Episode = {
    ...episode,
    guid: `episode-${episode.date}`,
    duration: "00:08:00", // Estimate
  };

  metadata.episodes.unshift(newEpisode);
  metadata.episodes = metadata.episodes.slice(0, 30); // Keep last 30
  metadata.lastUpdated = new Date().toISOString();

  // Generate RSS feed
  const feed = new Podcast({
    title: "AI News Digest",
    description: "Daily summary of AI newsletters, automatically generated.",
    feedUrl: `${env.R2_PUBLIC_URL}/feed.xml`,
    siteUrl: env.R2_PUBLIC_URL,
    imageUrl: `${env.R2_PUBLIC_URL}/cover.jpg`,
    author: "AI News Digest",
    language: "en",
    ttl: 60,
    itunesAuthor: "AI News Digest",
    itunesCategory: [{ text: "Technology", subcats: [{ text: "Tech News" }] }],
    itunesExplicit: false,
    itunesType: "episodic",
  });

  for (const ep of metadata.episodes) {
    feed.addItem({
      title: ep.title,
      description: `${ep.description}\n\n${ep.shownotes}`,
      url: ep.audioUrl,
      guid: ep.guid,
      date: new Date(ep.date),
      enclosure: {
        url: ep.audioUrl,
        type: "audio/mpeg",
      },
      itunesDuration: ep.duration,
      itunesSummary: ep.description,
    });
  }

  // Save metadata and feed
  await env.PODCAST_BUCKET.put(
    "metadata.json",
    JSON.stringify(metadata, null, 2),
  );

  await env.PODCAST_BUCKET.put("feed.xml", feed.buildXml(), {
    httpMetadata: {
      contentType: "application/rss+xml; charset=utf-8",
    },
  });
}
```

## Project Structure

```
newsletter-podcast/
├── src/
│   ├── index.ts             # Main entry, exports all handlers
│   ├── email-worker.ts      # Email ingestion handler
│   ├── scheduled-worker.ts  # Daily cron job handler
│   └── lib/
│       ├── content-extractor.ts
│       ├── script-generator.ts
│       ├── tts-generator.ts
│       ├── storage.ts
│       └── rss-generator.ts
├── wrangler.toml
├── package.json
├── tsconfig.json
└── README.md
```

## Main Entry Point

```typescript
// src/index.ts
export { default as emailHandler } from "./email-worker";
export { default as scheduledHandler } from "./scheduled-worker";

import emailHandler from "./email-worker";
import scheduledHandler from "./scheduled-worker";

export default {
  email: emailHandler.email,
  scheduled: scheduledHandler.scheduled,
};
```

## Wrangler Configuration

```toml
# wrangler.toml
name = "newsletter-podcast"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# Cron trigger - daily at 05:00 UTC (06:00 CET)
[triggers]
crons = ["0 5 * * *"]

# R2 bucket for audio and feed
[[r2_buckets]]
binding = "PODCAST_BUCKET"
bucket_name = "newsletter-podcast"

# KV for temporary email storage
[[kv_namespaces]]
binding = "NEWSLETTER_KV"
id = "your-kv-namespace-id"

# Environment variables
[vars]
R2_PUBLIC_URL = "https://podcast.yourdomain.com"

# Secrets (set via: wrangler secret put <NAME>)
# ANTHROPIC_API_KEY
# FISH_AUDIO_API_KEY
```

## Dependencies

```json
{
  "name": "newsletter-podcast",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test:scheduled": "wrangler dev --test-scheduled"
  },
  "dependencies": {
    "postal-mime": "^2.3.0",
    "podcast": "^2.0.1"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "typescript": "^5.3.0",
    "wrangler": "^3.100.0"
  }
}
```

## Cost Estimation

| Component          | Usage                     | Cost/month  |
| ------------------ | ------------------------- | ----------- |
| Cloudflare Workers | <100k requests            | Free        |
| Cloudflare R2      | ~1GB storage, ~1GB egress | Free tier   |
| Cloudflare KV      | <100k reads/writes        | Free tier   |
| Cloudflare Email   | Included                  | Free        |
| Claude API         | ~100k tokens/day × 30     | ~€5-8       |
| Fish Audio API     | ~5-10 hrs audio/month     | ~€5-10      |
| **Total**          |                           | **~€10-18** |

## Implementation Phases

### Phase 1: Infrastructure

- [ ] Create Cloudflare project
- [ ] Setup R2 bucket with public access
- [ ] Create KV namespace
- [ ] Configure Email Routing
- [ ] Upload cover.jpg to R2

### Phase 2: Email Ingestion

- [ ] Implement email-worker.ts
- [ ] Test receiving emails
- [ ] Verify KV storage

### Phase 3: Content Extraction

- [ ] Implement content extractor
- [ ] Test with various newsletter formats
- [ ] Tune ad/tracking filters

### Phase 4: Script Generation

- [ ] Implement Claude integration
- [ ] Test prompt quality
- [ ] Validate shownotes format

### Phase 5: TTS

- [ ] Test Fish Audio with your voice
- [ ] Implement audio generation
- [ ] Verify audio quality

### Phase 6: RSS Feed

- [ ] Implement feed generator
- [ ] Test in podcast apps
- [ ] Verify shownotes display

### Phase 7: Go Live

- [ ] Enable cron trigger
- [ ] Monitor first episodes
- [ ] Iterate on prompt/content

## API Quick Reference

### Claude API

```bash
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 4096,
    "messages": [{"role": "user", "content": "..."}]
  }'
```

### Fish Audio API

```bash
curl -X POST https://api.fish.audio/v1/tts \
  -H "Authorization: Bearer $FISH_API_KEY" \
  -H "Content-Type: application/json" \
  -H "model: s1" \
  -d '{
    "text": "Hello, welcome to today'\''s AI news digest.",
    "reference_id": "953f72be2fbf451693e98e4d094a9e4e",
    "format": "mp3",
    "mp3_bitrate": 128,
    "latency": "normal"
  }' \
  --output test.mp3
```

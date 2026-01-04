# Functional Specification: Newsletter-to-Podcast Pipeline (Briefcast)

**Spec ID:** c2caecab  
**Version:** 1.0  
**Date:** 2026-01-04  
**Status:** Draft

## 1. Executive Summary

### 1.1 Project Goal
Automatically convert daily AI newsletters into a single-host podcast episode, delivered via personal RSS feed to standard podcast applications (Overcast, Pocket Casts, etc.).

### 1.2 Key Success Criteria
- Fully automated daily podcast generation from email newsletters
- Natural-sounding single-host TTS using custom voice
- Clean, ad-free content with organized shownotes and source links
- Operational cost under €15/month
- Manual control for review and editing when needed

### 1.3 Technical Approach
Serverless architecture using Cloudflare Workers, R2 storage, Claude API for content synthesis, and Fish Audio API for text-to-speech generation.

---

## 2. System Architecture

### 2.1 High-Level Architecture

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
                              ▲
                              │
                        ┌─────────────┐
                        │   Manual    │
                        │   Control   │
                        │  API (HTTP) │
                        └─────────────┘
```

### 2.2 Component Overview

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Email Ingestion | Cloudflare Email Workers | Receive and store newsletters |
| Content Extraction | Custom TypeScript | Clean HTML, extract links, filter ads |
| Daily Aggregator | Cloudflare Cron Trigger | Batch process newsletters at 06:00 CET |
| Script Generation | Claude API (Sonnet 4.5) | Generate podcast scripts with shownotes |
| TTS Generation | Fish Audio API | Convert scripts to natural audio |
| Storage | Cloudflare R2 | Host audio files and RSS feed |
| RSS Feed | `podcast` npm library | Generate iTunes-compatible feed |
| Configuration | YAML in R2 | User-editable content filtering rules |
| Manual Controls | HTTP API (Workers) | Manual triggers and script review |

### 2.3 Data Flow

**Automated Daily Flow:**
1. Newsletters arrive throughout the day → stored in KV namespace
2. Cron triggers at 05:00 UTC (06:00 CET)
3. Load all newsletters from past 24 hours
4. Load configuration (content filtering rules)
5. Extract and clean content
6. Apply content filters
7. Generate podcast script via Claude API
8. Store pending script in R2
9. Auto-approve (if configured) OR wait for manual approval
10. Generate audio via Fish Audio API
11. Upload audio to R2
12. Update RSS feed with shownotes
13. Cleanup: delete processed newsletters from KV

**Manual Override Flow:**
1. User triggers `POST /api/generate` (authenticated)
2. Same processing as automated flow through script generation
3. Script stored as "pending" in R2
4. User reviews via `GET /api/pending`
5. User approves via `POST /api/approve/:id` or rejects via `POST /api/reject/:id`
6. On approval: TTS generation → audio upload → RSS update

---

## 3. Functional Requirements

### 3.1 Email Ingestion (FR-001)

**Architecture Note:**
Uses Cloudflare Email Workers with **push-based event model** (not IMAP). When an email arrives at `newsletters@yourdomain.com`, Cloudflare Email Routing automatically triggers the Worker. No polling, no IMAP credentials needed.

**Requirements:**
- **FR-001.1:** Accept emails at dedicated address (e.g., `newsletters@yourdomain.com`)
- **FR-001.2:** Parse email using `postal-mime` library
- **FR-001.3:** Extract: sender, subject, HTML body, text body, timestamp
- **FR-001.4:** Store in Cloudflare KV with date-prefixed key: `YYYY-MM-DD:{uuid}`
- **FR-001.5:** Set TTL of 7 days for automatic cleanup
- **FR-001.6:** Handle multipart MIME, attachments (ignore attachments)
- **FR-001.9:** Support dual-destination routing (Worker + personal email forward)

**Email Routing Configuration:**
- **FR-001.10:** Cloudflare Email Routing configured with two actions:
  - Action 1: Send to Worker (for automated processing)
  - Action 2: Forward to user's personal email (for subscription confirmations)
- **FR-001.11:** Alternatively, support emails forwarded from user's personal account

**Error Handling:**
- **FR-001.7:** Log parsing errors but don't fail (skip malformed emails)
- **FR-001.8:** Rate limiting: max 100 emails/day (configurable)

### 3.2 Content Extraction (FR-002)

**Requirements:**
- **FR-002.1:** Convert HTML to clean plain text
- **FR-002.2:** Extract all hyperlinks with titles
- **FR-002.3:** Filter out advertisements, tracking links, unsubscribe links
- **FR-002.4:** Remove sponsored content sections
- **FR-002.5:** Deduplicate links by URL
- **FR-002.6:** Limit to top 20 most relevant links per newsletter

**Filtering Patterns (Built-in):**
```typescript
const skipPatterns = [
  /sponsor/i, /advertisement/i, /promo/i,
  /unsubscribe/i, /tracking/i, /click here to/i,
  /powered by/i, /view in browser/i
];
```

**Additional User-Configurable Filters (FR-002.7):**
- Load from `config.yaml` in R2
- Apply topic inclusion/exclusion filters
- Apply keyword-based filters
- Validate config schema before use

### 3.3 Configuration Management (FR-003)

**Requirements:**
- **FR-003.1:** Store configuration as `config.yaml` in R2 bucket
- **FR-003.2:** Schema validation using Zod
- **FR-003.3:** Hot-reload on each cron run (no redeployment needed)
- **FR-003.4:** Fail fast on Worker startup if config is invalid
  - Invalid YAML syntax → Worker fails to start
  - Missing required fields → Worker fails to start
  - Invalid field values → Worker fails to start
  - Missing config.yaml → Use hardcoded defaults (allow first-time setup)

**Configuration Schema:**
```yaml
# config.yaml
podcast:
  title: "AI News Digest"
  author: "AI News Digest"
  description: "Daily summary of AI newsletters, automatically generated."
  language: "en"
  max_episodes: 30
  category: "Technology"
  subcategory: "Tech News"
  explicit: false
  type: "episodic"  # or "serial"
  owner_name: "Your Name"
  owner_email: "your@email.com"
  copyright: "© 2026 Your Name"

schedule:
  # Cron expression for daily episode generation
  # Format: "minute hour day-of-month month day-of-week"
  # Default: "0 5 * * *" = 05:00 UTC (06:00 CET) daily
  cron: "0 5 * * *"
  timezone: "UTC"  # For reference only, cron always runs in UTC

filtering:
  include_topics:
    - "machine learning"
    - "large language models"
    - "AI safety"
    - "generative AI"
  exclude_topics:
    - "cryptocurrency"
    - "blockchain"
  exclude_keywords:
    - "sponsored"
    - "advertisement"
    - "partner content"
  max_links_per_episode: 20

script_generation:
  # Claude API configuration
  model: "claude-sonnet-4-5-20250929"  # or "claude-opus-4-5", "claude-sonnet-4-5"
  max_tokens: 16000  # Claude's maximum for output
  temperature: 1.0  # 0.0-1.0, higher = more creative

  # Script parameters
  min_word_count: 1000
  max_word_count: 2000
  target_duration_minutes: 8  # Approximate (word_count / 150 WPM)

  # System prompt - customize for your domain
  system_prompt: |
    You are a podcast host presenting an AI news digest. Your style:
    - Informative but accessible, explaining complex topics clearly
    - Natural conversational flow with smooth transitions between topics
    - Occasionally share brief insights or implications
    - Duration target: 5-10 minutes (1000-2000 words)
    - Language: English

    Output format: Plain text script, no markdown. Write as if speaking aloud.
    No intro/outro music cues - start directly with content.
    Do NOT include "[pause]" or stage directions.

  # User prompt template - {newsletters} will be replaced with content
  user_prompt_template: |
    Create a podcast episode from today's newsletters.
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
    {newsletters}

tts:
  # Fish Audio API configuration
  voice_id: "953f72be2fbf451693e98e4d094a9e4e"
  model: "s1"  # OpenAudio S1
  format: "mp3"  # mp3, wav, or opus
  bitrate: 64  # 64, 128, or 192 kbps (lower = smaller files, lower quality)
  latency: "normal"  # normal (best quality), balanced, or low
  chunk_length: 300  # 100-300
  normalize: true

automation:
  auto_approve_scripts: false  # Require manual approval
  skip_day_if_no_newsletters: true
  retry_api_failures: true
  max_retries: 3

notifications:
  webhook_url: ""  # Optional webhook for errors
  email: ""  # Optional email for errors

cdn:
  # Bandwidth escape hatch options
  enabled: false
  provider: "cloudflare"  # cloudflare, cloudfront, fastly, bunny
  # If using external CDN, configure R2 as origin
  custom_domain: ""  # e.g., "cdn.yourdomain.com"
```

**FR-003.5:** Provide CLI tool or simple script to upload/update config

### 3.4 Daily Aggregator (FR-004)

**Requirements:**
- **FR-004.1:** Scheduled trigger configurable via `schedule.cron` in config (default: "0 5 * * *" = 05:00 UTC / 06:00 CET daily)
- **FR-004.2:** Fetch all newsletters from current date (KV prefix scan)
- **FR-004.3:** If no newsletters found AND `skip_day_if_no_newsletters: true`, exit gracefully
- **FR-004.4:** Load configuration from R2
- **FR-004.5:** Extract content from all newsletters
- **FR-004.6:** Apply content filters
- **FR-004.7:** Pass to script generator
- **FR-004.8:** Store generated script as pending (if manual approval required)
- **FR-004.9:** Auto-approve and proceed to TTS (if configured)

**Error Handling:**
- **FR-004.10:** Wrap in try-catch with comprehensive error logging
- **FR-004.11:** On error: log details, send notification (if configured), exit cleanly
- **FR-004.12:** Do NOT generate episode on error

### 3.5 Script Generation (FR-005)

**Requirements:**
- **FR-005.1:** Use Claude API with configurable model (default: `claude-sonnet-4-5-20250929`)
  - Supports: `claude-sonnet-4-5-20250929`, `claude-opus-4-5`, `claude-sonnet-4-5`, etc.
  - Model specified in `script_generation.model` config
- **FR-005.2:** Combine all newsletter content into single context
- **FR-005.3:** System prompt loaded from `script_generation.system_prompt` config
  - Allows domain customization (AI, gaming, knitting, finance, etc.)
  - Defines podcast host style, constraints, output format
- **FR-005.4:** User prompt template loaded from `script_generation.user_prompt_template` config
  - Template variable `{newsletters}` replaced with actual content
  - Instructs deduplication and narrative flow
- **FR-005.5:** Generate script based on configurable word count
  - `min_word_count` and `max_word_count` from config (default: 1000-2000)
  - Target duration: `target_duration_minutes` (default: 8 minutes)
- **FR-005.6:** Parse response to extract script and structured shownotes
- **FR-005.7:** Convert shownotes markdown to HTML

**Output Format:**
```
[SCRIPT TEXT - plain text, natural speaking style]

---SHOWNOTES---
## Topics Covered
- Topic 1 name
- Topic 2 name

## Sources & Links
- [Link title](URL)
- [Link title](URL)
---END SHOWNOTES---
```

**Claude API Configuration:**
- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`
- Max tokens: Configurable via `script_generation.max_tokens` (default: 16000)
- Temperature: Configurable via `script_generation.temperature` (default: 1.0)
  - Range: 0.0 (deterministic) to 1.0 (creative)

**Error Handling:**
- **FR-005.8:** Retry with exponential backoff (max 3 retries)
- **FR-005.9:** Log API errors with full response
- **FR-005.10:** On failure after retries: abort episode generation

### 3.6 Manual Workflow Controls (FR-006)

**Requirements:**
- **FR-006.1:** HTTP API with authentication (HTTP Basic Auth or Bearer token)
- **FR-006.2:** Endpoints:
  - `POST /api/generate` - Manual episode generation trigger
  - `GET /api/pending` - List pending scripts awaiting approval
  - `GET /api/pending/:id` - Get specific pending script with metadata
  - `POST /api/approve/:id` - Approve script → proceed to TTS
  - `POST /api/reject/:id` - Reject script, optionally regenerate
  - `PUT /api/pending/:id` - Update/edit pending script text
  - `DELETE /api/pending/:id` - Delete pending script

**Authentication:**
- **FR-006.3:** Use Cloudflare Worker secrets for API key/basic auth credentials
- **FR-006.4:** All endpoints require valid authentication
- **FR-006.5:** Rate limiting: max 20 requests/hour per IP

**Pending Script Storage:**
- **FR-006.6:** Store in R2 as JSON: `pending/{YYYY-MM-DD}-{uuid}.json`
- **FR-006.7:** Metadata includes: id, date, script, shownotes, newsletters (list), created_at, status
- **FR-006.8:** TTL: 30 days

**Approval Workflow:**
1. Script generated (manual or automated)
2. Stored as "pending" if `auto_approve_scripts: false`
3. User fetches via API or CLI tool
4. User edits if needed via `PUT /api/pending/:id`
5. User approves via `POST /api/approve/:id`
6. System proceeds to TTS generation

### 3.7 TTS Generation (FR-007)

**Requirements:**
- **FR-007.1:** Use Fish Audio API (`https://api.fish.audio/v1/tts`)
- **FR-007.2:** Model: Configurable via `tts.model` (default: `s1` - OpenAudio S1)
- **FR-007.3:** Voice: Configurable via `tts.voice_id` (default: `953f72be2fbf451693e98e4d094a9e4e`)
  - Allows users to use their own voice clones
- **FR-007.4:** Format: Configurable via `tts.format` (default: `mp3`)
  - Options: `mp3`, `wav`, `opus`
- **FR-007.5:** Bitrate: Configurable via `tts.bitrate` (default: 64 kbps)
  - Options: 64, 128, or 192 kbps
  - Lower bitrate = smaller file size, lower bandwidth costs
- **FR-007.6:** Latency mode: Configurable via `tts.latency` (default: "normal")
  - Options: "normal" (best quality), "balanced", "low" (faster)
- **FR-007.7:** Audio normalization: Configurable via `tts.normalize` (default: true)
- **FR-007.8:** Chunk length: Configurable via `tts.chunk_length` (default: 300)
  - Range: 100-300

**API Configuration (all values from config.yaml):**
```typescript
{
  text: script,
  reference_id: config.tts.voice_id,
  format: config.tts.format,
  mp3_bitrate: config.tts.bitrate,  // only if format = mp3
  latency: config.tts.latency,
  chunk_length: config.tts.chunk_length,
  normalize: config.tts.normalize
}
```

**Error Handling:**
- **FR-007.9:** Retry with exponential backoff (max 3 retries)
- **FR-007.10:** Log API errors with request ID
- **FR-007.11:** On failure: abort episode, keep script as pending for retry

### 3.8 Storage (FR-008)

**Requirements:**
- **FR-008.1:** Use Cloudflare R2 bucket
- **FR-008.2:** Directory structure:
  ```
  podcast-bucket/
  ├── episodes/
  │   ├── 2026-01-04.mp3
  │   ├── 2026-01-03.mp3
  ├── pending/
  │   ├── 2026-01-04-abc123.json
  ├── config.yaml
  ├── feed.xml
  ├── metadata.json
  └── cover.jpg
  ```
- **FR-008.3:** Audio files: `episodes/{YYYY-MM-DD}.mp3`
- **FR-008.4:** Set cache headers: `public, max-age=31536000`
- **FR-008.5:** Content-Type: `audio/mpeg` for MP3 files
- **FR-008.6:** Public read access via custom domain or R2.dev subdomain

**Metadata Storage:**
- **FR-008.7:** `metadata.json` tracks all episodes
- **FR-008.8:** Episode metadata: `{ guid, date, title, description, shownotes, audioUrl, duration }`
- **FR-008.9:** Keep last 30 episodes (configurable via `max_episodes` in config)

**CDN / Bandwidth Escape Hatch:**
- **FR-008.10:** Support optional CDN integration for high-bandwidth scenarios
- **FR-008.11:** Configurable via `cdn` section in config.yaml
- **FR-008.12:** CDN options:
  - **Cloudflare CDN (default, recommended):** Enable via R2 custom domain + Cloudflare caching
    - Free tier: 100GB/month egress to Cloudflare network
    - Cache Rules to optimize hit rate
    - No additional cost for Cloudflare-served traffic
  - **External CDN:** BunnyCDN, Fastly, CloudFront
    - Configure R2 as origin
    - Custom domain pointing to CDN
    - Requires `cdn.custom_domain` configuration
- **FR-008.13:** Default (no CDN): Use R2 public URLs directly
  - Cloudflare R2 free tier: 10GB/month egress
  - Sufficient for ~150-300 episode downloads/month (at 64kbps)
- **FR-008.14:** CDN transition strategy:
  - Start with R2 direct URLs (free tier)
  - Monitor bandwidth usage in R2 dashboard
  - Enable Cloudflare CDN if approaching 10GB/month limit
  - Consider external CDN only if exceeding Cloudflare free tier

### 3.9 RSS Feed Generation (FR-009)

**Requirements:**
- **FR-009.1:** Use `podcast` npm library
- **FR-009.2:** Generate iTunes-compatible podcast feed
- **FR-009.3:** Include full shownotes as HTML in episode description
- **FR-009.4:** Feed metadata loaded from `podcast` config section:
  ```typescript
  {
    title: config.podcast.title,
    description: config.podcast.description,
    feedUrl: "{R2_PUBLIC_URL}/feed.xml",
    imageUrl: "{R2_PUBLIC_URL}/cover.jpg",
    author: config.podcast.author,
    language: config.podcast.language,
    itunesAuthor: config.podcast.author,
    itunesOwner: {
      name: config.podcast.owner_name,
      email: config.podcast.owner_email
    },
    itunesCategory: [{
      text: config.podcast.category,
      subcats: [{ text: config.podcast.subcategory }]
    }],
    itunesExplicit: config.podcast.explicit,
    itunesType: config.podcast.type,  // "episodic" or "serial"
    copyright: config.podcast.copyright
  }
  ```
- **FR-009.5:** Episode items include:
  - Title: "{podcast.title} - {Date}"
  - Description: "{summary}\n\n{shownotes_html}"
  - Enclosure: audio file URL
  - GUID: `episode-{YYYY-MM-DD}`
  - Publication date
  - Duration (estimated or calculated from audio)

**FR-009.6:** Update feed atomically (write to temp file, then rename)
**FR-009.7:** Content-Type: `application/rss+xml; charset=utf-8`

### 3.10 Error Handling & Logging (FR-010)

**Requirements:**
- **FR-010.1:** Structured JSON logging to Cloudflare Workers logs
- **FR-010.2:** Log levels: DEBUG, INFO, WARN, ERROR
- **FR-010.3:** Log fields: timestamp, level, component, message, context (object)
- **FR-010.4:** Errors include: stack trace, API response, request ID

**Error Categories:**
1. **No newsletters:** INFO level, skip day gracefully
2. **Configuration error:** ERROR level, use defaults, notify
3. **Claude API failure:** ERROR level, retry, then skip day
4. **Fish Audio API failure:** ERROR level, retry, then skip day
5. **R2 storage failure:** ERROR level, critical, notify
6. **Authentication failure:** WARN level, reject request

**Notification (Optional):**
- **FR-010.5:** Webhook support (POST JSON to configured URL)
- **FR-010.6:** Webhook payload: `{ timestamp, level, component, message, error }`
- **FR-010.7:** Only send for ERROR level

**Retry Logic:**
- **FR-010.8:** Exponential backoff: 1s, 2s, 4s
- **FR-010.9:** Max retries: 3 (configurable)
- **FR-010.10:** Jitter: random 0-500ms added to backoff

---

## 4. Non-Functional Requirements

### 4.1 Performance (NFR-001)
- **NFR-001.1:** Email processing: < 30 seconds per email
- **NFR-001.2:** Daily cron job: < 30 minutes total (for up to 20 newsletters)
- **NFR-001.3:** API endpoints: < 5 seconds response time (excluding TTS generation)
- **NFR-001.4:** RSS feed generation: < 5 seconds

### 4.2 Scalability (NFR-002)
- **NFR-002.1:** Handle up to 50 newsletters/day
- **NFR-002.2:** Support up to 100 API requests/day (manual controls)
- **NFR-002.3:** Store up to 100 episodes in R2 (3 months @ 30/month)

### 4.3 Reliability (NFR-003)
- **NFR-003.1:** Cron job success rate: > 95%
- **NFR-003.2:** API uptime: > 99% (Cloudflare Workers SLA)
- **NFR-003.3:** Graceful degradation on external API failures
- **NFR-003.4:** No data loss (emails persisted in KV, scripts in R2)

### 4.4 Security (NFR-004)
- **NFR-004.1:** API endpoints require authentication
- **NFR-004.2:** Secrets stored in Cloudflare Worker environment (not in code)
- **NFR-004.3:** No email content logged (privacy)
- **NFR-004.4:** HTTPS only for all external communication
- **NFR-004.5:** Input validation on all API endpoints
- **NFR-004.6:** Rate limiting on public endpoints

### 4.5 Maintainability (NFR-005)
- **NFR-005.1:** TypeScript with strict type checking
- **NFR-005.2:** Modular architecture (separate files for each component)
- **NFR-005.3:** Comprehensive error messages and logging
- **NFR-005.4:** Configuration externalized (no hardcoded values)
- **NFR-005.5:** Code documentation for complex logic

### 4.6 Cost (NFR-006)
- **NFR-006.1:** Total monthly cost: < €15
- **NFR-006.2:** Cost breakdown:
  - Cloudflare Workers: Free tier (< 100k requests)
  - Cloudflare R2: Free tier (< 10GB storage, < 10GB egress)
  - Cloudflare KV: Free tier (< 100k operations)
  - Claude API: ~€5-8/month (30 days × ~100k tokens/day)
  - Fish Audio API: ~€5-10/month (~5-10 hours audio)

---

## 5. Technical Design

### 5.1 Project Structure

```
briefcast/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── email-worker.ts          # Email ingestion handler
│   ├── scheduled-worker.ts      # Daily cron job handler
│   ├── api-worker.ts            # Manual control API handlers
│   └── lib/
│       ├── content-extractor.ts # HTML cleaning, link extraction
│       ├── script-generator.ts  # Claude API integration
│       ├── tts-generator.ts     # Fish Audio API integration
│       ├── storage.ts           # R2 operations
│       ├── rss-generator.ts     # RSS feed generation
│       ├── config-loader.ts     # YAML config loading & validation
│       ├── logger.ts            # Structured logging utility
│       └── types.ts             # TypeScript type definitions
├── docs/
│   ├── setup/
│   │   ├── domain-setup.md
│   │   ├── api-keys.md
│   │   └── cloudflare-setup.md
│   ├── usage/
│   │   ├── configuration.md
│   │   ├── manual-workflow.md
│   │   └── monitoring.md
│   └── troubleshooting.md
├── scripts/
│   ├── upload-config.sh         # Helper to upload config.yaml
│   ├── approve-script.sh        # CLI for script approval
│   └── test-workflow.sh         # Integration testing
├── wrangler.toml
├── package.json
├── tsconfig.json
└── README.md
```

### 5.2 Key Interfaces

```typescript
// src/lib/types.ts

export interface Newsletter {
  id: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  receivedAt: string;
  cleanText?: string;
  links?: Array<{ title: string; url: string }>;
}

export interface ExtractedContent {
  text: string;
  links: Array<{ title: string; url: string }>;
}

export interface ScriptResult {
  title: string;
  description: string;
  script: string;
  shownotes: string; // HTML
}

export interface PendingScript {
  id: string;
  date: string;
  script: string;
  shownotes: string;
  newsletters: Newsletter[];
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Episode {
  guid: string;
  date: string;
  title: string;
  description: string;
  shownotes: string;
  audioUrl: string;
  duration: string;
}

export interface PodcastMetadata {
  episodes: Episode[];
  lastUpdated: string;
}

export interface Config {
  podcast: {
    title: string;
    author: string;
    description: string;
    language: string;
    max_episodes: number;
  };
  filtering: {
    include_topics: string[];
    exclude_topics: string[];
    exclude_keywords: string[];
    max_links_per_episode: number;
  };
  script_generation: {
    min_word_count: number;
    max_word_count: number;
    style: string;
    include_forward_looking: boolean;
  };
  tts: {
    voice_id: string;
    format: string;
    bitrate: number;
    normalize: boolean;
  };
  automation: {
    auto_approve_scripts: boolean;
    skip_day_if_no_newsletters: boolean;
    retry_api_failures: boolean;
    max_retries: number;
  };
  notifications: {
    webhook_url: string;
    email: string;
  };
}

export interface Env {
  NEWSLETTER_KV: KVNamespace;
  PODCAST_BUCKET: R2Bucket;
  ANTHROPIC_API_KEY: string;
  FISH_AUDIO_API_KEY: string;
  API_AUTH_TOKEN: string;
  R2_PUBLIC_URL: string;
}
```

### 5.3 Wrangler Configuration

```toml
# wrangler.toml
name = "briefcast"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# Cron trigger - daily at 05:00 UTC (06:00 CET)
[triggers]
crons = ["0 5 * * *"]

# Routes for HTTP API
[[routes]]
pattern = "briefcast.yourdomain.com/api/*"
zone_name = "yourdomain.com"

# R2 bucket for audio and feed
[[r2_buckets]]
binding = "PODCAST_BUCKET"
bucket_name = "briefcast-podcast"

# KV for temporary email storage
[[kv_namespaces]]
binding = "NEWSLETTER_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"

# Environment variables (public)
[vars]
R2_PUBLIC_URL = "https://podcast.yourdomain.com"

# Secrets (set via: wrangler secret put <NAME>)
# ANTHROPIC_API_KEY - Claude API key
# FISH_AUDIO_API_KEY - Fish Audio API key
# API_AUTH_TOKEN - Bearer token for manual control API
```

### 5.4 Dependencies

```json
{
  "name": "briefcast",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test:scheduled": "wrangler dev --test-scheduled",
    "upload-config": "./scripts/upload-config.sh"
  },
  "dependencies": {
    "postal-mime": "^2.3.0",
    "podcast": "^2.0.1",
    "js-yaml": "^4.1.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250101.0",
    "@types/js-yaml": "^4.0.9",
    "typescript": "^5.3.0",
    "wrangler": "^3.100.0"
  }
}
```

---

## 6. Implementation Phases

### Phase 1: Infrastructure Setup (Week 1)
- [ ] Create Cloudflare account and configure Workers
- [ ] Create R2 bucket with public access
- [ ] Create KV namespace
- [ ] Configure Email Routing (after domain setup)
- [ ] Set up local development environment
- [ ] Initialize project structure
- [ ] Configure TypeScript and wrangler

**Deliverables:** Working local dev environment, Cloudflare resources provisioned

### Phase 2: Email Ingestion (Week 1)
- [ ] Implement `email-worker.ts`
- [ ] Implement `postal-mime` parsing
- [ ] Test receiving emails (local dev)
- [ ] Verify KV storage and TTL
- [ ] Deploy email worker
- [ ] Test with real newsletter emails

**Deliverables:** Functional email ingestion, newsletters stored in KV

### Phase 3: Content Extraction (Week 1-2)
- [ ] Implement `content-extractor.ts`
- [ ] Build ad/tracking filter patterns
- [ ] Test with various newsletter formats (TLDR, The Batch, Import AI, etc.)
- [ ] Tune link extraction logic
- [ ] Add unit tests

**Deliverables:** Reliable content extraction with clean text and links

### Phase 4: Configuration Management (Week 2)
- [ ] Design Zod schema for `config.yaml`
- [ ] Implement `config-loader.ts` with validation
- [ ] Create default `config.yaml`
- [ ] Upload default config to R2
- [ ] Write upload script (`upload-config.sh`)
- [ ] Test hot-reload behavior

**Deliverables:** Working configuration system, documented schema

### Phase 5: Script Generation (Week 2)
- [ ] Implement `script-generator.ts`
- [ ] Integrate Claude API with retry logic
- [ ] Develop and tune system/user prompts
- [ ] Test with various newsletter combinations
- [ ] Validate shownotes parsing
- [ ] Add unit tests for prompt generation

**Deliverables:** High-quality script generation, structured shownotes

### Phase 6: TTS Generation (Week 2-3)
- [ ] Implement `tts-generator.ts`
- [ ] Test Fish Audio API with custom voice
- [ ] Verify audio quality and normalization
- [ ] Implement retry logic
- [ ] Test with long scripts (2000+ words)
- [ ] Optimize chunk_length if needed

**Deliverables:** Natural-sounding audio generation

### Phase 7: Storage & RSS Feed (Week 3)
- [ ] Implement `storage.ts` (R2 operations)
- [ ] Implement `rss-generator.ts`
- [ ] Upload sample cover art to R2
- [ ] Generate initial RSS feed
- [ ] Test in podcast apps (Overcast, Pocket Casts)
- [ ] Verify shownotes display correctly

**Deliverables:** Working RSS feed, playable in podcast apps

### Phase 8: Daily Aggregator (Week 3)
- [ ] Implement `scheduled-worker.ts`
- [ ] Wire all components together
- [ ] Add comprehensive error handling
- [ ] Implement `logger.ts` utility
- [ ] Test end-to-end automated flow
- [ ] Deploy and enable cron trigger

**Deliverables:** Fully automated daily pipeline

### Phase 9: Manual Controls API (Week 3-4)
- [ ] Implement `api-worker.ts` with all endpoints
- [ ] Add authentication middleware
- [ ] Implement pending script storage
- [ ] Add rate limiting
- [ ] Create CLI helper scripts
- [ ] Write API documentation

**Deliverables:** Manual control API, script approval workflow

### Phase 10: Documentation (Week 4)
- [ ] Write domain setup guide
- [ ] Write API key configuration guide
- [ ] Write content filtering guide
- [ ] Write manual workflow guide
- [ ] Write monitoring/troubleshooting guide
- [ ] Create setup checklist
- [ ] Record demo video (optional)

**Deliverables:** Comprehensive documentation suite

### Phase 11: Testing & Refinement (Week 4)
- [ ] Integration testing with real newsletters
- [ ] Load testing (simulate 30 days of newsletters)
- [ ] Monitor costs and optimize if needed
- [ ] Tune Claude prompts based on output quality
- [ ] Fix any bugs discovered
- [ ] Final deployment

**Deliverables:** Production-ready system

---

## 7. Testing Strategy

### 7.1 Test Coverage Requirements
- **Overall coverage target**: 80%+ across all code
- **Critical path coverage**: 100% on:
  - Daily cron job (scheduled-worker.ts)
  - Email ingestion (email-worker.ts)
  - Script generation (script-generator.ts)
  - TTS generation (tts-generator.ts)
  - Configuration validation (config-loader.ts)
  - API authentication and endpoints (api-worker.ts)
- **Testing framework**: Workers-compatible framework (Vitest, Miniflare, or similar)
- **Coverage tool**: c8, nyc, or built-in framework coverage
- **CI enforcement**: Tests must pass with coverage requirements before merge

### 7.2 Unit Tests
- Content extraction with various HTML formats
- Configuration validation with valid/invalid YAML
- Shownotes parsing from Claude output
- Retry logic for API failures
- Prompt generation with different configurations
- Error handling for all external API failures

### 7.3 Integration Tests
- End-to-end flow: email → KV → script → TTS → RSS
- Manual API workflow: generate → approve → publish
- Config hot-reload behavior
- Error handling paths
- Authentication and authorization flows
- RSS feed generation and validation

### 7.4 Edge Case Tests
- Malformed newsletter HTML
- Empty newsletter content
- Claude API rate limiting
- Fish Audio API failures
- R2 storage errors
- Invalid authentication tokens
- Missing configuration fields

### 7.5 Manual Testing
- Subscribe to real newsletters, verify processing
- Test in multiple podcast apps (Overcast, Pocket Casts, Apple Podcasts)
- Verify shownotes formatting and links
- Test manual approval workflow
- Stress test with 20+ newsletters in one day
- Verify CDN setup (if enabled)

### 7.6 Monitoring
- Cloudflare Workers analytics (requests, errors, CPU time)
- KV operation counts
- R2 storage usage
- API cost tracking (Claude + Fish Audio)
- RSS feed validation (via online validators)

---

## 8. Documentation Requirements

### 8.1 Setup Guides

#### Domain Setup (`docs/setup/domain-setup.md`)
**Contents:**
- Overview of domain requirements
- **Option 1:** Register domain via Cloudflare Registrar
  - Step-by-step registration process
  - Pricing: ~€10/year for .com
  - Auto-configured nameservers
- **Option 2:** Use existing domain
  - Point nameservers to Cloudflare
  - Nameserver propagation time
- DNS configuration for Email Routing
  - MX records setup
  - Verification process
  - Create email address (e.g., `newsletters@yourdomain.com`)
  - **Email Routing Destination Options:**
    - **Option 1 (Recommended): Dual Destinations**
      - Configure Email Routing to both trigger Worker AND forward to personal email
      - Worker processes newsletters for podcast generation
      - Personal email receives copy for subscription confirmations and management
      - Allows clicking confirmation links, managing subscriptions, unsubscribing
      - Set up email filters in personal inbox to auto-archive forwarded newsletters
    - **Option 2: Forward from Personal Account**
      - Subscribe to newsletters with personal email
      - Set up email filter/rule to auto-forward to `newsletters@yourdomain.com`
      - Keeps all subscription management in personal account
      - More control over which emails get processed
  - **Subscription Workflow (Dual Destinations):**
    1. Subscribe to newsletter using `newsletters@yourdomain.com`
    2. Confirmation email arrives → Worker processes it AND copy sent to personal email
    3. Click confirmation link in personal email inbox
    4. Future newsletters → automatically processed by Worker
    5. Optional: Set up filter in personal inbox to archive/delete forwarded copies
- R2 custom domain setup
  - Create custom domain binding
  - SSL/TLS certificate (automatic via Cloudflare)
  - Public URL: `https://podcast.yourdomain.com`
  - Alternative: use R2.dev subdomain (free, no custom domain needed)

#### API Keys Configuration (`docs/setup/api-keys.md`)
**Contents:**
- Anthropic API key
  - Sign up at console.anthropic.com
  - Billing setup (pay-as-you-go)
  - Estimated cost: €5-8/month for daily usage
  - Create API key
- Fish Audio API key
  - Sign up at fish.audio
  - Upload voice samples (if not already done)
  - Note voice reference ID: `953f72be2fbf451693e98e4d094a9e4e`
  - Create API key
  - Estimated cost: €5-10/month for ~10 hours audio
- Configure secrets in Cloudflare Workers
  ```bash
  wrangler secret put ANTHROPIC_API_KEY
  # Paste key when prompted
  
  wrangler secret put FISH_AUDIO_API_KEY
  # Paste key when prompted
  
  wrangler secret put API_AUTH_TOKEN
  # Generate random token: openssl rand -hex 32
  ```
- Local development setup
  - Create `.dev.vars` file (gitignored)
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  FISH_AUDIO_API_KEY=...
  API_AUTH_TOKEN=...
  ```
  - Never commit `.dev.vars` to git

#### Cloudflare Setup (`docs/setup/cloudflare-setup.md`)
**Contents:**
- Create Cloudflare account
- Enable Workers (free tier)
- Create R2 bucket
  ```bash
  wrangler r2 bucket create briefcast-podcast
  ```
- Configure R2 public access
  - Enable public read in R2 dashboard
  - Set up custom domain OR use R2.dev URL
- Create KV namespace
  ```bash
  wrangler kv:namespace create NEWSLETTER_KV
  wrangler kv:namespace create NEWSLETTER_KV --preview
  ```
  - Update `wrangler.toml` with namespace IDs
- Configure Email Routing
  - Enable in Cloudflare dashboard (Email → Email Routing)
  - Create custom address: `newsletters@yourdomain.com`
  - **Configure Dual Destinations (Recommended):**
    - Action 1: "Send to a Worker" → select deployed email worker
    - Action 2: "Forward to an email" → enter your personal email address
    - This allows Worker to process emails AND sends copy to you for subscription confirmations
  - **Alternative: Single Destination (Worker only)**
    - If using forwarding from personal account, only configure Worker action
    - Set up forwarding rule in your personal email client separately
  - Route configuration is saved in Cloudflare dashboard (not in `wrangler.toml`)
  - Test by sending an email to `newsletters@yourdomain.com` and verify both Worker processes it and you receive a copy
- Deploy project
  ```bash
  npm run deploy
  ```

### 8.2 Usage Guides

#### Configuration Guide (`docs/usage/configuration.md`)
**Contents:**
- `config.yaml` schema reference (all fields documented)
- How to edit configuration
  - Download current config: `wrangler r2 object get briefcast-podcast/config.yaml`
  - Edit locally
  - Upload: `./scripts/upload-config.sh config.yaml`
- Content filtering examples
  - Topic-based filtering
  - Keyword-based filtering
  - Best practices for filter tuning
- Automation settings
  - Auto-approve vs manual approval
  - Retry configuration
  - Notification setup
- Testing configuration changes
  - Trigger manual generation to verify
  - Check logs for filter effects

#### Manual Workflow Guide (`docs/usage/manual-workflow.md`)
**Contents:**
- When to use manual controls
  - Override automatic schedule
  - Review/edit scripts before publishing
  - Regenerate specific episodes
- API authentication
  - Set `Authorization: Bearer {API_AUTH_TOKEN}` header
  - Example curl commands
- Manual episode generation
  ```bash
  curl -X POST https://briefcast.yourdomain.com/api/generate \
    -H "Authorization: Bearer {token}"
  ```
- List pending scripts
  ```bash
  curl https://briefcast.yourdomain.com/api/pending \
    -H "Authorization: Bearer {token}"
  ```
- Review specific script
  ```bash
  curl https://briefcast.yourdomain.com/api/pending/{id} \
    -H "Authorization: Bearer {token}"
  ```
- Edit script before approval
  ```bash
  curl -X PUT https://briefcast.yourdomain.com/api/pending/{id} \
    -H "Authorization: Bearer {token}" \
    -H "Content-Type: application/json" \
    -d '{"script": "Updated script text..."}'
  ```
- Approve script
  ```bash
  curl -X POST https://briefcast.yourdomain.com/api/approve/{id} \
    -H "Authorization: Bearer {token}"
  ```
- Reject and regenerate
  ```bash
  curl -X POST https://briefcast.yourdomain.com/api/reject/{id} \
    -H "Authorization: Bearer {token}"
  ```
- CLI helper scripts
  - `./scripts/approve-script.sh {id}` - Quick approval
  - Environment variables for auth token

#### Monitoring Guide (`docs/usage/monitoring.md`)
**Contents:**
- Cloudflare Workers dashboard
  - View request logs
  - Check error rates
  - Monitor CPU time
- KV storage monitoring
  - Operation counts
  - Storage usage
  - TTL behavior
- R2 storage monitoring
  - Bucket size
  - **Egress bandwidth (CRITICAL for CDN decision)**
  - Object counts
  - Monitor egress approaching 10GB/month free tier limit
- Cost tracking
  - Claude API usage (console.anthropic.com)
  - Fish Audio API usage (fish.audio dashboard)
  - Cloudflare usage (stays within free tier)
- RSS feed validation
  - Use Cast Feed Validator
  - Check in podcast apps
  - Verify shownotes rendering
- Setting up notifications
  - Webhook configuration
  - Error alert integration (Slack, Discord, email)
- Common metrics to watch
  - Daily episode generation success rate
  - API error rates
  - Newsletter processing time
  - Audio generation time

### 8.3 Scaling & CDN Setup (`docs/usage/scaling-cdn.md`)
**Contents:**
- **When to enable CDN**
  - R2 egress approaching 10GB/month free tier
  - Podcast gaining audience (100+ downloads/episode)
  - International listeners (benefit from edge caching)
  - Monitor bandwidth in Cloudflare dashboard

- **Option 1: Cloudflare CDN (Recommended)**
  - **Setup steps:**
    1. Enable R2 custom domain (already done for podcast.yourdomain.com)
    2. Create Cache Rule in Cloudflare dashboard:
       - Rule name: "Cache podcast audio"
       - If: Hostname matches `podcast.yourdomain.com` AND File extension matches `mp3`
       - Then: Cache eligibility = Eligible, Edge TTL = 1 month
    3. Update `config.yaml`: set `cdn.enabled: true`, `cdn.provider: cloudflare`
  - **Benefits:**
    - Free tier: 100GB/month to Cloudflare network (10x more than R2 alone)
    - Global CDN edge locations
    - No configuration changes to application code
    - Automatic cache purging support
  - **Cost:** Free (within Cloudflare's CDN allowance)

- **Option 2: BunnyCDN**
  - **Setup steps:**
    1. Create BunnyCDN account
    2. Create Pull Zone with R2 public URL as origin
    3. Configure custom CNAME: `cdn.yourdomain.com`
    4. Update `config.yaml`: `cdn.custom_domain: cdn.yourdomain.com`
  - **Benefits:**
    - Pay-as-you-go: ~$0.01/GB (very affordable)
    - Excellent performance
    - Bandwidth Alliance partner (reduced R2 egress fees)
  - **Cost:** ~$1-2/month for moderate traffic

- **Option 3: Amazon CloudFront**
  - **Setup steps:**
    1. Create CloudFront distribution
    2. Set R2 public URL as origin
    3. Configure custom domain
    4. Update DNS and `config.yaml`
  - **Benefits:**
    - Tight AWS integration
    - Advanced caching controls
  - **Cost:** Free tier: 1TB/month for 12 months, then ~$0.085/GB

- **Bandwidth estimation:**
  - 64kbps MP3 @ 8 minutes = ~4MB per episode
  - 100 downloads/episode = 400MB
  - 30 episodes/month = 12GB/month (exceeds R2 free tier, use CDN)
  - With Cloudflare CDN: stays free up to 100GB/month

- **Configuration example:**
  ```yaml
  cdn:
    enabled: true
    provider: "cloudflare"  # or "bunny", "cloudfront"
    custom_domain: "podcast.yourdomain.com"  # if using external CDN
  ```

### 8.4 Troubleshooting (`docs/troubleshooting.md`)
**Contents:**
- **No episode generated**
  - Check if newsletters arrived (query KV)
  - Check cron trigger execution (Workers logs)
  - Verify config: `skip_day_if_no_newsletters`
  - Check for API errors in logs
- **Claude API errors**
  - Verify API key is set correctly
  - Check account credits
  - Review error logs for rate limiting
  - Verify prompt length (max tokens)
- **Fish Audio API errors**
  - Verify API key and voice reference ID
  - Check account credits
  - Review error logs
  - Test with shorter script
- **RSS feed not updating**
  - Check R2 bucket permissions
  - Verify feed.xml exists
  - Validate RSS XML syntax
  - Clear podcast app cache
- **Shownotes not displaying**
  - Check HTML formatting in feed
  - Test in multiple podcast apps
  - Verify shownotes parsing from Claude output
- **Email not being received**
  - Verify Email Routing is enabled
  - Check email address configuration
  - Test with manual email
  - Check spam/junk folders
- **Content filtering not working**
  - Download and review config.yaml
  - Check filter syntax (YAML indentation)
  - Review logs for filter application
  - Test with manual generation
- **Manual API not accessible**
  - Verify API routes in wrangler.toml
  - Check DNS for custom domain
  - Verify authentication token
  - Review rate limiting logs
- **High costs**
  - Review Claude token usage
  - Check Fish Audio audio duration
  - Optimize newsletter filtering
  - Consider reducing episode frequency

---

## 9. Acceptance Criteria

### 9.1 Core Functionality
- ✅ Receives newsletters via email and stores in KV
- ✅ Extracts clean content and filters ads/tracking
- ✅ Generates daily podcast at 06:00 CET
- ✅ Produces natural-sounding audio with custom voice
- ✅ Publishes RSS feed with shownotes and links
- ✅ Episodes playable in Overcast, Pocket Casts, Apple Podcasts

### 9.2 Configuration
- ✅ User can configure content filtering via YAML
- ✅ Configuration is hot-reloadable
- ✅ Invalid config fails fast on Worker startup (no silent failures)

### 9.3 Manual Controls
- ✅ User can manually trigger episode generation
- ✅ User can review/edit scripts before TTS
- ✅ User can approve/reject scripts
- ✅ All API endpoints require authentication

### 9.4 Error Handling
- ✅ Gracefully skips days with no newsletters
- ✅ Retries Claude/Fish Audio API failures
- ✅ Logs all errors with context
- ✅ Optionally sends error notifications

### 9.5 Documentation
- ✅ Complete domain setup guide
- ✅ Complete API key configuration guide
- ✅ Complete content filtering guide
- ✅ Complete manual workflow guide
- ✅ Complete monitoring & troubleshooting guide

### 9.6 Cost
- ✅ Monthly cost < €15
- ✅ Cloudflare services within free tier

### 9.7 Quality
- ✅ TypeScript strict mode passes
- ✅ Test coverage: 80%+ overall, 100% on critical paths
- ✅ All tests pass (unit, integration, edge cases)
- ✅ No hardcoded secrets or URLs
- ✅ Comprehensive error handling
- ✅ Clean, well-organized code structure

---

## 10. Open Questions & Future Enhancements

### 10.1 Open Questions
- **Q1:** Should there be a web UI for script approval instead of just API/CLI?
  - *Decision:* Start with API/CLI, consider web UI in v2
- **Q2:** Should episode duration be calculated from actual audio or estimated?
  - *Decision:* Calculate from MP3 metadata after generation
- **Q3:** What happens to pending scripts that are never approved?
  - *Decision:* 30-day TTL, auto-delete after expiration

### 10.2 Future Enhancements (v2.0+)
- Multi-language support (translate newsletters)
- Multiple voice options (different hosts)
- Conversation format (simulated dialogue between hosts)
- Newsletter source recommendations (ML-based)
- Automated A/B testing of prompts
- Web dashboard for management
- Mobile app for listening & approval
- Analytics (most popular topics, listen-through rate)
- Integration with newsletter APIs (automatic subscription)
- Custom intro/outro music
- Chapter markers in episodes
- Transcripts published alongside audio

---

## 11. Success Metrics

### 11.1 Technical Metrics
- **Episode generation success rate:** > 95%
- **Average processing time:** < 8 minutes
- **API error rate:** < 5%
- **RSS feed uptime:** > 99.5%

### 11.2 Quality Metrics
- **Audio quality:** Natural-sounding, no robotic artifacts
- **Content relevance:** > 90% of topics are on-target
- **Shownotes accuracy:** All source links valid and relevant

### 11.3 User Satisfaction
- **Manual interventions needed:** < 10% of episodes
- **Episodes listened to completion:** > 80%
- **User finds content valuable:** Qualitative feedback

### 11.4 Cost Metrics
- **Monthly cost:** < €15
- **Cost per episode:** < €0.50

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Briefcast** | Project name for newsletter-to-podcast pipeline |
| **Newsletter** | Email newsletter received at dedicated inbox |
| **Episode** | Single podcast audio file with metadata |
| **Shownotes** | Structured notes with topics and source links |
| **Pending script** | Generated script awaiting approval before TTS |
| **R2** | Cloudflare's S3-compatible object storage |
| **KV** | Cloudflare's key-value storage (for temporary data) |
| **Workers** | Cloudflare's serverless compute platform |
| **Cron trigger** | Scheduled execution at fixed time |
| **TTS** | Text-to-speech conversion |
| **RSS** | Really Simple Syndication (podcast feed format) |
| **GUID** | Globally Unique Identifier (for podcast episodes) |

---

## Appendix A: API Reference

### Claude API (Anthropic)
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Model:** `claude-sonnet-4-5-20250929`
- **Authentication:** `x-api-key: {ANTHROPIC_API_KEY}`
- **Documentation:** https://docs.anthropic.com/en/api/messages

### Fish Audio API
- **Endpoint:** `https://api.fish.audio/v1/tts`
- **Model:** `s1` (OpenAudio S1)
- **Authentication:** `Authorization: Bearer {FISH_AUDIO_API_KEY}`
- **Documentation:** https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech

### Cloudflare Email Workers
- **Documentation:** https://developers.cloudflare.com/email-routing/email-workers/

### Cloudflare R2
- **Documentation:** https://developers.cloudflare.com/r2/

### Cloudflare KV
- **Documentation:** https://developers.cloudflare.com/kv/

---

**End of Specification**

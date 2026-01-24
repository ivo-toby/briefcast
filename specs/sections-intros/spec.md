# Functional Specification: Sectioned Episodes with Audio Normalization

**Spec ID:** sections-intros
**Version:** 2.0
**Date:** 2026-01-12
**Status:** Draft
**Depends On:** c2caecab (core pipeline concepts)

---

## 1. Executive Summary

### 1.1 Project Goal
Transform the podcast from unstructured, variable-volume audio into professionally structured episodes with consistent audio levels, clear topic separation, and musical transitions—while staying within Cloudflare's free tier by moving processing to a Docker container.

### 1.2 Key Problems Addressed
1. **Volume Inconsistency**: TTS chunks have variable volume levels due to raw concatenation
2. **Generic Content**: Scripts lack specificity and audience focus
3. **Rigid Duration**: Hard limits cause hallucination (too short) or rushed content (too long)
4. **No Structure**: Episodes lack clear sections, transitions, or synthesis
5. **Cost Constraint**: Current Workers implementation risks exceeding free tier CPU limits

### 1.3 Architectural Change
**Current**: Monolithic Cloudflare Workers handling everything
**New**: Hybrid architecture splitting hosting (Cloudflare) from processing (Docker)

| Component | Cloudflare (Free Tier) | Docker Container (User Infra) |
|-----------|------------------------|-------------------------------|
| Email ingestion | ✓ | |
| Static hosting | ✓ (R2) | |
| RSS serving | ✓ (R2) | |
| Script generation | | ✓ |
| TTS generation | | ✓ |
| Audio normalization | | ✓ (FFmpeg) |
| Episode assembly | | ✓ (FFmpeg) |

### 1.4 Target Audience
- AI Engineers and ML practitioners
- Developers who build and tinker with tools
- People who try new AI paradigms daily
- Technical depth appreciated, not dumbed down
- Practical, actionable insights preferred over hype

### 1.5 Success Criteria
- Consistent volume across entire episode (< 3dB variance)
- Clear section structure audible to listeners
- Episode length varies naturally with content (5-45 minutes)
- Content feels targeted to technical audience
- Musical transitions between sections
- **Cloudflare stays within free tier** (< 10ms CPU per Worker invocation)
- **Zero ongoing infrastructure cost** (uses existing user infrastructure)

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE (Free Tier)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐         ┌──────────────────────────────────────────┐ │
│   │   Email Worker   │────────▶│                   R2                      │ │
│   │  (< 10ms CPU)    │         │                                          │ │
│   │                  │         │  pending-emails/     ← raw .eml files    │ │
│   │  • Receive email │         │  config.yaml         ← configuration     │ │
│   │  • Check sender  │         │  episodes/           ← final .mp3 files  │ │
│   │  • Store to R2   │         │  scripts/            ← script .txt files │ │
│   └──────────────────┘         │  assets/music/       ← intro/outro/trans │ │
│                                │  feed.xml            ← RSS feed          │ │
│                                │  metadata/           ← episode metadata  │ │
│                                └──────────────────────────────────────────┘ │
│                                              ▲                               │
│                                              │ S3-compatible API             │
└──────────────────────────────────────────────┼───────────────────────────────┘
                                               │
                                               │
┌──────────────────────────────────────────────┼───────────────────────────────┐
│                    DOCKER CONTAINER (User Infrastructure)                     │
├──────────────────────────────────────────────┼───────────────────────────────┤
│                                              │                                │
│   ┌──────────────────────────────────────────┴─────────────────────────────┐ │
│   │                        PODCAST PROCESSOR                                │ │
│   │                                                                         │ │
│   │  1. Read pending emails from R2                                         │ │
│   │  2. Extract and filter content                                          │ │
│   │  3. Generate structured script (Claude API)                             │ │
│   │  4. Generate TTS per section (OpenAI API)                               │ │
│   │  5. Normalize audio (FFmpeg)                                            │ │
│   │  6. Assemble with music (FFmpeg)                                        │ │
│   │  7. Upload episode to R2                                                │ │
│   │  8. Update RSS feed in R2                                               │ │
│   │  9. Cleanup processed emails                                            │ │
│   │                                                                         │ │
│   └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│   Triggered by: cron (host) or manual HTTP call                               │
│   Runtime: Node.js 20+ with FFmpeg                                            │
│   Deployment: Docker on homelab / Hetzner VPS                                 │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

#### 2.2.1 Cloudflare Email Worker (Minimal)
**Purpose**: Receive newsletters and store for later processing

**Responsibilities**:
- Receive incoming email via Cloudflare Email Routing
- Validate sender against allowlist
- Store raw email (.eml) to R2 at `pending-emails/{timestamp}-{messageId}.eml`
- Optionally forward to personal inbox

**Constraints**:
- MUST complete in < 10ms CPU time
- NO content processing
- NO API calls to Claude/OpenAI
- NO audio operations

**Implementation**:
```typescript
// Simplified email-worker.ts
export default {
  async email(message: EmailMessage, env: Env) {
    const config = await loadConfig(env);

    // Check allowlist (fast string matching)
    if (!isAllowedSender(message.from, config.email.allowed_senders)) {
      // Optionally forward anyway, but don't store
      if (config.email.forward_address) {
        await message.forward(config.email.forward_address);
      }
      return;
    }

    // Store raw email to R2
    const key = `pending-emails/${Date.now()}-${message.headers.get('message-id')}.eml`;
    await env.BUCKET.put(key, message.raw);

    // Optional: forward to personal inbox
    if (config.email.forward_address) {
      await message.forward(config.email.forward_address);
    }
  }
}
```

#### 2.2.2 Cloudflare R2 (Storage)
**Purpose**: Durable storage for all assets, accessed by both Workers and Docker

**Structure**:
```
briefcast-bucket/
├── pending-emails/           # Emails awaiting processing
│   └── {timestamp}-{id}.eml
├── config.yaml               # Shared configuration
├── episodes/                 # Final podcast episodes
│   └── {YYYY-MM-DD}.mp3
├── scripts/                  # Archived scripts (optional)
│   └── {YYYY-MM-DD}.txt
├── metadata/                 # Episode metadata JSON
│   └── {audio-id}.json
├── assets/
│   └── music/                # Pre-generated music files
│       ├── intro.mp3
│       ├── transition.mp3
│       └── outro.mp3
└── feed.xml                  # RSS feed
```

**Access**:
- Email Worker: Native R2 binding
- Docker: S3-compatible API with access tokens

#### 2.2.3 Docker Podcast Processor
**Purpose**: All CPU-intensive processing

**Responsibilities**:
- Read pending emails from R2
- Parse and extract newsletter content
- Generate structured scripts via Claude API
- Generate TTS audio per section via OpenAI API
- Normalize audio using FFmpeg (LUFS normalization)
- Stitch sections with music using FFmpeg
- Upload final episode to R2
- Generate and upload RSS feed
- Cleanup processed emails from R2

**Runtime Requirements**:
- Node.js 20+ (LTS)
- FFmpeg 6.0+ (for audio processing)
- ~512MB RAM minimum
- Network access to APIs and R2

### 2.3 Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Newsletter │────▶│   Email     │────▶│     R2      │
│   Sender    │     │   Worker    │     │  (pending)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                         ┌─────────────────────┘
                         ▼
              ┌─────────────────────┐
              │   Docker Processor  │
              │                     │
              │  ┌───────────────┐  │
              │  │ Read Emails   │  │
              │  └───────┬───────┘  │
              │          ▼          │
              │  ┌───────────────┐  │     ┌─────────────┐
              │  │ Claude API    │◀─┼────▶│  Anthropic  │
              │  │ (script gen)  │  │     └─────────────┘
              │  └───────┬───────┘  │
              │          ▼          │
              │  ┌───────────────┐  │     ┌─────────────┐
              │  │ OpenAI API    │◀─┼────▶│   OpenAI    │
              │  │ (TTS gen)     │  │     └─────────────┘
              │  └───────┬───────┘  │
              │          ▼          │
              │  ┌───────────────┐  │
              │  │ FFmpeg        │  │
              │  │ (normalize)   │  │
              │  └───────┬───────┘  │
              │          ▼          │
              │  ┌───────────────┐  │
              │  │ FFmpeg        │  │
              │  │ (assemble)    │  │
              │  └───────┬───────┘  │
              │          ▼          │
              │  ┌───────────────┐  │
              │  │ Upload to R2  │  │
              │  └───────────────┘  │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐     ┌─────────────┐
              │     R2 (final)      │────▶│  Podcast    │
              │  episodes/feed.xml  │     │    Apps     │
              └─────────────────────┘     └─────────────┘
```

---

## 3. Functional Requirements

### 3.1 Structured Script Output

#### 3.1.1 Section Types
The script generator MUST produce output with clearly delineated sections:

| Section | Required | Description |
|---------|----------|-------------|
| `intro` | Yes | Brief episode introduction with date and topic preview |
| `topic[]` | Yes (1+) | Individual topic discussions, each self-contained |
| `synthesis` | Yes | Conclusion that connects topics, provides insights |

#### 3.1.2 Output Format
Script MUST be structured JSON:

```typescript
interface StructuredScript {
  date: string;                    // YYYY-MM-DD
  episodeTitle: string;            // Compelling title
  estimatedDurationMinutes: number;
  sections: Section[];
}

interface Section {
  type: 'intro' | 'topic' | 'synthesis';
  title?: string;           // Required for topic sections
  content: string;          // The spoken content
  sources?: string[];       // Newsletter sources for this section
}
```

#### 3.1.3 JSON Validation
- Parser MUST validate against schema before proceeding
- On parse failure: log error, skip episode generation for the day
- Store raw Claude response for debugging

### 3.2 Audio Normalization with FFmpeg

#### 3.2.1 Normalization Strategy
Use FFmpeg's `loudnorm` filter implementing EBU R128 / ITU-R BS.1770-4:

```bash
# Two-pass normalization for accuracy
# Pass 1: Measure
ffmpeg -i input.mp3 -af loudnorm=print_format=json -f null - 2>&1 | grep -A 12 "input_"

# Pass 2: Apply with measured values
ffmpeg -i input.mp3 -af loudnorm=I=-16:TP=-1:LRA=11:measured_I={measured}:measured_TP={measured}:measured_LRA={measured}:measured_thresh={measured}:offset={offset}:linear=true output.mp3
```

#### 3.2.2 Normalization Levels

**Level 1: Per-Chunk Normalization**
- Each TTS API response normalized individually
- Target: -16 LUFS (speech standard)
- Prevents extreme variance within a section

**Level 2: Per-Section Normalization**
- After concatenating chunks within a section
- Ensures each section starts at consistent level
- Target: -16 LUFS

**Level 3: Episode-Wide Normalization**
- Final pass on assembled episode (speech only, before music)
- Ensures consistent loudness throughout
- Target: -16 LUFS, True Peak: -1 dB

**Level 4: Music Integration**
- Music normalized to -20 LUFS (4 dB below speech)
- Crossfades applied at boundaries
- No ducking (music is short transitions, not background)

#### 3.2.3 FFmpeg Processing Pipeline

```bash
# For each TTS chunk:
ffmpeg -i chunk_{n}.mp3 -af loudnorm=I=-16:TP=-1:LRA=11 -ar 24000 chunk_{n}_norm.mp3

# Concatenate section chunks:
ffmpeg -f concat -safe 0 -i section_chunks.txt -c copy section_{n}.mp3

# Normalize full section:
ffmpeg -i section_{n}.mp3 -af loudnorm=I=-16:TP=-1:LRA=11 section_{n}_norm.mp3

# Final assembly with music (example for 2 topics):
ffmpeg \
  -i intro_music.mp3 \
  -i section_intro.mp3 \
  -i transition.mp3 \
  -i section_topic1.mp3 \
  -i transition.mp3 \
  -i section_topic2.mp3 \
  -i transition.mp3 \
  -i section_synthesis.mp3 \
  -i outro_music.mp3 \
  -filter_complex "
    [0]afade=t=in:st=0:d=0.5[intro_m];
    [1]adelay=4500|4500[intro_s];
    [intro_m][intro_s]amix=inputs=2:duration=longest[a1];
    [a1][2][3][4][5][6][7]concat=n=7:v=0:a=1[a2];
    [a2][8]concat=n=2:v=0:a=1[out]
  " \
  -map "[out]" -ar 24000 -b:a 128k episode.mp3
```

### 3.3 Dynamic Episode Duration

#### 3.3.1 Remove Hard Limits
The following constraints are REMOVED from prompts:
- ~~`min_words: 800`~~
- ~~`max_words: 1500`~~
- ~~`target_duration_minutes: 10`~~

#### 3.3.2 New Duration Guidance
Prompt guidance (soft, not enforced):
- Typical range: 10-20 minutes
- Minimum: 3 minutes (absolute floor)
- Maximum: 60 minutes (absolute ceiling)

#### 3.3.3 Content-Driven Principles
```
Duration is determined by content value:
- 1 interesting article → 5-10 minute focused episode
- 3-5 solid topics → 15-25 minute standard episode
- 10+ rich newsletters → 30-45 minute comprehensive episode

Rules:
- NEVER pad with speculation or filler
- NEVER rush through valuable content
- If there's nothing interesting, it's okay to skip a day
```

### 3.4 Episode Structure

#### 3.4.1 Audio Timeline
```
00:00 ─┬─ Intro Music (fade in, 3-5 sec)
       │
       ├─ Intro Section (spoken, 30-60 sec)
       │
       ├─ Transition Jingle (1-2 sec)
       │
       ├─ Topic 1 (spoken, 2-8 min)
       │
       ├─ Transition Jingle (1-2 sec)
       │
       ├─ Topic 2 (spoken, 2-8 min)
       │
       ├─ ... (more topics as needed)
       │
       ├─ Transition Jingle (1-2 sec)
       │
       ├─ Synthesis (spoken, 1-3 min)
       │
       └─ Outro Music (fade out, 3-5 sec)
```

#### 3.4.2 Music Assets
Pre-generated using ToneJS (separate spec), stored in R2:
- `assets/music/intro.mp3` - 5-8 seconds, fade-in friendly
- `assets/music/transition.mp3` - 1-2 seconds, clean start/end
- `assets/music/outro.mp3` - 5-8 seconds, fade-out friendly

---

## 4. Technical Specifications

### 4.1 Docker Container Structure

```
briefcast-processor/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Entry point
│   ├── config/
│   │   ├── loader.ts            # Load config from R2
│   │   └── schema.ts            # Zod validation schema
│   ├── email/
│   │   ├── reader.ts            # Read emails from R2
│   │   └── parser.ts            # Parse .eml files
│   ├── content/
│   │   ├── extractor.ts         # Extract text from newsletters
│   │   └── filter.ts            # Keyword filtering
│   ├── script/
│   │   ├── generator.ts         # Claude API integration
│   │   ├── prompts.ts           # System/user prompts
│   │   └── validator.ts         # JSON schema validation
│   ├── audio/
│   │   ├── tts.ts               # OpenAI TTS per section
│   │   ├── normalizer.ts        # FFmpeg normalization wrapper
│   │   ├── assembler.ts         # FFmpeg assembly wrapper
│   │   └── ffmpeg.ts            # FFmpeg command builder
│   ├── storage/
│   │   ├── r2-client.ts         # S3-compatible R2 access
│   │   └── operations.ts        # High-level storage ops
│   ├── rss/
│   │   └── generator.ts         # RSS feed generation
│   ├── utils/
│   │   ├── logger.ts            # Structured logging
│   │   ├── retry.ts             # Retry with backoff
│   │   └── errors.ts            # Custom error types
│   └── types/
│       └── index.ts             # Shared type definitions
└── scripts/
    └── run.sh                   # Wrapper for cron
```

### 4.2 Dockerfile

```dockerfile
FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY dist/ ./dist/

# Create temp directory for audio processing
RUN mkdir -p /tmp/briefcast

# Environment variables (provided at runtime)
ENV NODE_ENV=production
ENV TEMP_DIR=/tmp/briefcast

# Run the processor
CMD ["node", "dist/index.js"]
```

### 4.3 Docker Compose

```yaml
version: '3.8'

services:
  processor:
    build: .
    image: briefcast-processor:latest
    container_name: briefcast-processor
    env_file:
      - .env
    volumes:
      # Optional: persist logs
      - ./logs:/app/logs
    restart: "no"  # Run once per invocation

    # Resource limits (adjust based on your infra)
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

### 4.4 Environment Variables

```bash
# .env.example

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=briefcast-podcast

# Optional: Override config location
CONFIG_PATH=config.yaml

# Optional: Logging
LOG_LEVEL=info

# Optional: Manual trigger server
ENABLE_HTTP_SERVER=false
HTTP_PORT=8080
HTTP_AUTH_TOKEN=your-secret-token
```

### 4.5 R2 Client Implementation

```typescript
// src/storage/r2-client.ts
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export function createR2Client(env: ProcessorEnv): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function listPendingEmails(client: S3Client, bucket: string): Promise<string[]> {
  const response = await client.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: 'pending-emails/',
  }));

  return (response.Contents || [])
    .map(obj => obj.Key!)
    .filter(key => key.endsWith('.eml'));
}

export async function getObject(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await response.Body!.transformToByteArray());
}

export async function putObject(client: S3Client, bucket: string, key: string, body: Buffer, contentType?: string): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function deleteObject(client: S3Client, bucket: string, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
```

### 4.6 FFmpeg Wrapper

```typescript
// src/audio/ffmpeg.ts
import { spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const TEMP_DIR = process.env.TEMP_DIR || '/tmp/briefcast';

export interface LoudnormMeasurement {
  input_i: number;
  input_tp: number;
  input_lra: number;
  input_thresh: number;
  target_offset: number;
}

export async function measureLoudness(inputPath: string): Promise<LoudnormMeasurement> {
  const output = await runFFmpeg([
    '-i', inputPath,
    '-af', 'loudnorm=print_format=json',
    '-f', 'null',
    '-'
  ]);

  // Parse JSON from stderr
  const jsonMatch = output.stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse loudnorm output');
  }

  return JSON.parse(jsonMatch[0]);
}

export async function normalizeAudio(
  inputPath: string,
  outputPath: string,
  targetLUFS: number = -16,
  truePeak: number = -1
): Promise<void> {
  // Two-pass normalization for accuracy
  const measurement = await measureLoudness(inputPath);

  await runFFmpeg([
    '-i', inputPath,
    '-af', `loudnorm=I=${targetLUFS}:TP=${truePeak}:LRA=11:measured_I=${measurement.input_i}:measured_TP=${measurement.input_tp}:measured_LRA=${measurement.input_lra}:measured_thresh=${measurement.input_thresh}:offset=${measurement.target_offset}:linear=true`,
    '-ar', '24000',
    '-b:a', '128k',
    outputPath
  ]);
}

export async function concatenateAudio(
  inputPaths: string[],
  outputPath: string
): Promise<void> {
  // Create concat file
  const concatFile = join(TEMP_DIR, `concat-${randomUUID()}.txt`);
  const concatContent = inputPaths.map(p => `file '${p}'`).join('\n');
  await writeFile(concatFile, concatContent);

  try {
    await runFFmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c', 'copy',
      outputPath
    ]);
  } finally {
    await unlink(concatFile).catch(() => {});
  }
}

export async function assembleWithMusic(
  introMusic: string,
  sections: string[],
  transitionMusic: string,
  outroMusic: string,
  outputPath: string
): Promise<void> {
  // Build complex filter for assembly with crossfades
  const inputs: string[] = [];
  const filterParts: string[] = [];

  // Add intro music with fade-in
  inputs.push('-i', introMusic);
  filterParts.push('[0]afade=t=in:st=0:d=0.5,loudnorm=I=-20:TP=-1[intro_m]');

  let inputIndex = 1;
  let lastLabel = 'intro_m';

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    inputs.push('-i', section);
    const sectionLabel = `s${i}`;

    if (i > 0) {
      // Add transition before this section
      inputs.push('-i', transitionMusic);
      const transLabel = `t${i}`;
      filterParts.push(`[${inputIndex + 1}]loudnorm=I=-20:TP=-1[${transLabel}]`);
      filterParts.push(`[${lastLabel}][${transLabel}]concat=n=2:v=0:a=1[pre${i}]`);
      lastLabel = `pre${i}`;
      inputIndex++;
    }

    filterParts.push(`[${inputIndex}]loudnorm=I=-16:TP=-1[${sectionLabel}]`);
    filterParts.push(`[${lastLabel}][${sectionLabel}]concat=n=2:v=0:a=1[after${i}]`);
    lastLabel = `after${i}`;
    inputIndex++;
  }

  // Add outro music with fade-out
  inputs.push('-i', outroMusic);
  filterParts.push(`[${inputIndex}]afade=t=out:st=3:d=2,loudnorm=I=-20:TP=-1[outro_m]`);
  filterParts.push(`[${lastLabel}][outro_m]concat=n=2:v=0:a=1[out]`);

  await runFFmpeg([
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-ar', '24000',
    '-b:a', '128k',
    outputPath
  ]);
}

async function runFFmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}
```

### 4.7 Main Processor Logic

```typescript
// src/index.ts
import { createR2Client, listPendingEmails, getObject, putObject, deleteObject } from './storage/r2-client';
import { loadConfig } from './config/loader';
import { parseEmail } from './email/parser';
import { extractContent } from './content/extractor';
import { generateScript } from './script/generator';
import { generateSectionAudio } from './audio/tts';
import { normalizeAudio, assembleWithMusic } from './audio/ffmpeg';
import { generateRSSFeed } from './rss/generator';
import { createLogger } from './utils/logger';

const logger = createLogger('processor');

async function main() {
  const startTime = Date.now();
  logger.info('Starting podcast generation');

  // Initialize
  const r2 = createR2Client(process.env);
  const bucket = process.env.R2_BUCKET_NAME!;
  const config = await loadConfig(r2, bucket);

  // 1. Get pending emails
  const emailKeys = await listPendingEmails(r2, bucket);
  if (emailKeys.length === 0) {
    logger.info('No pending emails, skipping generation');
    return;
  }
  logger.info(`Found ${emailKeys.length} pending emails`);

  // 2. Parse and extract content
  const newsletters = [];
  for (const key of emailKeys) {
    const raw = await getObject(r2, bucket, key);
    const parsed = await parseEmail(raw);

    if (isAllowedSender(parsed.from, config.email.allowed_senders)) {
      const content = extractContent(parsed, config);
      newsletters.push(content);
    }
  }

  if (newsletters.length === 0) {
    logger.info('No valid newsletters after filtering, skipping generation');
    return;
  }

  // 3. Generate structured script
  const script = await generateScript(newsletters, config);
  logger.info(`Generated script: ${script.episodeTitle}, ${script.sections.length} sections`);

  // 4. Generate TTS per section
  const sectionAudioPaths: string[] = [];
  for (let i = 0; i < script.sections.length; i++) {
    const section = script.sections[i];
    const audioPath = await generateSectionAudio(section, i, config);

    // Normalize section
    const normalizedPath = audioPath.replace('.mp3', '_norm.mp3');
    await normalizeAudio(audioPath, normalizedPath, -16, -1);
    sectionAudioPaths.push(normalizedPath);

    logger.info(`Section ${i + 1}/${script.sections.length} generated and normalized`);
  }

  // 5. Download music assets
  const introMusic = await downloadMusicAsset(r2, bucket, config.audio.music.intro_path);
  const transitionMusic = await downloadMusicAsset(r2, bucket, config.audio.music.transition_path);
  const outroMusic = await downloadMusicAsset(r2, bucket, config.audio.music.outro_path);

  // 6. Assemble final episode
  const today = new Date().toISOString().split('T')[0];
  const episodePath = `/tmp/briefcast/episode-${today}.mp3`;

  await assembleWithMusic(
    introMusic,
    sectionAudioPaths,
    transitionMusic,
    outroMusic,
    episodePath
  );
  logger.info('Episode assembled');

  // 7. Upload to R2
  const episodeBuffer = await readFile(episodePath);
  await putObject(r2, bucket, `episodes/${today}.mp3`, episodeBuffer, 'audio/mpeg');

  // 8. Save script (optional)
  if (config.storage.save_scripts) {
    const scriptText = formatScriptAsText(script);
    await putObject(r2, bucket, `scripts/${today}.txt`, Buffer.from(scriptText), 'text/plain');
  }

  // 9. Update RSS feed
  const episodes = await listEpisodes(r2, bucket);
  const feed = generateRSSFeed(episodes, config);
  await putObject(r2, bucket, 'feed.xml', Buffer.from(feed), 'application/rss+xml');

  // 10. Cleanup
  for (const key of emailKeys) {
    await deleteObject(r2, bucket, key);
  }

  // Cleanup temp files
  await cleanupTempFiles();

  const duration = (Date.now() - startTime) / 1000;
  logger.info(`Podcast generation complete in ${duration.toFixed(1)}s`);
}

main().catch((error) => {
  logger.error('Fatal error', { error: error.message, stack: error.stack });
  process.exit(1);
});
```

### 4.8 Type Definitions

```typescript
// src/types/index.ts

export interface ProcessorEnv {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  CONFIG_PATH?: string;
  LOG_LEVEL?: string;
  TEMP_DIR?: string;
}

export interface Config {
  email: {
    allowed_senders: string[];
    forward_address?: string;
  };
  script_generation: {
    model: string;
    max_tokens: number;
    temperature: number;
    system_prompt: string;
    user_prompt_template: string;
  };
  tts: {
    model: string;
    voice: string;
    speed: number;
    style_prompt?: string;
  };
  audio: {
    normalization: {
      enabled: boolean;
      target_lufs: number;
      music_target_lufs: number;
      max_peak_db: number;
    };
    music: {
      intro_path: string;
      transition_path: string;
      outro_path: string;
    };
  };
  storage: {
    save_scripts: boolean;
    max_episodes: number;
  };
  rss: {
    title: string;
    description: string;
    author: string;
    site_url: string;
    image_url?: string;
  };
}

export interface StructuredScript {
  id: string;
  date: string;
  episodeTitle: string;
  sections: ScriptSection[];
  totalWordCount: number;
  estimatedDurationMinutes: number;
  newsletterCount: number;
}

export interface ScriptSection {
  type: 'intro' | 'topic' | 'synthesis';
  title?: string;
  content: string;
  wordCount: number;
  sources?: string[];
}

export interface NewsletterContent {
  id: string;
  from: string;
  subject: string;
  date: Date;
  cleanedText: string;
  links: { url: string; title: string }[];
  wordCount: number;
}

export interface Episode {
  date: string;
  title: string;
  audioUrl: string;
  durationSeconds: number;
  fileSizeBytes: number;
  description: string;
  sources: string[];
}
```

### 4.9 Configuration Schema

```yaml
# config.yaml (stored in R2)

email:
  allowed_senders:
    - "*@substack.com"
    - "*@beehiiv.com"
    - "newsletter@example.com"
  forward_address: "your-email@example.com"  # Optional

script_generation:
  model: "claude-sonnet-4-20250514"
  max_tokens: 16000
  temperature: 0.8
  system_prompt: |
    You are the host of a daily AI news podcast for a technical audience.

    Your listeners are:
    - AI engineers and ML practitioners
    - Developers who build their own tools
    - People who experiment with new AI paradigms daily
    - Technical professionals who appreciate depth over hype

    Your job is to synthesize newsletter content into an engaging, structured episode.

    OUTPUT FORMAT:
    You MUST respond with valid JSON matching this structure:
    {
      "date": "YYYY-MM-DD",
      "episodeTitle": "Compelling title summarizing main themes",
      "estimatedDurationMinutes": <number>,
      "sections": [
        {"type": "intro", "content": "..."},
        {"type": "topic", "title": "...", "content": "...", "sources": ["..."]},
        {"type": "synthesis", "content": "..."}
      ]
    }

    CONTENT PRINCIPLES:
    - Be direct and technical. Your audience doesn't need hand-holding.
    - Include specific details: model names, company names, technical approaches.
    - Provide actionable insights, not just summaries.
    - Connect dots between topics when possible.
    - Use code terminology naturally when relevant.

    DURATION PRINCIPLES:
    - Let content determine length. Typical range: 10-20 minutes.
    - Light news day (1-2 interesting items): 5-10 minute focused episode.
    - Heavy news day (many valuable items): 30-45 minute comprehensive episode.
    - NEVER pad with speculation or filler to reach a target length.
    - NEVER rush through valuable content to save time.
    - If nothing is genuinely interesting, say so briefly and keep it short.

    SECTION GUIDELINES:
    - intro: Brief date, preview of themes. 30-60 seconds when spoken.
    - topic: Each topic should be self-contained. 2-8 minutes when spoken.
    - synthesis: Connect the topics, provide your take, suggest implications. 1-3 minutes.

  user_prompt_template: |
    Today is {date}.

    Here are today's newsletters:

    {newsletters}

    Create a podcast episode following the JSON format specified in your instructions.

tts:
  model: "gpt-4o-mini-tts"
  voice: "nova"
  speed: 1.0
  style_prompt: |
    You are a knowledgeable tech podcast host speaking to fellow engineers.
    Speak clearly and at a natural pace. Be conversational but professional.
    Emphasize technical terms appropriately. Vary your tone to maintain engagement.

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

storage:
  save_scripts: true
  max_episodes: 30

rss:
  title: "AI Daily Brief"
  description: "Daily AI news for engineers, by AI. Technical depth, no fluff."
  author: "Briefcast"
  site_url: "https://podcast.briefcast.online"
  image_url: "https://podcast.briefcast.online/cover.jpg"
```

---

## 5. Scheduling and Deployment

### 5.1 Cron Scheduling (Host Level)

```bash
# /etc/cron.d/briefcast
# Run daily at 5 AM UTC
0 5 * * * root cd /opt/briefcast && docker-compose run --rm processor >> /var/log/briefcast.log 2>&1
```

Or with systemd timer:

```ini
# /etc/systemd/system/briefcast.timer
[Unit]
Description=Briefcast Daily Podcast Generation

[Timer]
OnCalendar=*-*-* 05:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/briefcast.service
[Unit]
Description=Briefcast Podcast Processor
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/briefcast
ExecStart=/usr/bin/docker-compose run --rm processor
TimeoutStartSec=900

[Install]
WantedBy=multi-user.target
```

### 5.2 Manual Trigger (Optional HTTP Server)

If `ENABLE_HTTP_SERVER=true`, the container exposes a simple HTTP endpoint:

```typescript
// src/http-server.ts
import { createServer } from 'http';

const AUTH_TOKEN = process.env.HTTP_AUTH_TOKEN;
const PORT = parseInt(process.env.HTTP_PORT || '8080');

export function startHttpServer(runProcessor: () => Promise<void>) {
  const server = createServer(async (req, res) => {
    // Auth check
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }

    if (req.method === 'POST' && req.url === '/trigger') {
      res.writeHead(202);
      res.end('Processing started');

      // Run async
      runProcessor().catch(console.error);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
  });
}
```

### 5.3 Deployment Steps

1. **Create R2 Bucket and Access Tokens**
   ```bash
   # Via Cloudflare dashboard or Wrangler
   wrangler r2 bucket create briefcast-podcast
   # Generate R2 API tokens with read/write access
   ```

2. **Deploy Email Worker**
   ```bash
   cd workers/email-worker
   wrangler deploy
   # Configure Email Routing in Cloudflare dashboard
   ```

3. **Upload Initial Config**
   ```bash
   # Upload config.yaml to R2
   wrangler r2 object put briefcast-podcast/config.yaml --file=config.yaml
   ```

4. **Upload Music Assets**
   ```bash
   wrangler r2 object put briefcast-podcast/assets/music/intro.mp3 --file=intro.mp3
   wrangler r2 object put briefcast-podcast/assets/music/transition.mp3 --file=transition.mp3
   wrangler r2 object put briefcast-podcast/assets/music/outro.mp3 --file=outro.mp3
   ```

5. **Build and Deploy Docker Image**
   ```bash
   cd processor
   docker build -t briefcast-processor .
   # Push to registry or copy to server
   ```

6. **Configure Environment**
   ```bash
   # On server
   cp .env.example .env
   # Edit .env with your credentials
   ```

7. **Enable Cron**
   ```bash
   sudo systemctl enable briefcast.timer
   sudo systemctl start briefcast.timer
   ```

---

## 6. Migration from Current Architecture

### 6.1 Migration Steps

1. **Phase 1: Deploy New Email Worker**
   - Deploy simplified email worker that stores to R2
   - Keep old scheduled worker running (fallback)
   - Verify emails are being stored to R2

2. **Phase 2: Deploy Docker Processor**
   - Deploy Docker container on your infrastructure
   - Run manually to verify it works
   - Check output quality

3. **Phase 3: Cutover**
   - Disable old scheduled worker cron trigger
   - Enable Docker cron trigger
   - Monitor for issues

4. **Phase 4: Cleanup**
   - Remove old scheduled-worker.ts
   - Remove old api-worker.ts (or rebuild if needed)
   - Remove unused dependencies from workers

### 6.2 Rollback Plan
- Keep old Workers code in repository
- Old Workers can be re-deployed in minutes if needed
- R2 structure is compatible with both architectures

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Total episode generation: max 15 minutes for 45-minute episode
- FFmpeg normalization: max 30 seconds per section
- Memory usage: peak < 1GB
- Disk usage: peak < 2GB temp files

### 7.2 Audio Quality
- Output format: MP3 128kbps CBR
- Sample rate: 24kHz
- Volume consistency: < 3dB LUFS variance between sections
- No clipping: true peak < -1dB
- Music properly mixed (4dB below speech)

### 7.3 Reliability
- Retry logic for API calls (3 attempts with exponential backoff)
- Graceful handling of missing emails
- Structured logging for debugging
- Cleanup of temp files on success and failure

### 7.4 Cost
- Cloudflare: Free tier (< 10ms CPU per Worker invocation)
- Docker: Zero additional cost (runs on existing infrastructure)
- API costs: Same as current (Claude + OpenAI usage-based)

### 7.5 Security
- R2 access tokens stored in environment variables
- API keys never logged
- No sensitive data in container image
- Optional HTTP trigger requires auth token

---

## 8. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| FFmpeg not available | High | Low | Docker image includes FFmpeg |
| R2 access token exposure | High | Low | Environment variables, not in code |
| Docker container fails silently | Medium | Medium | Structured logging, health checks |
| Long episodes timeout | Medium | Low | 15-minute timeout is generous |
| JSON parsing fails from Claude | Medium | Medium | Fallback: skip day, log for review |
| TTS rate limiting | Medium | Low | Retry logic with backoff |
| Music files missing | Medium | Low | Fail fast with clear error |
| Network issues to R2 | Medium | Low | Retry logic |

---

## 9. Testing Requirements

### 9.1 Unit Tests
- FFmpeg wrapper: mock FFmpeg calls, verify command construction
- R2 client: mock S3 calls, verify operations
- Script parser: validate JSON parsing, handle malformed input
- Config loader: validate schema, handle missing fields

### 9.2 Integration Tests
- End-to-end with mock APIs (Claude, OpenAI)
- Verify audio output is valid MP3
- Verify RSS feed is valid XML
- Verify R2 operations work with real bucket

### 9.3 Manual Testing
- Listen test for volume consistency
- Verify music transitions sound correct
- Check content quality for technical audience
- Test cron trigger on actual schedule

---

## 10. Acceptance Criteria

1. **AC-1**: Episodes have consistent volume throughout (< 3dB LUFS variance)
2. **AC-2**: Clear audio transitions between topics
3. **AC-3**: Script output is valid JSON with required section structure
4. **AC-4**: Episode length varies based on content (verified 5-45 min range)
5. **AC-5**: Content tone matches technical audience expectations
6. **AC-6**: Music plays at correct positions (intro, transitions, outro)
7. **AC-7**: No audio clipping or distortion
8. **AC-8**: Backwards compatible with existing RSS subscribers
9. **AC-9**: **Cloudflare Workers stay within free tier (< 10ms CPU)**
10. **AC-10**: **Docker container runs successfully on user infrastructure**
11. **AC-11**: **Cron scheduling works reliably**

---

## 11. Out of Scope

1. **ToneJS Music Generation** - Separate specification
2. **Chapter Markers in MP3** - Future enhancement
3. **Multiple Hosts/Voices** - Not in this iteration
4. **Real-time Preview** - Not required
5. **Manual Section Editing** - Not in this iteration
6. **Web UI for Management** - Not in this iteration
7. **Kubernetes Deployment** - Docker Compose is sufficient

---

## Appendix A: Sample Structured Script

```json
{
  "date": "2026-01-12",
  "episodeTitle": "Cognition's Distribution Play and Infrastructure Reality Check",
  "estimatedDurationMinutes": 12,
  "sections": [
    {
      "type": "intro",
      "content": "It's Sunday, January 12th. Today we're looking at two themes that might seem unrelated but actually tell the same story: why distribution is eating capability in AI, and why everyone's suddenly obsessed with infrastructure. Let's dig in."
    },
    {
      "type": "topic",
      "title": "Cognition and Infosys: Distribution Over Capability",
      "content": "Cognition built Devin, arguably the most impressive AI coding agent we've seen. But here's the interesting part: they just partnered with Infosys. Not exactly a cutting-edge AI lab. Infosys brings something Cognition doesn't have—Fortune 500 relationships, embedded consultants, and deep understanding of how enterprises actually buy software. This matters because we're hitting an inflection point. When capability differences between models shrink—and they are shrinking—the companies that win are the ones who can actually get their tech deployed. Cognition has incredible tech. Infosys has incredible distribution. The partnership math makes sense.",
      "sources": ["Nate's Newsletter"]
    },
    {
      "type": "topic",
      "title": "Infrastructure: The Unsexy Reality",
      "content": "While we're all debating whether GPT-5 will be AGI, companies are quietly realizing something: the bottleneck isn't models anymore. It's chips, cooling systems, power grids, and data center capacity. The infrastructure layer is becoming as valuable as the model layer. This is a familiar pattern if you remember the cloud wars. AWS didn't win because they had the best virtual machines. They won because they had the best distribution, the most data centers, the deepest integration with enterprise workflows. We might be seeing the same dynamic play out in AI. The question for practitioners: are you paying enough attention to the infrastructure story, or are you too focused on model benchmarks?",
      "sources": ["AI Daily"]
    },
    {
      "type": "synthesis",
      "content": "Here's what connects these stories: capability is commoditizing. When everyone has access to similar model quality—whether through OpenAI, Anthropic, or open-source Llama—competitive advantage shifts elsewhere. For Cognition, it's distribution through Infosys. For the industry, it's whoever solves the physical infrastructure bottleneck. The companies that win the next phase might not be the ones with the best models, but the ones with the best go-to-market or the best supply chains. Something to think about as you're evaluating where to focus your own efforts. That's it for today. See you tomorrow."
    }
  ]
}
```

---

## Appendix B: Directory Structure Summary

```
briefcast/
├── workers/
│   └── email-worker/              # Minimal Cloudflare Worker
│       ├── src/
│       │   └── index.ts
│       ├── wrangler.toml
│       └── package.json
│
├── processor/                      # Docker-based processor
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── config/
│       ├── email/
│       ├── content/
│       ├── script/
│       ├── audio/
│       ├── storage/
│       ├── rss/
│       ├── utils/
│       └── types/
│
├── specs/                          # Specifications
│   └── sections-intros/
│       ├── spec.md
│       └── validation.md
│
└── config.yaml.example             # Configuration template
```

---

## Appendix C: Cloudflare Free Tier Compliance

| Operation | CPU Time | Free Tier Limit | Status |
|-----------|----------|-----------------|--------|
| Receive email | < 1ms | 10ms | ✓ |
| Check allowlist | < 1ms | 10ms | ✓ |
| Store to R2 | < 5ms | 10ms | ✓ |
| Forward email | < 1ms | 10ms | ✓ |
| **Total** | **< 8ms** | **10ms** | **✓ COMPLIANT** |

All CPU-intensive work (script generation, TTS, audio processing) happens in Docker, completely outside Cloudflare's billing.

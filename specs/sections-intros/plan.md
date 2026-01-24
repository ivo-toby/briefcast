# Technical Implementation Plan: Sectioned Episodes with Audio Normalization

**Spec ID:** sections-intros
**Version:** 1.0
**Date:** 2026-01-12
**Author:** Architect Agent

---

## 1. Architecture Overview

### 1.1 Hybrid Architecture

The implementation transforms the monolithic Cloudflare Workers architecture into a hybrid system:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE (Free Tier)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│   ┌──────────────────┐         ┌──────────────────────────────────────────┐ │
│   │   Email Worker   │────────>│                   R2                      │ │
│   │  (< 10ms CPU)    │         │  pending-emails/     <- raw .eml files    │ │
│   │                  │         │  config.yaml         <- configuration     │ │
│   │  • Receive email │         │  episodes/           <- final .mp3 files  │ │
│   │  • Check sender  │         │  assets/music/       <- intro/outro/trans │ │
│   │  • Store to R2   │         │  feed.xml            <- RSS feed          │ │
│   └──────────────────┘         └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              │ S3-compatible API
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    DOCKER CONTAINER (User Infrastructure)                     │
├──────────────────────────────────────────────────────────────────────────────┤
│   ┌────────────────────────────────────────────────────────────────────────┐ │
│   │                        PODCAST PROCESSOR                                │ │
│   │                                                                         │ │
│   │  1. Read pending emails from R2                                         │ │
│   │  2. Parse .eml and extract content                                      │ │
│   │  3. Generate structured script (Claude API) -> JSON                     │ │
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

### 1.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Monorepo vs Polyrepo** | Monorepo with packages | Shared types, easier development |
| **FFmpeg Integration** | Raw child_process spawn | Simple, no additional dependencies |
| **S3 Client** | AWS SDK v3 | Official, well-tested, TypeScript support |
| **Project Structure** | `workers/` + `processor/` | Clear separation of concerns |
| **Normalization Strategy** | Multi-level LUFS | Per-chunk, per-section, episode-wide |
| **Script Format** | Structured JSON | Enables section-aware TTS |

---

## 2. Technology Stack

### 2.1 Email Worker (Cloudflare)

```
Runtime: Cloudflare Workers
Language: TypeScript 5.3+
Dependencies:
  - js-yaml (config parsing)
  - zod (minimal validation)
Build: Wrangler 3.x
```

### 2.2 Docker Processor

```
Base Image: node:20-alpine
System Dependencies: ffmpeg
Language: TypeScript 5.3+
Dependencies:
  - @aws-sdk/client-s3 (R2 access)
  - postal-mime (email parsing)
  - podcast (RSS generation)
  - js-yaml (config parsing)
  - zod (validation)
  - js-tiktoken (token counting)
  - dotenv (environment)
Build: tsc + Docker
```

### 2.3 Shared Code

```
Location: shared/
Contents:
  - types/index.ts (shared interfaces)
  - schemas/config.ts (Zod schemas)
  - schemas/script.ts (structured script schema)
  - utils/errors.ts (error classes)
```

---

## 3. Data Models

### 3.1 Structured Script Schema

```typescript
// shared/schemas/script.ts
import { z } from 'zod';

export const SectionSchema = z.object({
  type: z.enum(['intro', 'topic', 'synthesis']),
  title: z.string().optional(),
  content: z.string().min(10),
  sources: z.array(z.string()).optional(),
});

export const StructuredScriptSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  episodeTitle: z.string().min(5).max(200),
  estimatedDurationMinutes: z.number().min(3).max(60),
  sections: z.array(SectionSchema).min(2).refine(
    (sections) => {
      const types = sections.map(s => s.type);
      return types[0] === 'intro' && 
             types[types.length - 1] === 'synthesis' &&
             types.filter(t => t === 'topic').length >= 1;
    },
    { message: 'Script must have intro, at least one topic, and synthesis' }
  ),
});

export type StructuredScript = z.infer<typeof StructuredScriptSchema>;
export type ScriptSection = z.infer<typeof SectionSchema>;
```

### 3.2 Extended Config Schema

```typescript
// shared/schemas/config.ts
const AudioConfigSchema = z.object({
  normalization: z.object({
    enabled: z.boolean().default(true),
    target_lufs: z.number().default(-16),
    music_target_lufs: z.number().default(-20),
    max_peak_db: z.number().default(-1),
  }),
  music: z.object({
    intro_path: z.string(),
    transition_path: z.string(),
    outro_path: z.string(),
  }),
});

// Add to existing ConfigSchema
const ConfigSchema = z.object({
  // ... existing fields ...
  audio: AudioConfigSchema,
  // Remove min_words, max_words, target_duration_minutes from script_generation
  script_generation: z.object({
    model: z.string(),
    max_tokens: z.number().int().min(1).max(32000),
    temperature: z.number().min(0).max(1),
    system_prompt: z.string(),
    user_prompt_template: z.string(),
  }),
});
```

### 3.3 Email Storage Format

```
R2 Key: pending-emails/{timestamp}-{sanitized-message-id}.eml
Content: Raw RFC 822 email (MIME format)
Metadata: None (parsed at processing time)
```

### 3.4 Episode Metadata

```typescript
interface EpisodeMetadata {
  id: string;
  date: string;
  title: string;
  durationSeconds: number;
  fileSizeBytes: number;
  sections: Array<{
    type: 'intro' | 'topic' | 'synthesis';
    title?: string;
    startTimeSeconds: number;
  }>;
  sources: string[];
  generatedAt: string;
}
```

---

## 4. API Design

### 4.1 R2 Storage Operations

```typescript
// processor/src/storage/r2-client.ts

interface R2Client {
  // Read operations
  listPendingEmails(): Promise<string[]>;
  getObject(key: string): Promise<Buffer>;
  getConfig(): Promise<Config>;
  
  // Write operations
  putObject(key: string, body: Buffer, contentType?: string): Promise<void>;
  putEpisode(date: string, audio: Buffer): Promise<string>;
  putMetadata(episodeId: string, metadata: EpisodeMetadata): Promise<void>;
  putRSSFeed(xml: string): Promise<void>;
  
  // Delete operations
  deleteObject(key: string): Promise<void>;
  deletePendingEmail(key: string): Promise<void>;
  
  // List operations
  listEpisodes(): Promise<string[]>;
  listMetadata(): Promise<EpisodeMetadata[]>;
}
```

### 4.2 FFmpeg Operations

```typescript
// processor/src/audio/ffmpeg.ts

interface FFmpegOperations {
  // Measurement
  measureLoudness(inputPath: string): Promise<LoudnormMeasurement>;
  
  // Normalization
  normalizeAudio(
    inputPath: string, 
    outputPath: string, 
    targetLUFS?: number
  ): Promise<void>;
  
  // Concatenation
  concatenateAudio(inputPaths: string[], outputPath: string): Promise<void>;
  
  // Assembly
  assembleWithMusic(
    introMusic: string,
    sections: string[],
    transitionMusic: string,
    outroMusic: string,
    outputPath: string
  ): Promise<void>;
  
  // Utility
  getAudioDuration(filePath: string): Promise<number>;
}
```

### 4.3 Script Generator Interface

```typescript
// processor/src/script/generator.ts

interface ScriptGenerator {
  generate(
    newsletters: NewsletterContent[],
    config: Config
  ): Promise<StructuredScript>;
}
```

### 4.4 TTS Generator Interface

```typescript
// processor/src/audio/tts.ts

interface TTSGenerator {
  generateSection(
    section: ScriptSection,
    sectionIndex: number,
    config: Config
  ): Promise<string>;  // Returns path to audio file
}
```

---

## 5. Implementation Strategy

### 5.1 Phase 1: Project Restructure

**Goal**: Set up the new project structure without breaking existing functionality.

```
briefcast/
├── workers/
│   └── email-worker/
│       ├── src/
│       │   └── index.ts
│       ├── wrangler.toml
│       └── package.json
├── processor/
│   ├── src/
│   │   ├── index.ts
│   │   ├── config/
│   │   ├── email/
│   │   ├── content/
│   │   ├── script/
│   │   ├── audio/
│   │   ├── storage/
│   │   ├── rss/
│   │   ├── utils/
│   │   └── types/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   ├── types/
│   ├── schemas/
│   └── utils/
├── src/                    # Keep old code during migration
└── package.json            # Root package.json for workspaces
```

### 5.2 Phase 2: Core Processor Implementation

**Order of implementation**:
1. R2 S3 client
2. Config loader (S3-based)
3. Email parser (reuse postal-mime)
4. Content extractor (reuse existing)
5. Script generator (new JSON output)
6. TTS generator (per-section)
7. FFmpeg wrapper
8. Audio normalizer
9. Audio assembler
10. RSS generator (reuse existing)
11. Main orchestrator

### 5.3 Phase 3: Email Worker Simplification

**Changes**:
1. Remove email parsing (postal-mime)
2. Remove content extraction
3. Store raw .eml to R2 instead of parsed content to KV
4. Keep allowlist checking (simple string matching)
5. Keep email forwarding

### 5.4 Phase 4: Integration and Testing

1. Unit tests for all components
2. Integration tests with mocked APIs
3. End-to-end test with real APIs (manual)
4. Audio quality validation (listen tests)

### 5.5 Phase 5: Deployment and Migration

1. Deploy new email worker
2. Run parallel (old scheduled worker + new processor)
3. Validate output quality
4. Switch to new processor
5. Disable old scheduled worker
6. Cleanup old code

---

## 6. File-by-File Implementation Strategy

### 6.1 Shared Package

| File | Purpose | Complexity |
|------|---------|------------|
| `shared/types/index.ts` | Common interfaces | Low |
| `shared/schemas/config.ts` | Extended config schema | Medium |
| `shared/schemas/script.ts` | Structured script schema | Medium |
| `shared/utils/errors.ts` | Error classes (copy from lib/) | Low |

### 6.2 Email Worker

| File | Purpose | Complexity |
|------|---------|------------|
| `workers/email-worker/src/index.ts` | Simplified handler | Low |
| `workers/email-worker/wrangler.toml` | Worker config | Low |

### 6.3 Processor

| File | Purpose | Complexity |
|------|---------|------------|
| `processor/src/index.ts` | Entry point, orchestrator | Medium |
| `processor/src/config/loader.ts` | S3-based config loader | Low |
| `processor/src/config/schema.ts` | Re-export from shared | Low |
| `processor/src/email/reader.ts` | List/get emails from R2 | Low |
| `processor/src/email/parser.ts` | Parse .eml with postal-mime | Low |
| `processor/src/content/extractor.ts` | Extract text (copy from lib/) | Low |
| `processor/src/content/filter.ts` | Keyword filtering (copy) | Low |
| `processor/src/script/generator.ts` | Claude API with JSON output | High |
| `processor/src/script/prompts.ts` | System/user prompts | Medium |
| `processor/src/script/validator.ts` | JSON schema validation | Low |
| `processor/src/audio/tts.ts` | OpenAI TTS per section | Medium |
| `processor/src/audio/ffmpeg.ts` | FFmpeg wrapper | High |
| `processor/src/audio/normalizer.ts` | Multi-level normalization | Medium |
| `processor/src/audio/assembler.ts` | Music integration | High |
| `processor/src/storage/r2-client.ts` | S3 SDK wrapper | Medium |
| `processor/src/storage/operations.ts` | High-level storage ops | Low |
| `processor/src/rss/generator.ts` | RSS feed (copy from lib/) | Low |
| `processor/src/utils/logger.ts` | Logging (copy from lib/) | Low |
| `processor/src/utils/retry.ts` | Retry logic (copy from lib/) | Low |
| `processor/src/utils/errors.ts` | Re-export from shared | Low |
| `processor/src/types/index.ts` | Local type definitions | Low |
| `processor/Dockerfile` | Container definition | Low |
| `processor/docker-compose.yml` | Compose config | Low |

---

## 7. Risks and Mitigations

### 7.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Claude outputs invalid JSON | High | Medium | Retry with explicit format reminder; validate with Zod |
| FFmpeg command construction errors | Medium | Low | Unit tests with mock spawn; test with real FFmpeg |
| R2 S3 compatibility issues | Medium | Low | Test with actual R2 during development |
| Memory issues with large audio | Medium | Low | Stream processing where possible; temp file cleanup |
| TTS rate limiting | Medium | Low | Retry with exponential backoff |

### 7.2 Operational Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Docker container fails silently | Medium | Medium | Structured logging; exit codes; monitoring |
| Cron doesn't trigger | Medium | Low | Health check endpoint; alerting |
| Old and new systems conflict | Medium | Low | Use different R2 paths during migration |

---

## 8. Testing Strategy

### 8.1 Unit Tests (Target: 80%+ coverage)

| Component | Test Focus |
|-----------|------------|
| `ffmpeg.ts` | Command construction, error handling |
| `r2-client.ts` | AWS SDK calls mocked |
| `script/validator.ts` | Schema validation edge cases |
| `audio/normalizer.ts` | LUFS measurement parsing |
| `audio/assembler.ts` | Filter chain construction |

### 8.2 Integration Tests

| Test | Scope |
|------|-------|
| Full pipeline | Mock Claude/OpenAI, real FFmpeg |
| R2 operations | Real R2 with test bucket |
| RSS generation | Validate against podcast XML spec |

### 8.3 Manual Validation

| Test | Criteria |
|------|----------|
| Volume consistency | < 3dB variance across episode |
| Transition quality | Smooth crossfades, no clicks |
| Content quality | Technical depth appropriate |
| Section timing | Correct order, no overlap |

---

## 9. Deployment

### 9.1 Docker Image Build

```dockerfile
FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

RUN mkdir -p /tmp/briefcast

ENV NODE_ENV=production
ENV TEMP_DIR=/tmp/briefcast

CMD ["node", "dist/index.js"]
```

### 9.2 Environment Variables

```bash
# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# R2 Configuration
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=briefcast-podcast

# Optional
LOG_LEVEL=info
TEMP_DIR=/tmp/briefcast
```

### 9.3 Cron Setup

```bash
# /etc/cron.d/briefcast
0 5 * * * root cd /opt/briefcast && docker-compose run --rm processor >> /var/log/briefcast.log 2>&1
```

---

## 10. Success Criteria Mapping

| Acceptance Criteria | Implementation |
|---------------------|----------------|
| AC-1: Volume consistency < 3dB | Multi-level LUFS normalization |
| AC-2: Clear audio transitions | FFmpeg crossfade filters |
| AC-3: Valid JSON script | Zod schema validation |
| AC-4: Dynamic episode length | Remove hard limits from prompts |
| AC-5: Technical audience tone | Updated system prompt |
| AC-6: Correct music positions | FFmpeg filter_complex assembly |
| AC-7: No audio clipping | True peak limiting to -1dB |
| AC-8: RSS backwards compatible | Keep same feed structure |
| AC-9: Workers < 10ms CPU | Minimal email worker |
| AC-10: Docker runs on user infra | Standard Node.js + FFmpeg |
| AC-11: Cron scheduling works | Host-level cron + Docker |

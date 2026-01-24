# Research: Sectioned Episodes with Audio Normalization

**Spec ID:** sections-intros
**Date:** 2026-01-12
**Author:** Architect Agent

---

## 1. Codebase Analysis

### 1.1 Current Architecture Overview

The existing codebase is a **monolithic Cloudflare Workers application** with the following structure:

```
src/
├── index.ts              # Entry point - routes to email/scheduled/API handlers
├── email-worker.ts       # Email ingestion handler
├── scheduled-worker.ts   # Cron-triggered podcast generation
├── api-worker.ts         # Manual control API
└── lib/
    ├── types.ts          # Core TypeScript interfaces
    ├── config-loader.ts  # YAML config with Zod validation
    ├── storage.ts        # KV + R2 storage operations
    ├── content-extractor.ts  # Email parsing (postal-mime), HTML cleaning
    ├── script-generator.ts   # Claude API integration
    ├── tts-generator.ts      # OpenAI TTS with token-based chunking
    ├── rss-generator.ts      # RSS feed generation (podcast library)
    ├── logger.ts         # Structured JSON logging
    ├── errors.ts         # Custom error hierarchy
    ├── retry.ts          # Exponential backoff with jitter
    └── auth.ts           # API authentication
```

### 1.2 Key Patterns Identified

#### Error Handling Pattern
```typescript
// Custom error hierarchy with context
export class BriefcastError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
  }
}

// Specialized errors: ConfigValidationError, ClaudeAPIError, TTSAPIError, StorageError, etc.
```

#### Retry Pattern
```typescript
// Exponential backoff with jitter, configurable predicate
async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>
```

#### Logging Pattern
```typescript
// Structured JSON with sanitization
const logger = createLogger('component-name');
logger.info('message', { context });
```

#### Storage Pattern
- **KV**: Temporary email storage with TTL (`EMAIL_STORE` namespace)
- **R2**: Persistent storage for audio, scripts, metadata, RSS, config (`PODCAST_BUCKET`)

### 1.3 Current Data Flow

```
Email → email-worker.ts → KV (raw email storage)
                              ↓
Cron → scheduled-worker.ts → Get emails from KV
                              ↓
                         Parse & extract content
                              ↓
                         Generate script (Claude API)
                              ↓
                         Generate audio (OpenAI TTS)
                              ↓
                         Store audio/metadata to R2
                              ↓
                         Update RSS feed
                              ↓
                         Delete processed emails from KV
```

### 1.4 Reusable Components

| Component | Location | Reusability | Notes |
|-----------|----------|-------------|-------|
| **Logger** | `lib/logger.ts` | High | Portable, no Workers dependencies |
| **Retry** | `lib/retry.ts` | High | Pure TypeScript, no dependencies |
| **Errors** | `lib/errors.ts` | High | Base error classes reusable |
| **Config Schema** | `lib/config-loader.ts` | Medium | Zod schemas reusable, loader needs adaptation for S3 |
| **Content Extractor** | `lib/content-extractor.ts` | High | Uses postal-mime (works in Node.js) |
| **RSS Generator** | `lib/rss-generator.ts` | High | Uses `podcast` library (works in Node.js) |
| **TTS Generator** | `lib/tts-generator.ts` | Medium | Logic reusable, chunking needs refactor for sections |
| **Script Generator** | `lib/script-generator.ts` | Low | Needs rewrite for structured JSON output |
| **Storage** | `lib/storage.ts` | Low | Uses Workers KV/R2 bindings, needs S3 SDK replacement |

### 1.5 Dependencies Analysis

| Package | Version | Workers | Node.js | Notes |
|---------|---------|---------|---------|-------|
| `postal-mime` | ^2.6.1 | Yes | Yes | Email parsing |
| `podcast` | ^2.0.1 | Yes | Yes | RSS generation |
| `js-yaml` | ^4.1.0 | Yes | Yes | Config parsing |
| `zod` | ^3.22.0 | Yes | Yes | Schema validation |
| `js-tiktoken` | ^1.0.15 | Yes | Yes | Token counting |

All current dependencies work in both Workers and Node.js environments.

---

## 2. Technical Risks and Considerations

### 2.1 High Risk: Audio Concatenation Without Normalization

**Current State**: TTS chunks are concatenated via byte array concatenation:
```typescript
function concatenateAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const result = new Uint8Array(totalLength);
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  return result.buffer;
}
```

**Problem**: This creates valid MP3 files but with:
- Variable volume between chunks
- No crossfade at boundaries
- Potential glitches at segment boundaries

**Mitigation**: FFmpeg will handle proper audio processing in Docker.

### 2.2 Medium Risk: Script Output Format Change

**Current State**: `generateScript()` returns plain text content:
```typescript
interface PodcastScript {
  id: string;
  date: Date;
  content: string;  // Plain text, unstructured
  wordCount: number;
  // ...
}
```

**New Requirement**: Structured JSON with sections:
```typescript
interface StructuredScript {
  date: string;
  episodeTitle: string;
  sections: Section[];  // intro, topic[], synthesis
}
```

**Mitigation**: 
1. Update Claude prompt to output JSON
2. Add JSON validation with Zod
3. Parse and validate before TTS generation

### 2.3 Medium Risk: Email Worker Simplification

**Current State**: Email worker does content processing:
- Parses email with postal-mime
- Checks allowlist
- Stores to KV
- Forwards email

**New Requirement**: Minimal processing (< 10ms CPU):
- Check allowlist (string matching only)
- Store raw .eml to R2
- Forward email

**Mitigation**: Move email parsing to Docker processor.

### 2.4 Low Risk: R2 S3 Access from Docker

**Consideration**: R2 is S3-compatible but has some quirks:
- Requires custom endpoint: `https://{account_id}.r2.cloudflarestorage.com`
- Uses "auto" region
- Some S3 features not supported (versioning, lifecycle)

**Mitigation**: Use official AWS S3 SDK with R2 endpoint configuration.

### 2.5 Low Risk: FFmpeg Availability

**Consideration**: FFmpeg must be available in Docker container.

**Mitigation**: Use `node:20-alpine` base image with `apk add ffmpeg`.

---

## 3. Technology Decisions

### 3.1 Docker Container Stack

| Technology | Version | Rationale |
|------------|---------|-----------|
| Node.js | 20 LTS | Match Workers compatibility, stable LTS |
| Alpine Linux | Latest | Small image size (~50MB base) |
| FFmpeg | 6.0+ | Latest stable, full codec support |
| TypeScript | 5.3+ | Match existing codebase |
| AWS SDK v3 | Latest | S3-compatible R2 access |

### 3.2 New Dependencies for Docker Processor

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.500.0",  // R2 S3 access
    "postal-mime": "^2.6.1",            // Reuse from Workers
    "podcast": "^2.0.1",                // Reuse from Workers
    "js-yaml": "^4.1.0",                // Reuse from Workers
    "zod": "^3.22.0",                   // Reuse from Workers
    "js-tiktoken": "^1.0.15",           // Reuse from Workers
    "dotenv": "^16.0.0"                 // Environment variables
  }
}
```

### 3.3 FFmpeg Strategy

**Multi-level normalization approach** per spec:
1. Per-chunk: Normalize each TTS API response to -16 LUFS
2. Per-section: Normalize concatenated section audio
3. Episode-wide: Final pass before music integration
4. Music: Normalize to -20 LUFS (4dB below speech)

**FFmpeg filter chain for loudnorm**:
```bash
# Two-pass for accuracy
ffmpeg -i input.mp3 -af loudnorm=print_format=json -f null -
ffmpeg -i input.mp3 -af loudnorm=I=-16:TP=-1:LRA=11:measured_I=...
```

---

## 4. Architecture Decisions

### 4.1 Repository Structure

Keep monorepo with clear separation:
```
briefcast/
├── workers/              # Cloudflare Workers (minimal)
│   └── email-worker/     # Email ingestion only
├── processor/            # Docker-based processor
│   └── src/              # All processing logic
├── shared/               # Shared types and utilities
├── specs/                # Specifications
└── docs/                 # Documentation
```

### 4.2 Shared Code Strategy

Create a `shared/` directory for code used by both Workers and Docker:
- Type definitions
- Error classes
- Zod schemas (config, script)
- Pure utility functions

### 4.3 Config Unification

Single `config.yaml` in R2, read by both:
- Email Worker: Via R2 binding (for allowlist)
- Docker Processor: Via S3 API

Extended schema to include audio normalization settings:
```yaml
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
```

---

## 5. Migration Considerations

### 5.1 Backwards Compatibility

- RSS feed format remains identical
- Episode file naming unchanged (`episodes/YYYY-MM-DD.mp3`)
- No breaking changes to podcast subscribers

### 5.2 Parallel Operation Phase

During migration:
1. Both old and new systems can run (reading from different sources)
2. Email Worker stores to both KV (old) and R2/pending-emails (new)
3. Easy rollback: re-enable old scheduled worker

### 5.3 Data Migration

No data migration needed:
- Existing episodes remain in R2
- RSS feed continues to work
- Only new episodes use new pipeline

---

## 6. Test Strategy

### 6.1 Unit Test Priorities

1. **FFmpeg Wrapper**: Mock spawned processes, verify command construction
2. **Script JSON Validation**: Test schema with valid/invalid inputs
3. **R2 S3 Client**: Mock AWS SDK calls
4. **Audio Assembly Logic**: Test filter chain construction

### 6.2 Integration Test Priorities

1. **End-to-end with mocked APIs**: Verify full pipeline
2. **Audio output validation**: Check file is valid MP3
3. **RSS feed generation**: Validate XML structure

### 6.3 Manual Validation

1. **Listen test**: Volume consistency across episode
2. **Transition quality**: Music fades sound natural
3. **Content quality**: Technical depth appropriate

---

## 7. Cost Analysis

### 7.1 Cloudflare Costs (Free Tier)

| Resource | Usage | Limit | Status |
|----------|-------|-------|--------|
| Workers CPU | < 10ms/invocation | 10ms | Compliant |
| R2 Storage | ~2GB (30 episodes) | 10GB | Compliant |
| R2 Ops (Class A) | ~100/day | 1M/month | Compliant |
| R2 Ops (Class B) | ~50/day | 10M/month | Compliant |
| R2 Egress | ~500MB/day | 10GB/month | Monitor |

### 7.2 API Costs (Unchanged)

| Service | Estimated | Notes |
|---------|-----------|-------|
| Claude API | €5-8/month | Based on current usage |
| OpenAI TTS | €5-10/month | Based on episode length |

### 7.3 Docker Costs

| Resource | Requirement | Notes |
|----------|-------------|-------|
| CPU | ~15 min/day | Uses existing homelab/VPS |
| Memory | 512MB-1GB | During FFmpeg processing |
| Storage | ~2GB temp | Cleaned after each run |

**Total: Stays within €15/month budget**

---

## 8. Open Questions (Resolved)

1. **Q: Should we use fluent-ffmpeg or raw spawned processes?**
   A: Raw spawn is simpler and more reliable for our use case.

2. **Q: How to handle very long episodes (> 45 min)?**
   A: Trust the dynamic duration system; 60 min absolute ceiling in prompt.

3. **Q: Single TTS call per section or per paragraph?**
   A: Per-section is cleaner and reduces API calls. Chunking only if section exceeds 2000 tokens.

4. **Q: Keep api-worker.ts functionality?**
   A: Out of scope for this spec. Can be added later if needed.

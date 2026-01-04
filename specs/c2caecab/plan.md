# Implementation Plan: Briefcast

**Spec ID:** c2caecab  
**Version:** 1.0  
**Date:** 2026-01-04  
**Status:** Ready for Implementation

---

## 1. Architecture Overview

### 1.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLOUDFLARE WORKERS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │  email-worker   │   │ scheduled-worker│   │   api-worker    │          │
│   │  (EmailMessage) │   │ (Cron Trigger)  │   │ (HTTP Requests) │          │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘          │
│            │                     │                     │                    │
│            ▼                     ▼                     ▼                    │
│   ┌──────────────────────────────────────────────────────────────┐         │
│   │                         src/lib/                              │         │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │         │
│   │  │content-      │  │script-       │  │tts-          │        │         │
│   │  │extractor.ts  │  │generator.ts  │  │generator.ts  │        │         │
│   │  └──────────────┘  └──────────────┘  └──────────────┘        │         │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │         │
│   │  │config-       │  │rss-          │  │storage.ts    │        │         │
│   │  │loader.ts     │  │generator.ts  │  │              │        │         │
│   │  └──────────────┘  └──────────────┘  └──────────────┘        │         │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │         │
│   │  │logger.ts     │  │errors.ts     │  │types.ts      │        │         │
│   │  └──────────────┘  └──────────────┘  └──────────────┘        │         │
│   │  ┌──────────────┐                                            │         │
│   │  │retry.ts      │                                            │         │
│   │  └──────────────┘                                            │         │
│   └──────────────────────────────────────────────────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                  │                    │                    │
                  ▼                    ▼                    ▼
        ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
        │ Cloudflare  │      │ Cloudflare  │      │ External    │
        │     KV      │      │     R2      │      │   APIs      │
        │ (newsletters)│      │ (audio,feed)│      │(Claude,Fish)│
        └─────────────┘      └─────────────┘      └─────────────┘
```

### 1.2 Data Flow

#### Automated Daily Flow
```
1. Newsletters arrive via email throughout day
   └─▶ email-worker.ts parses and stores in KV

2. Cron triggers at 05:00 UTC
   └─▶ scheduled-worker.ts fetches all newsletters for today

3. Content extraction
   └─▶ content-extractor.ts cleans HTML, extracts links

4. Script generation
   └─▶ script-generator.ts calls Claude API

5. Auto-approve check (if configured)
   ├─▶ YES: Proceed to TTS
   └─▶ NO: Store as pending, exit

6. TTS generation
   └─▶ tts-generator.ts calls Fish Audio API

7. Storage and feed update
   └─▶ storage.ts uploads audio to R2
   └─▶ rss-generator.ts updates feed.xml

8. Cleanup
   └─▶ Delete processed newsletters from KV
```

#### Manual Override Flow
```
1. User calls POST /api/generate
   └─▶ api-worker.ts authenticates request

2. Same extraction and script generation as automated flow
   └─▶ Script stored as pending in R2

3. User calls GET /api/pending to review
   └─▶ Returns list of pending scripts

4. User optionally edits via PUT /api/pending/:id
   └─▶ Updates script in R2

5. User calls POST /api/approve/:id
   └─▶ Triggers TTS generation and RSS update

6. Alternative: POST /api/reject/:id
   └─▶ Marks as rejected, optionally regenerates
```

### 1.3 Module Structure

```
briefcast/
├── src/
│   ├── index.ts                 # Main entry, exports all handlers
│   ├── email-worker.ts          # Email ingestion (export email handler)
│   ├── scheduled-worker.ts      # Cron job orchestration (export scheduled handler)
│   ├── api-worker.ts            # HTTP API for manual controls (export fetch handler)
│   └── lib/
│       ├── content-extractor.ts # HTML cleaning, link extraction
│       ├── script-generator.ts  # Claude API integration
│       ├── tts-generator.ts     # Fish Audio API integration
│       ├── storage.ts           # R2 operations (audio, pending, metadata)
│       ├── rss-generator.ts     # RSS feed generation with podcast package
│       ├── config-loader.ts     # YAML config loading and Zod validation
│       ├── logger.ts            # Structured JSON logging
│       ├── errors.ts            # Custom error classes
│       ├── retry.ts             # Retry with exponential backoff
│       ├── types.ts             # Shared TypeScript interfaces
│       └── auth.ts              # Authentication middleware
├── tests/
│   ├── unit/
│   │   ├── content-extractor.test.ts
│   │   ├── script-generator.test.ts
│   │   ├── config-loader.test.ts
│   │   ├── rss-generator.test.ts
│   │   └── ...
│   ├── integration/
│   │   ├── email-worker.test.ts
│   │   ├── scheduled-worker.test.ts
│   │   ├── api-worker.test.ts
│   │   └── end-to-end.test.ts
│   └── fixtures/
│       ├── emails/
│       │   ├── tldr-ai.eml
│       │   ├── the-batch.eml
│       │   └── ...
│       ├── config-valid.yaml
│       ├── config-invalid.yaml
│       └── claude-response.json
├── docs/
│   ├── setup/
│   │   ├── domain-setup.md
│   │   ├── api-keys.md
│   │   └── cloudflare-setup.md
│   ├── usage/
│   │   ├── configuration.md
│   │   ├── manual-workflow.md
│   │   ├── monitoring.md
│   │   └── scaling-cdn.md
│   └── troubleshooting.md
├── scripts/
│   ├── upload-config.sh         # Upload config.yaml to R2
│   ├── approve-script.sh        # CLI for script approval
│   ├── download-logs.sh         # Download Workers logs
│   └── test-workflow.sh         # Integration test script
├── wrangler.toml                # Cloudflare Workers configuration
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Vitest configuration
├── .eslintrc.cjs                # ESLint configuration
├── .prettierrc                  # Prettier configuration
├── .gitignore                   # Git ignore patterns
└── README.md                    # Project documentation
```

---

## 2. Technology Decisions

### 2.1 Confirmed Technology Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| **Runtime** | Cloudflare Workers | compat 2026-01-01 | Spec requirement, free tier |
| **Language** | TypeScript | 5.3+ | Constitution requirement (strict mode) |
| **Email Parsing** | postal-mime | 2.6.x | Workers-compatible, well-maintained |
| **RSS Generation** | podcast | 2.0.x | iTunes-compatible, simple API |
| **Config Parsing** | js-yaml | 4.1.x | Lightweight, safe by default |
| **Schema Validation** | zod | 3.22+ | TypeScript-first, detailed errors |
| **Testing** | Vitest + pool-workers | 3.x / 0.9+ | Official Cloudflare integration |
| **Coverage** | @vitest/coverage-v8 | Latest | V8 coverage in Workers |
| **Build Tool** | Wrangler | 3.100+ | Official Cloudflare CLI |
| **Linting** | ESLint | 9.x | Code quality |
| **Formatting** | Prettier | 3.x | Consistent style |

### 2.2 Package.json

```json
{
  "name": "briefcast",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "dev:scheduled": "wrangler dev --test-scheduled",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src tests",
    "lint:fix": "eslint src tests --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "upload-config": "./scripts/upload-config.sh"
  },
  "dependencies": {
    "postal-mime": "^2.6.0",
    "podcast": "^2.0.1",
    "js-yaml": "^4.1.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260101.0",
    "@cloudflare/vitest-pool-workers": "^0.9.0",
    "@types/js-yaml": "^4.0.9",
    "@vitest/coverage-v8": "^3.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.3.0",
    "vitest": "^3.0.0",
    "wrangler": "^3.100.0"
  }
}
```

### 2.3 TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules"]
}
```

---

## 3. Data Models

### 3.1 TypeScript Interfaces

```typescript
// src/lib/types.ts

// ============ Environment ============
export interface Env {
  // Bindings
  NEWSLETTER_KV: KVNamespace;
  PODCAST_BUCKET: R2Bucket;
  
  // Secrets
  ANTHROPIC_API_KEY: string;
  FISH_AUDIO_API_KEY: string;
  API_AUTH_TOKEN: string;
  
  // Variables
  R2_PUBLIC_URL: string;
}

// ============ Newsletter ============
export interface Newsletter {
  id: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  receivedAt: string; // ISO 8601
}

export interface ProcessedNewsletter extends Newsletter {
  cleanText: string;
  links: Link[];
}

export interface Link {
  title: string;
  url: string;
}

// ============ Script Generation ============
export interface ScriptResult {
  title: string;
  description: string;
  script: string;
  shownotes: string; // HTML
  wordCount: number;
}

// ============ Pending Scripts ============
export type PendingStatus = 'pending' | 'approved' | 'rejected';

export interface PendingScript {
  id: string;
  date: string; // YYYY-MM-DD
  script: string;
  shownotes: string;
  newsletters: Array<{
    id: string;
    subject: string;
    from: string;
  }>;
  createdAt: string; // ISO 8601
  status: PendingStatus;
  expiresAt: string; // ISO 8601
}

// ============ Episodes ============
export interface Episode {
  guid: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  shownotes: string; // HTML
  audioUrl: string;
  duration: string; // HH:MM:SS
  publishedAt: string; // ISO 8601
}

export interface PodcastMetadata {
  episodes: Episode[];
  lastUpdated: string; // ISO 8601
}

// ============ API Responses ============
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ============ Logging ============
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
}
```

### 3.2 Zod Configuration Schema

```typescript
// src/lib/config-loader.ts
import { z } from 'zod';

export const PodcastConfigSchema = z.object({
  title: z.string().min(1).max(255),
  author: z.string().min(1).max(255),
  description: z.string().min(1).max(4000),
  language: z.string().length(2).default('en'),
  max_episodes: z.number().int().min(1).max(100).default(30),
  category: z.string().default('Technology'),
  subcategory: z.string().default('Tech News'),
  explicit: z.boolean().default(false),
  type: z.enum(['episodic', 'serial']).default('episodic'),
  owner_name: z.string().min(1),
  owner_email: z.string().email(),
  copyright: z.string().optional(),
});

export const ScheduleConfigSchema = z.object({
  cron: z.string().regex(/^[\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+ [\d*,/-]+$/).default('0 5 * * *'),
  timezone: z.string().default('UTC'),
});

export const FilteringConfigSchema = z.object({
  include_topics: z.array(z.string()).default([]),
  exclude_topics: z.array(z.string()).default([]),
  exclude_keywords: z.array(z.string()).default([]),
  max_links_per_episode: z.number().int().min(1).max(50).default(20),
});

export const ScriptGenerationConfigSchema = z.object({
  model: z.string().default('claude-sonnet-4-5-20250929'),
  max_tokens: z.number().int().min(1000).max(32000).default(16000),
  temperature: z.number().min(0).max(1).default(1.0),
  min_word_count: z.number().int().min(500).max(5000).default(1000),
  max_word_count: z.number().int().min(500).max(5000).default(2000),
  target_duration_minutes: z.number().min(1).max(30).default(8),
  system_prompt: z.string().min(1),
  user_prompt_template: z.string().includes('{newsletters}'),
});

export const TTSConfigSchema = z.object({
  voice_id: z.string().min(1),
  model: z.string().default('s1'),
  format: z.enum(['mp3', 'wav', 'opus']).default('mp3'),
  bitrate: z.number().refine(v => [64, 128, 192].includes(v)).default(64),
  latency: z.enum(['normal', 'balanced', 'low']).default('normal'),
  chunk_length: z.number().int().min(100).max(300).default(300),
  normalize: z.boolean().default(true),
});

export const AutomationConfigSchema = z.object({
  auto_approve_scripts: z.boolean().default(false),
  skip_day_if_no_newsletters: z.boolean().default(true),
  retry_api_failures: z.boolean().default(true),
  max_retries: z.number().int().min(1).max(10).default(3),
});

export const NotificationsConfigSchema = z.object({
  webhook_url: z.string().url().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
});

export const CDNConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['cloudflare', 'bunny', 'cloudfront', 'fastly']).default('cloudflare'),
  custom_domain: z.string().optional().or(z.literal('')),
});

export const ConfigSchema = z.object({
  podcast: PodcastConfigSchema,
  schedule: ScheduleConfigSchema.default({}),
  filtering: FilteringConfigSchema.default({}),
  script_generation: ScriptGenerationConfigSchema,
  tts: TTSConfigSchema,
  automation: AutomationConfigSchema.default({}),
  notifications: NotificationsConfigSchema.default({}),
  cdn: CDNConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
```

### 3.3 R2 Directory Structure

```
briefcast-podcast/                  # R2 Bucket
├── config.yaml                     # Configuration file
│   Content-Type: text/yaml
│   Cache-Control: no-cache
│
├── cover.jpg                       # Podcast artwork
│   Content-Type: image/jpeg
│   Cache-Control: public, max-age=86400
│
├── feed.xml                        # RSS feed
│   Content-Type: application/rss+xml; charset=utf-8
│   Cache-Control: public, max-age=3600
│
├── metadata.json                   # Episode metadata
│   Content-Type: application/json
│   Cache-Control: no-cache
│
├── episodes/                       # Audio files
│   └── {YYYY-MM-DD}.mp3
│       Content-Type: audio/mpeg
│       Cache-Control: public, max-age=31536000
│       Custom-Metadata:
│         duration: "HH:MM:SS"
│         generated-at: ISO8601
│
└── pending/                        # Pending scripts
    └── {YYYY-MM-DD}-{uuid}.json
        Content-Type: application/json
        Cache-Control: no-cache
```

---

## 4. API Design

### 4.1 Email Worker (No HTTP Endpoints)

Triggered by Cloudflare Email Routing when email arrives at configured address.

```typescript
// Handler signature
async email(message: EmailMessage, env: Env, ctx: ExecutionContext): Promise<void>
```

### 4.2 Scheduled Worker (No HTTP Endpoints)

Triggered by Cloudflare Cron Trigger at configured time.

```typescript
// Handler signature
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void>
```

### 4.3 Manual Control API

All endpoints require authentication via `Authorization: Bearer {API_AUTH_TOKEN}` header.

#### Generate Episode
```
POST /api/generate

Request: (empty body)

Response 200:
{
  "success": true,
  "data": {
    "pendingId": "2026-01-04-abc123",
    "message": "Script generated and awaiting approval"
  }
}

Response 400:
{
  "success": false,
  "error": {
    "code": "NO_NEWSLETTERS",
    "message": "No newsletters found for today"
  }
}
```

#### List Pending Scripts
```
GET /api/pending

Response 200:
{
  "success": true,
  "data": {
    "pending": [
      {
        "id": "2026-01-04-abc123",
        "date": "2026-01-04",
        "createdAt": "2026-01-04T05:00:00Z",
        "status": "pending",
        "newsletterCount": 5,
        "wordCount": 1523
      }
    ]
  }
}
```

#### Get Pending Script Details
```
GET /api/pending/:id

Response 200:
{
  "success": true,
  "data": {
    "id": "2026-01-04-abc123",
    "date": "2026-01-04",
    "script": "Today in AI news...",
    "shownotes": "<h3>Topics Covered</h3>...",
    "newsletters": [
      { "id": "...", "subject": "TLDR AI", "from": "dan@tldrnewsletter.com" }
    ],
    "createdAt": "2026-01-04T05:00:00Z",
    "status": "pending"
  }
}

Response 404:
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Pending script not found"
  }
}
```

#### Update Pending Script
```
PUT /api/pending/:id

Request:
{
  "script": "Updated script text...",
  "shownotes": "<h3>Updated Topics</h3>..."  // optional
}

Response 200:
{
  "success": true,
  "data": {
    "id": "2026-01-04-abc123",
    "message": "Script updated"
  }
}
```

#### Approve Pending Script
```
POST /api/approve/:id

Request: (empty body)

Response 200:
{
  "success": true,
  "data": {
    "episodeDate": "2026-01-04",
    "audioUrl": "https://podcast.example.com/episodes/2026-01-04.mp3",
    "message": "Episode published"
  }
}

Response 500:
{
  "success": false,
  "error": {
    "code": "TTS_FAILED",
    "message": "Fish Audio API error: 500"
  }
}
```

#### Reject Pending Script
```
POST /api/reject/:id

Request:
{
  "regenerate": true  // optional, default false
}

Response 200:
{
  "success": true,
  "data": {
    "id": "2026-01-04-abc123",
    "message": "Script rejected",
    "newPendingId": "2026-01-04-def456"  // if regenerate=true
  }
}
```

#### Delete Pending Script
```
DELETE /api/pending/:id

Response 200:
{
  "success": true,
  "data": {
    "message": "Pending script deleted"
  }
}
```

### 4.4 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `RATE_LIMITED` | 429 | Too many requests |
| `NOT_FOUND` | 404 | Resource not found |
| `NO_NEWSLETTERS` | 400 | No newsletters to process |
| `CONFIG_ERROR` | 500 | Configuration validation failed |
| `CLAUDE_API_ERROR` | 502 | Claude API call failed |
| `FISH_API_ERROR` | 502 | Fish Audio API call failed |
| `STORAGE_ERROR` | 500 | R2 storage operation failed |
| `INTERNAL_ERROR` | 500 | Unexpected error |

---

## 5. Implementation Strategy

### 5.1 Phase Breakdown

The implementation is organized into 8 phases with explicit dependencies.

```
Phase 1: Project Foundation
    └─▶ Phase 2: Core Library Functions
            ├─▶ Phase 3: Email Worker
            └─▶ Phase 4: Scheduled Worker
                    └─▶ Phase 5: API Worker
                            └─▶ Phase 6: Integration Testing
                                    └─▶ Phase 7: Documentation
                                            └─▶ Phase 8: Deployment
```

### 5.2 Detailed Phase Plan

#### Phase 1: Project Foundation (Tasks 1-8)

**Goal:** Establish project structure, tooling, and configuration.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-001 | Initialize npm project with package.json | 30min | None |
| T-002 | Configure TypeScript (tsconfig.json) | 30min | T-001 |
| T-003 | Configure Wrangler (wrangler.toml) | 45min | T-001 |
| T-004 | Configure Vitest for Workers | 45min | T-001, T-002 |
| T-005 | Configure ESLint and Prettier | 30min | T-001 |
| T-006 | Create src directory structure | 15min | T-001 |
| T-007 | Create tests directory structure | 15min | T-004 |
| T-008 | Create default config.yaml | 30min | T-003 |

**Deliverables:**
- Working `npm install`, `npm test`, `npm run dev`
- TypeScript strict mode passing
- Vitest running in Workers pool
- ESLint and Prettier configured

#### Phase 2: Core Library Functions (Tasks 9-19)

**Goal:** Implement reusable library modules with unit tests.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-009 | Implement types.ts (all interfaces) | 45min | T-006 |
| T-010 | Implement errors.ts (custom error classes) | 30min | T-009 |
| T-011 | Implement logger.ts (structured logging) | 45min | T-009 |
| T-012 | Implement retry.ts (exponential backoff) | 30min | T-009 |
| T-013 | Implement config-loader.ts (Zod schemas) | 1h | T-009, T-010 |
| T-014 | Implement content-extractor.ts | 1.5h | T-009 |
| T-015 | Implement script-generator.ts | 2h | T-009, T-010, T-012 |
| T-016 | Implement tts-generator.ts | 1.5h | T-009, T-010, T-012 |
| T-017 | Implement storage.ts (R2 operations) | 1.5h | T-009, T-010 |
| T-018 | Implement rss-generator.ts | 1.5h | T-009, T-017 |
| T-019 | Implement auth.ts (middleware) | 45min | T-009 |

**Unit Test Requirements (per task):**
- Happy path scenarios
- Error handling paths
- Edge cases (empty inputs, malformed data)
- Mocked external dependencies

**Deliverables:**
- All lib/ modules implemented
- Unit tests with 80%+ coverage per module
- No linting errors

#### Phase 3: Email Worker (Tasks 20-23)

**Goal:** Implement email ingestion with tests.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-020 | Implement email-worker.ts | 1.5h | T-009, T-011, T-017 |
| T-021 | Create email test fixtures | 1h | T-007 |
| T-022 | Unit tests for email parsing | 1h | T-020, T-021 |
| T-023 | Integration test for email → KV flow | 1h | T-020, T-022 |

**Deliverables:**
- Email worker receiving and storing emails
- 100% coverage on email-worker.ts (critical path)
- Test fixtures for common newsletter formats

#### Phase 4: Scheduled Worker (Tasks 24-28)

**Goal:** Implement daily cron job with end-to-end flow.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-024 | Implement scheduled-worker.ts orchestration | 2h | T-013 thru T-018 |
| T-025 | Unit tests for orchestration logic | 1.5h | T-024 |
| T-026 | Integration test: cron → script generation | 1h | T-024 |
| T-027 | Integration test: full flow with mocked APIs | 2h | T-024 |
| T-028 | Test auto-approve vs manual-approve paths | 1h | T-024 |

**Deliverables:**
- Scheduled worker processing newsletters
- 100% coverage on scheduled-worker.ts (critical path)
- Both automation modes tested

#### Phase 5: API Worker (Tasks 29-35)

**Goal:** Implement manual control API with authentication.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-029 | Implement api-worker.ts router | 1h | T-019 |
| T-030 | Implement POST /api/generate | 1h | T-029, T-024 |
| T-031 | Implement GET /api/pending endpoints | 1h | T-029, T-017 |
| T-032 | Implement PUT /api/pending/:id | 45min | T-029, T-017 |
| T-033 | Implement POST /api/approve/:id | 1.5h | T-029, T-016, T-017, T-018 |
| T-034 | Implement POST /api/reject/:id | 45min | T-029, T-017 |
| T-035 | API endpoint tests (all routes) | 2h | T-029 thru T-034 |

**Deliverables:**
- All API endpoints functional
- 100% coverage on api-worker.ts (critical path)
- Authentication tested
- Rate limiting implemented

#### Phase 6: Integration Testing (Tasks 36-40)

**Goal:** End-to-end testing and coverage verification.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-036 | Full end-to-end test: email → podcast | 2h | Phases 3-5 |
| T-037 | Test with real newsletter fixtures | 1.5h | T-036 |
| T-038 | Edge case tests (empty, malformed, errors) | 1.5h | T-036 |
| T-039 | Coverage report and gap analysis | 1h | T-036 thru T-038 |
| T-040 | Fill coverage gaps to meet 80%/100% | 2h | T-039 |

**Deliverables:**
- 80%+ overall coverage
- 100% on critical paths
- All edge cases covered
- CI-ready test suite

#### Phase 7: Documentation (Tasks 41-48)

**Goal:** Comprehensive documentation suite.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-041 | docs/setup/domain-setup.md | 1h | Phase 6 |
| T-042 | docs/setup/api-keys.md | 45min | Phase 6 |
| T-043 | docs/setup/cloudflare-setup.md | 1h | Phase 6 |
| T-044 | docs/usage/configuration.md | 1.5h | T-013 |
| T-045 | docs/usage/manual-workflow.md | 1h | Phase 5 |
| T-046 | docs/usage/monitoring.md | 45min | Phase 6 |
| T-047 | docs/usage/scaling-cdn.md | 1h | Phase 6 |
| T-048 | docs/troubleshooting.md | 1h | Phase 6 |

**Deliverables:**
- Complete setup guides
- Complete usage guides
- Troubleshooting guide

#### Phase 8: Deployment (Tasks 49-52)

**Goal:** Production deployment and validation.

| Task ID | Task | Effort | Dependencies |
|---------|------|--------|--------------|
| T-049 | Create helper scripts (upload-config, etc.) | 1h | Phase 7 |
| T-050 | Update README.md with full documentation | 1h | Phase 7 |
| T-051 | Final deployment checklist and dry run | 1h | T-049, T-050 |
| T-052 | Production deployment and smoke test | 1h | T-051 |

**Deliverables:**
- Helper scripts working
- README complete
- Production deployment successful

---

## 6. Critical Path Analysis

### 6.1 Critical Path Tasks

The critical path determines the minimum time to completion:

```
T-001 → T-002 → T-009 → T-013 → T-014 → T-015 → T-024 → T-036 → T-041 → T-052
```

**Critical Path Duration:** ~20 hours (across all phases)

### 6.2 Blocking Dependencies

| Blocker | Blocked Tasks | Risk | Mitigation |
|---------|---------------|------|------------|
| T-009 (types.ts) | All lib/ modules | Low | Simple to implement early |
| T-013 (config-loader) | T-024 (scheduled worker) | Medium | Mock config in tests initially |
| T-015 (script-generator) | T-024, T-030 | Medium | Use response fixtures |
| T-016 (tts-generator) | T-033 | Medium | Mock in tests |
| T-024 (scheduled-worker) | All Phase 5 approval flow | High | Prioritize early |

### 6.3 Parallelization Opportunities

Tasks that can run in parallel (up to 6 agents):

**Parallel Group A (after T-009):**
- T-010, T-011, T-012 (errors, logger, retry)

**Parallel Group B (after T-010):**
- T-014, T-015, T-016, T-017, T-018, T-019 (all lib modules)

**Parallel Group C (after Phase 2):**
- T-020-T-023 (email worker)
- T-029-T-035 (API worker - partial)

**Parallel Group D (Phase 7):**
- All documentation tasks (T-041 thru T-048)

---

## 7. Testing Strategy

### 7.1 Test Categories

| Category | Location | Purpose | Coverage Target |
|----------|----------|---------|-----------------|
| **Unit Tests** | `tests/unit/` | Individual function testing | 80%+ |
| **Integration Tests** | `tests/integration/` | Component interaction | 100% critical paths |
| **Fixture Tests** | Uses `tests/fixtures/` | Real-world data testing | All newsletter formats |
| **Edge Case Tests** | Within both | Error conditions | All documented errors |

### 7.2 Critical Path Coverage (100% Required)

| Component | Test Focus |
|-----------|------------|
| `email-worker.ts` | Email parsing, KV storage, error handling |
| `scheduled-worker.ts` | Orchestration, all code paths, error recovery |
| `script-generator.ts` | API calls, response parsing, retry logic |
| `tts-generator.ts` | API calls, binary handling, retry logic |
| `config-loader.ts` | Schema validation, all error types |
| `api-worker.ts` | All endpoints, auth, rate limiting |

### 7.3 Test Fixtures Required

```
tests/fixtures/
├── emails/
│   ├── tldr-ai.eml           # Real TLDR AI newsletter
│   ├── the-batch.eml         # Real The Batch newsletter
│   ├── import-ai.eml         # Real Import AI newsletter
│   ├── multipart-mixed.eml   # Complex MIME structure
│   ├── plain-text-only.eml   # No HTML body
│   ├── image-heavy.eml       # Newsletter with many images
│   └── malformed.eml         # Invalid MIME for error testing
├── config/
│   ├── valid-full.yaml       # All options specified
│   ├── valid-minimal.yaml    # Only required fields
│   ├── invalid-schema.yaml   # Schema violation
│   └── invalid-yaml.yaml     # Syntax error
└── api-responses/
    ├── claude-success.json   # Normal Claude response
    ├── claude-rate-limit.json# Rate limit error
    └── fish-success.mp3      # Sample audio (small)
```

### 7.4 Vitest Configuration

```typescript
// vitest.config.ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          kvNamespaces: ['NEWSLETTER_KV'],
          r2Buckets: ['PODCAST_BUCKET'],
          bindings: {
            ANTHROPIC_API_KEY: 'test-key',
            FISH_AUDIO_API_KEY: 'test-key',
            API_AUTH_TOKEN: 'test-token',
            R2_PUBLIC_URL: 'https://test.example.com',
          },
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        global: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
});
```

---

## 8. Deployment Strategy

### 8.1 Wrangler Configuration

```toml
# wrangler.toml
name = "briefcast"
main = "src/index.ts"
compatibility_date = "2026-01-01"
compatibility_flags = ["nodejs_compat"]

# Cron trigger - daily at 05:00 UTC (06:00 CET)
[triggers]
crons = ["0 5 * * *"]

# HTTP routes for API
[[routes]]
pattern = "briefcast.yourdomain.com/api/*"
zone_name = "yourdomain.com"

# R2 bucket
[[r2_buckets]]
binding = "PODCAST_BUCKET"
bucket_name = "briefcast-podcast"

# KV namespace
[[kv_namespaces]]
binding = "NEWSLETTER_KV"
id = "YOUR_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_NAMESPACE_ID"

# Environment variables
[vars]
R2_PUBLIC_URL = "https://podcast.yourdomain.com"

# Build settings
[build]
command = "npm run build"
[build.upload]
format = "modules"
main = "./dist/index.js"
```

### 8.2 Secrets Management

**Production Secrets (via wrangler secret put):**
```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put FISH_AUDIO_API_KEY
wrangler secret put API_AUTH_TOKEN
```

**Local Development (.dev.vars):**
```
ANTHROPIC_API_KEY=sk-ant-...
FISH_AUDIO_API_KEY=...
API_AUTH_TOKEN=your-local-test-token
```

### 8.3 Deployment Checklist

**Pre-Deployment:**
- [ ] All tests pass with 80%+ coverage
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
- [ ] Secrets configured in Cloudflare
- [ ] R2 bucket created and public
- [ ] KV namespace created
- [ ] Email routing configured
- [ ] Domain DNS configured
- [ ] config.yaml uploaded to R2
- [ ] cover.jpg uploaded to R2

**Deployment:**
```bash
# Deploy to production
wrangler deploy

# Verify deployment
wrangler tail  # Watch logs

# Test email routing
# Send test email to newsletters@yourdomain.com

# Test API
curl -X GET https://briefcast.yourdomain.com/api/pending \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test scheduled trigger (manual)
wrangler dev --test-scheduled
```

**Post-Deployment:**
- [ ] Verify email ingestion working
- [ ] Verify API endpoints accessible
- [ ] Monitor first cron trigger
- [ ] Validate RSS feed in podcast apps
- [ ] Check Cloudflare dashboard for errors

---

## 9. Risks and Mitigations

### 9.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Workers CPU time limits** | High | High | Monitor usage, upgrade to paid ($5/mo) if needed |
| **Fish Audio costs over budget** | Medium | High | Target shorter scripts (5-6 min), optimize prompts |
| **Claude prompt quality** | Medium | Medium | Iterate on prompts, allow manual editing |
| **Newsletter HTML variations** | High | Low | Robust extraction with fallbacks |
| **R2 egress limits** | Low | Medium | Enable Cloudflare CDN if approaching limit |

### 9.2 Schedule Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **API changes during development** | Low | Medium | Pin dependency versions, test on upgrade |
| **Testing coverage gaps** | Medium | Medium | Continuous coverage monitoring |
| **Integration complexity** | Medium | Medium | Early integration testing in Phase 4 |

### 9.3 Contingency Plans

**If Workers CPU time exceeded:**
1. Upgrade to Workers Paid ($5/month) - increases CPU time limit
2. If still insufficient, split processing across multiple invocations

**If Fish Audio costs too high:**
1. Reduce target script length to 5 minutes (~800 words)
2. Use 64kbps bitrate (already planned)
3. Consider alternative TTS (ElevenLabs, Azure, Google)

**If Claude output quality inconsistent:**
1. Iterate on system prompt
2. Add output validation with regeneration
3. Enable manual review by default

---

## 10. Development Workflow

### 10.1 Git Worktree Usage

```bash
# Phase 1: Foundation
git worktree add .worktrees/c2caecab-foundation -b spec/c2caecab/foundation

# Phase 2: Core libraries (can parallelize)
git worktree add .worktrees/c2caecab-config -b spec/c2caecab/config-loader
git worktree add .worktrees/c2caecab-content -b spec/c2caecab/content-extractor
git worktree add .worktrees/c2caecab-script -b spec/c2caecab/script-generator
# ... etc

# Merge completed work
git checkout main
git merge spec/c2caecab/foundation
git merge spec/c2caecab/config-loader
# ... etc

# Cleanup
git worktree remove .worktrees/c2caecab-foundation
```

### 10.2 Branch Naming

```
spec/{spec-id}/{component}

Examples:
spec/c2caecab/foundation
spec/c2caecab/config-loader
spec/c2caecab/content-extractor
spec/c2caecab/script-generator
spec/c2caecab/tts-generator
spec/c2caecab/storage
spec/c2caecab/rss-generator
spec/c2caecab/email-worker
spec/c2caecab/scheduled-worker
spec/c2caecab/api-worker
spec/c2caecab/integration-tests
spec/c2caecab/docs
```

### 10.3 Commit Message Format

```
{type}({scope}): {description}

Types: feat, fix, test, docs, refactor, chore
Scope: component name (config, content, script, tts, api, etc.)

Examples:
feat(config): add Zod schema validation for config.yaml
test(script-generator): add unit tests for Claude API integration
docs(setup): add domain configuration guide
fix(email-worker): handle missing subject line gracefully
```

### 10.4 Testing During Development

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/unit/config-loader.test.ts

# Run with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint
```

---

## 11. Summary

### 11.1 Effort Estimation

| Phase | Tasks | Estimated Hours |
|-------|-------|-----------------|
| Phase 1: Foundation | 8 | 4h |
| Phase 2: Core Libraries | 11 | 12h |
| Phase 3: Email Worker | 4 | 4.5h |
| Phase 4: Scheduled Worker | 5 | 7.5h |
| Phase 5: API Worker | 7 | 8h |
| Phase 6: Integration Testing | 5 | 8h |
| Phase 7: Documentation | 8 | 8h |
| Phase 8: Deployment | 4 | 4h |
| **Total** | **52** | **56h** |

### 11.2 Key Success Criteria

- [ ] All 52 tasks completed
- [ ] 80%+ overall test coverage
- [ ] 100% coverage on critical paths (6 components)
- [ ] TypeScript strict mode passing
- [ ] ESLint passing
- [ ] All documentation complete
- [ ] RSS feed validates in Cast Feed Validator
- [ ] Episodes playable in Overcast, Pocket Casts
- [ ] Monthly cost < EUR15

### 11.3 Ready for Task Generation

This plan is ready for `/specflow.tasks` to generate executable database tasks.

---

**End of Implementation Plan**

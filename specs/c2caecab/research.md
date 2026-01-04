# Technical Research Document: Briefcast

**Spec ID:** c2caecab  
**Version:** 1.0  
**Date:** 2026-01-04  
**Status:** Complete

---

## 1. Codebase Analysis

### 1.1 Current State

The project is an **empty repository** requiring full initialization. Current files:

| Path | Purpose |
|------|---------|
| `README.md` | Placeholder (1 line) |
| `CLAUDE.md` | Claude Code project instructions |
| `.specflow/constitution.md` | Project principles and constraints |
| `specs/c2caecab/` | Specification directory with PRD, spec, clarifications |
| `.worktrees/` | Git worktree directory (empty, gitignored) |

### 1.2 Initialization Requirements

The project needs complete setup:

1. **Package initialization**: `package.json`, dependencies, scripts
2. **TypeScript configuration**: `tsconfig.json` with strict mode
3. **Wrangler configuration**: `wrangler.toml` for Cloudflare Workers
4. **Source directory structure**: `src/` with modular organization
5. **Test infrastructure**: Vitest with Cloudflare Workers pool
6. **Documentation directory**: `docs/` with setup and usage guides
7. **Helper scripts**: `scripts/` for common operations
8. **Linting and formatting**: ESLint, Prettier configuration

### 1.3 No Existing Patterns to Follow

Since this is a greenfield project, patterns will be established based on:
- Cloudflare Workers TypeScript best practices
- Constitution constraints (serverless-first, modular, testable)
- Specification requirements

---

## 2. Technology Stack Decisions

### 2.1 Runtime Environment

| Technology | Version | Rationale |
|------------|---------|-----------|
| **Cloudflare Workers** | Latest (2026-01-01 compat date) | Spec requirement; free tier sufficient |
| **TypeScript** | 5.3+ | Constitution requires strict mode |
| **Node.js** | 20+ (local dev) | Required for wrangler CLI and testing |

**Key Considerations:**
- Workers use V8 isolates, not Node.js runtime
- No native Node.js modules (fs, path, etc.) unless using `nodejs_compat`
- 128MB memory limit per request
- 30-second CPU time limit (configurable for cron)
- Bundle size matters for cold starts

### 2.2 Build and Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **Wrangler** | 3.100+ | Cloudflare Workers CLI |
| **Vitest** | 3.x | Testing framework |
| **@cloudflare/vitest-pool-workers** | 0.9+ | Workers-specific test pool |
| **ESLint** | 9.x | Linting |
| **Prettier** | 3.x | Code formatting |

### 2.3 Cloudflare Services

| Service | Tier | Usage | Limit |
|---------|------|-------|-------|
| **Workers** | Free | HTTP handlers, cron, email | 100k requests/day |
| **R2** | Free | Audio files, RSS feed, config | 10GB storage, 10GB egress/month |
| **KV** | Free | Temporary email storage | 100k reads, 1k writes/day |
| **Email Routing** | Free | Email ingestion | Included with domain |

**Cost Analysis:**
- All Cloudflare services within free tier for single-user usage
- No risk of exceeding limits with daily batch processing

---

## 3. Dependencies Analysis

### 3.1 Production Dependencies

| Package | Version | Size | Workers Compatible | Purpose |
|---------|---------|------|-------------------|---------|
| **postal-mime** | 2.6.x | ~50KB | Yes | Email MIME parsing |
| **podcast** | 2.0.x | ~15KB | Yes | RSS feed generation |
| **js-yaml** | 4.1.x | ~45KB | Yes | YAML configuration parsing |
| **zod** | 3.22+ | ~60KB | Yes | Schema validation |

**Total bundle impact:** ~170KB (acceptable for Workers)

#### postal-mime Analysis
- **Repository:** [postalsys/postal-mime](https://github.com/postalsys/postal-mime)
- **Maintenance:** Active (updated 7 days ago)
- **Workers support:** Explicit (browser + serverless)
- **Key features:**
  - Parses RFC822 emails to structured objects
  - Handles multipart MIME, attachments
  - TypeScript types included
- **Usage pattern:**
  ```typescript
  import PostalMime from 'postal-mime';
  const email = await PostalMime.parse(rawEmailBuffer);
  // email.subject, email.html, email.text, email.attachments
  ```

#### podcast Analysis
- **Repository:** [maxnowack/node-podcast](https://github.com/maxnowack/node-podcast)
- **Maintenance:** Stable (mature package)
- **Workers support:** Yes (no Node.js-specific APIs)
- **Key features:**
  - iTunes/Apple Podcasts compatible
  - Full podcast namespace support
  - Enclosure handling for audio
- **Usage pattern:**
  ```typescript
  import { Podcast } from 'podcast';
  const feed = new Podcast({ title: '...', itunesCategory: [...] });
  feed.addItem({ title: '...', enclosure: { url: '...' } });
  const xml = feed.buildXml();
  ```

#### js-yaml Analysis
- **Repository:** [nodeca/js-yaml](https://github.com/nodeca/js-yaml)
- **Maintenance:** Stable, widely used
- **Workers support:** Yes (pure JavaScript)
- **Key features:**
  - YAML 1.1 parser/dumper
  - Safe loading by default (no code execution)
- **Security note:** Use `yaml.load()` with explicit schema, not `loadAll()`

#### zod Analysis
- **Repository:** [colinhacks/zod](https://github.com/colinhacks/zod)
- **Maintenance:** Very active (TypeScript-first validation)
- **Workers support:** Yes (pure TypeScript)
- **Key features:**
  - Runtime schema validation with TypeScript inference
  - Detailed error messages
  - Composable schemas
- **Usage for config validation:**
  ```typescript
  const ConfigSchema = z.object({
    podcast: z.object({
      title: z.string().min(1),
      max_episodes: z.number().int().positive().default(30),
    }),
    // ...
  });
  type Config = z.infer<typeof ConfigSchema>;
  ```

### 3.2 Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **@cloudflare/workers-types** | 4.x | TypeScript types for Workers |
| **@cloudflare/vitest-pool-workers** | 0.9+ | Vitest pool for Workers runtime |
| **@types/js-yaml** | 4.0.x | TypeScript types for js-yaml |
| **vitest** | 3.x | Testing framework |
| **typescript** | 5.3+ | TypeScript compiler |
| **wrangler** | 3.100+ | Cloudflare Workers CLI |
| **eslint** | 9.x | Linting |
| **prettier** | 3.x | Formatting |
| **c8** or **@vitest/coverage-v8** | Latest | Code coverage |

### 3.3 Dependency Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| postal-mime breaking changes | Medium | Pin minor version, test on upgrade |
| podcast package unmaintained | Low | Stable API, could fork if needed |
| Zod major version changes | Low | Pin major version |
| Workers types lag behind runtime | Low | Use latest, test in wrangler dev |

---

## 4. Cloudflare Workers Architecture Patterns

### 4.1 Recommended Patterns

Based on [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/):

#### ES Modules Format (Required)
```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // HTTP handler
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Cron handler
  },
  async email(message: EmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // Email handler
  },
};
```

#### Environment Binding Pattern
```typescript
interface Env {
  // KV Namespace
  NEWSLETTER_KV: KVNamespace;
  // R2 Bucket
  PODCAST_BUCKET: R2Bucket;
  // Secrets (set via wrangler secret put)
  ANTHROPIC_API_KEY: string;
  FISH_AUDIO_API_KEY: string;
  API_AUTH_TOKEN: string;
  // Variables (set in wrangler.toml)
  R2_PUBLIC_URL: string;
}
```

#### Dependency Injection for Testing
```typescript
// lib/script-generator.ts
export async function generateScript(
  newsletters: Newsletter[],
  config: ScriptConfig,
  anthropicClient: AnthropicClient, // Injected for testing
): Promise<ScriptResult> {
  // ...
}
```

#### Error Handling with Custom Errors
```typescript
// lib/errors.ts
export class ConfigValidationError extends Error {
  constructor(public details: z.ZodError) {
    super(`Configuration validation failed: ${details.message}`);
    this.name = 'ConfigValidationError';
  }
}

export class ClaudeAPIError extends Error {
  constructor(
    public statusCode: number,
    public responseBody: string,
  ) {
    super(`Claude API error: ${statusCode}`);
    this.name = 'ClaudeAPIError';
  }
}
```

### 4.2 Anti-Patterns to Avoid

| Anti-Pattern | Why | Instead |
|--------------|-----|---------|
| Global mutable state | Workers may be recycled | Pass state via env/context |
| Synchronous file I/O | Not available in Workers | Use R2/KV async APIs |
| Long-running connections | Workers time out | Use stateless request/response |
| Heavy initialization | Cold start penalty | Lazy initialization |
| Console.log for production | Limited visibility | Structured JSON logging |

### 4.3 Workers-Specific Considerations

#### CPU Time Limits
- Standard requests: 10-50ms (burst to 30s for Cron Triggers on paid plan)
- Cron Triggers on free tier: 10ms CPU time limit
- **Mitigation:** Process newsletters in batches, optimize API calls

**Important Discovery:** The free tier has a 10ms CPU time limit even for cron triggers. This may require:
1. Upgrading to Workers Paid ($5/month) for longer execution, OR
2. Breaking processing into smaller chunks with multiple cron triggers, OR
3. Using Workers Unbound for longer CPU time

**Recommendation:** Start with free tier, monitor CPU time usage, upgrade if needed.

#### Memory Limits
- 128MB per Worker instance
- Sufficient for email parsing and API responses
- Audio files streamed (not held in memory)

#### Request Size Limits
- 100MB request body (sufficient for email ingestion)
- Response streaming supported (for audio generation)

---

## 5. External API Integration

### 5.1 Claude API (Anthropic)

**Endpoint:** `https://api.anthropic.com/v1/messages`

**Authentication:**
- Header: `x-api-key: {ANTHROPIC_API_KEY}`
- Header: `anthropic-version: 2023-06-01`

**Request Structure:**
```typescript
interface ClaudeRequest {
  model: string;           // "claude-sonnet-4-5-20250929"
  max_tokens: number;      // Up to 8192 for most models
  system?: string;         // System prompt
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;    // 0.0-1.0, default 1.0
}
```

**Response Structure:**
```typescript
interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
```

**Error Handling:**
- 400: Bad request (invalid parameters)
- 401: Authentication failed
- 429: Rate limited (implement backoff)
- 500: Server error (retry with backoff)
- 529: Overloaded (retry with backoff)

**Cost Estimation:**
- Claude Sonnet 4.5: ~$3/million input tokens, ~$15/million output tokens
- Daily usage: ~50k input tokens (newsletters), ~3k output tokens (script)
- Monthly cost: ~$5-8 (within budget)

### 5.2 Fish Audio API

**Endpoint:** `https://api.fish.audio/v1/tts`

**Authentication:**
- Header: `Authorization: Bearer {FISH_AUDIO_API_KEY}`
- Header: `model: s1` (OpenAudio S1)

**Request Structure:**
```typescript
interface FishAudioRequest {
  text: string;              // Script text
  reference_id: string;      // Voice model ID
  format: 'mp3' | 'wav' | 'opus';
  mp3_bitrate?: 64 | 128 | 192;
  latency: 'normal' | 'balanced' | 'low';
  chunk_length: number;      // 100-300
  normalize: boolean;
}
```

**Response:**
- Content-Type: `audio/mpeg` (for mp3)
- Body: Binary audio data (streamed)

**Cost Estimation:**
- ~$0.15 per 1,000 characters (~$1 per episode at 8,000 characters)
- Monthly cost: ~$30 episodes * $1 = ~$30 (over budget)

**Cost Optimization Needed:**
- Reduce script length (target 5-6 minutes instead of 8-10)
- Use 64kbps bitrate (smaller files, same API cost but less bandwidth)
- Consider Fish Audio pricing tiers

### 5.3 Rate Limiting Strategy

```typescript
// lib/retry.ts
interface RetryConfig {
  maxRetries: number;      // 3
  baseDelayMs: number;     // 1000
  maxDelayMs: number;      // 10000
  jitterMs: number;        // 500
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt) + Math.random() * config.jitterMs,
        config.maxDelayMs,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
```

---

## 6. Testing Strategy Research

### 6.1 Vitest with Workers Pool

Based on [Cloudflare's Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/):

**Installation:**
```bash
npm install -D vitest @cloudflare/vitest-pool-workers
```

**Configuration (`vitest.config.ts`):**
```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          kvNamespaces: ['NEWSLETTER_KV'],
          r2Buckets: ['PODCAST_BUCKET'],
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: { lines: 80, functions: 80, branches: 80 },
      },
    },
  },
});
```

**Test Example:**
```typescript
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { extractContent } from '../src/lib/content-extractor';

describe('Content Extractor', () => {
  it('should extract text and links from HTML', async () => {
    const html = '<p>Hello <a href="https://example.com">World</a></p>';
    const result = await extractContent(html);
    expect(result.text).toContain('Hello');
    expect(result.links).toHaveLength(1);
  });

  it('should filter tracking links', async () => {
    const html = '<a href="https://click.tracking.com/xyz">Click</a>';
    const result = await extractContent(html);
    expect(result.links).toHaveLength(0);
  });
});
```

### 6.2 Testing Cron Triggers

```typescript
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Scheduled Worker', () => {
  it('should process newsletters on cron trigger', async () => {
    // Setup: Add test newsletters to KV
    const today = new Date().toISOString().split('T')[0];
    await env.NEWSLETTER_KV.put(
      `${today}:test-1`,
      JSON.stringify({ id: 'test-1', subject: 'Test', html: '<p>Content</p>' }),
    );

    // Trigger scheduled event
    const result = await SELF.scheduled({
      scheduledTime: Date.now(),
      cron: '0 5 * * *',
    });

    // Verify episode was created
    const episode = await env.PODCAST_BUCKET.get(`episodes/${today}.mp3`);
    expect(episode).toBeTruthy();
  });
});
```

### 6.3 Mocking External APIs

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock fetch for API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Script Generator', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should call Claude API and parse response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Script content\n---SHOWNOTES---\n## Topics\n- Topic 1\n---END SHOWNOTES---' }],
      }),
    });

    const result = await generatePodcastScript(newsletters, mockEnv);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': expect.any(String),
        }),
      }),
    );
    expect(result.script).toContain('Script content');
  });
});
```

### 6.4 Coverage Requirements

Per constitution:
- **80%+ overall coverage**
- **100% on critical paths:**
  - `scheduled-worker.ts` (cron job)
  - `email-worker.ts` (email ingestion)
  - `script-generator.ts` (Claude API)
  - `tts-generator.ts` (Fish Audio API)
  - `config-loader.ts` (configuration validation)
  - `api-worker.ts` (manual controls API)

---

## 7. R2 Directory Structure

### 7.1 Bucket Layout

```
briefcast-podcast/
├── config.yaml                    # Hot-reloadable configuration
├── cover.jpg                      # Podcast artwork (3000x3000 recommended)
├── feed.xml                       # RSS feed (regenerated on each episode)
├── metadata.json                  # Episode metadata for feed generation
├── episodes/
│   ├── 2026-01-04.mp3            # Audio files by date
│   ├── 2026-01-03.mp3
│   └── ...                        # Keep last 30 (configurable)
└── pending/
    ├── 2026-01-04-abc123.json    # Pending scripts awaiting approval
    └── ...                        # Auto-expire after 30 days
```

### 7.2 Object Metadata

**Audio Files:**
```typescript
await bucket.put(`episodes/${date}.mp3`, audioBuffer, {
  httpMetadata: {
    contentType: 'audio/mpeg',
    cacheControl: 'public, max-age=31536000', // 1 year
  },
  customMetadata: {
    duration: '00:08:32',
    generatedAt: new Date().toISOString(),
  },
});
```

**RSS Feed:**
```typescript
await bucket.put('feed.xml', feedXml, {
  httpMetadata: {
    contentType: 'application/rss+xml; charset=utf-8',
    cacheControl: 'public, max-age=3600', // 1 hour
  },
});
```

**Pending Scripts:**
```typescript
interface PendingScript {
  id: string;
  date: string;
  script: string;
  shownotes: string;
  newsletters: Array<{ id: string; subject: string; from: string }>;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  expiresAt: string; // 30 days from creation
}
```

---

## 8. Risks and Technical Challenges

### 8.1 High-Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **CPU time limits on free tier** | High | High | Monitor usage, upgrade to paid if needed ($5/month) |
| **Fish Audio costs exceed budget** | Medium | High | Optimize script length, consider alternatives |
| **Claude API rate limiting** | Low | Medium | Implement exponential backoff, queue requests |
| **Email parsing failures** | Medium | Low | Graceful skip, log for debugging |
| **RSS feed cache issues** | Low | Medium | Set appropriate cache headers, document refresh |

### 8.2 Medium-Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Newsletter format changes** | Medium | Medium | Robust content extraction with fallbacks |
| **Audio quality inconsistency** | Medium | Medium | Test voice model, tune TTS parameters |
| **R2 egress approaching limits** | Low | Medium | Monitor usage, enable Cloudflare CDN |
| **Config validation edge cases** | Medium | Low | Comprehensive Zod schemas, good error messages |
| **Podcast app compatibility** | Low | Medium | Test with multiple apps, use RSS validators |

### 8.3 Technical Challenges

#### Challenge 1: HTML Content Extraction
- Newsletter HTML varies wildly (tables, inline styles, tracking pixels)
- Some newsletters are mostly images
- **Approach:** Regex-based extraction with fallback to plain text body

#### Challenge 2: Script Quality Consistency
- Claude output can vary in style and length
- Shownotes format may not always be followed
- **Approach:** Detailed prompts, validation of output structure, regenerate on failure

#### Challenge 3: Audio Duration Estimation
- Fish Audio doesn't return duration in response
- Duration needed for RSS feed
- **Approach:** Estimate from word count (150 WPM), or parse MP3 metadata

#### Challenge 4: Atomic RSS Feed Updates
- Multiple processes could update feed simultaneously
- **Approach:** Use optimistic locking with metadata version, or accept eventual consistency

#### Challenge 5: Testing Email Workers
- Email workers require actual MIME messages
- Local development with wrangler dev supports email testing
- **Approach:** Create test fixtures from real newsletter emails

---

## 9. Development Workflow

### 9.1 Git Worktree Strategy

Per constitution, all implementation happens in worktrees:

```bash
# Create worktree for spec implementation
git worktree add .worktrees/c2caecab-email-worker -b spec/c2caecab/email-worker

# Work in worktree
cd .worktrees/c2caecab-email-worker
# ... implement, test, commit ...

# Merge back
git checkout main
git merge spec/c2caecab/email-worker
git worktree remove .worktrees/c2caecab-email-worker
```

### 9.2 Branch Naming Convention

```
spec/{spec-id}/{component}

Examples:
- spec/c2caecab/email-worker
- spec/c2caecab/config-loader
- spec/c2caecab/script-generator
- spec/c2caecab/api-worker
- spec/c2caecab/docs
```

### 9.3 Local Development

```bash
# Start development server
npm run dev  # wrangler dev

# Test scheduled trigger
npm run dev:scheduled  # wrangler dev --test-scheduled

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Deploy
npm run deploy  # wrangler deploy
```

### 9.4 Secrets Management

**Local Development (`.dev.vars` - gitignored):**
```
ANTHROPIC_API_KEY=sk-ant-...
FISH_AUDIO_API_KEY=...
API_AUTH_TOKEN=...
```

**Production (Cloudflare Secrets):**
```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put FISH_AUDIO_API_KEY
wrangler secret put API_AUTH_TOKEN
```

---

## 10. Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Testing framework** | Vitest + @cloudflare/vitest-pool-workers | Official Cloudflare integration, runs in workerd |
| **Config validation** | Zod | TypeScript-first, detailed errors, widely used |
| **YAML parsing** | js-yaml | Lightweight, Workers-compatible, stable |
| **Email parsing** | postal-mime | Designed for Workers, actively maintained |
| **RSS generation** | podcast | iTunes-compatible, simple API |
| **Code organization** | Modular with dependency injection | Testability, separation of concerns |
| **Error handling** | Custom error classes + structured logging | Constitution requirement |
| **Git workflow** | Worktrees per component | Constitution requirement |
| **Coverage target** | 80% overall, 100% critical paths | Constitution requirement |

---

## 11. References

### Cloudflare Documentation
- [Cloudflare Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)
- [Vitest Integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Email Workers Runtime API](https://developers.cloudflare.com/email-routing/email-workers/runtime-api/)
- [R2 Storage](https://developers.cloudflare.com/r2/)
- [KV Storage](https://developers.cloudflare.com/kv/)

### Package Documentation
- [postal-mime (npm)](https://www.npmjs.com/package/postal-mime)
- [podcast (npm)](https://www.npmjs.com/package/podcast)
- [zod (npm)](https://www.npmjs.com/package/zod)
- [js-yaml (npm)](https://www.npmjs.com/package/js-yaml)

### API Documentation
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Fish Audio TTS API](https://docs.fish.audio/developer-guide/core-features/text-to-speech)

---

**End of Research Document**

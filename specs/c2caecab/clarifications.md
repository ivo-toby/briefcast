# Clarifications - Newsletter-to-Podcast Pipeline

## User Responses (2026-01-04)

### 1. Newsletter Sources
**Answer:** Not critical - user will manage newsletter subscriptions separately. The app processes whatever arrives in the mailbox.

### 2. Domain Setup
**Answer:** No domain yet.
**Action Required:** Document domain setup recommendations and R2 public URL configuration.

**Recommendations to Document:**
- Domain registrar options (Cloudflare Registrar, Namecheap, etc.)
- DNS configuration for Cloudflare Email Routing
- R2 custom domain setup for public podcast URLs
- SSL/TLS certificate setup (automatic via Cloudflare)

### 3. API Keys
**Answer:** User has API keys.
**Action Required:** Document where to store API keys and how to configure them.

**Configuration to Document:**
- Anthropic API key → Cloudflare Worker secret
- Fish Audio API key → Cloudflare Worker secret
- How to use `wrangler secret put` command
- Local development with `.dev.vars` file
- Environment variable reference in code

### 4. Episode Retention
**Answer:** 30 episodes is acceptable.

### 5. Content Filtering
**Answer:** Should be configurable via YAML file.
**Action Required:** Design and document configuration file format.

**Configuration Format:**
```yaml
# podcast-config.yaml
filtering:
  include_topics:
    - machine learning
    - large language models
    - AI safety
  exclude_topics:
    - cryptocurrency
    - blockchain
  exclude_keywords:
    - sponsored
    - advertisement
```

**Storage:** R2 bucket as `config.yaml`, editable via Cloudflare dashboard or wrangler CLI.

### 6. Error Handling
**Answers:**
- No newsletters received → Skip day (no episode generated)
- Claude API failure → Log error and skip day
- Fish Audio API failure → Log error and skip day

**Action Required:** Implement comprehensive error logging and document monitoring strategy.

### 7. Manual Override
**Answer:** Yes, manual controls needed.

**Requirements:**
- Manual trigger for episode generation (outside cron schedule)
- Ability to edit generated script before TTS conversion
- Review/approve flow before publishing

**Implementation Approach:**
- Add authenticated HTTP endpoint for manual triggers
- Implement two-stage workflow: generate script → review → generate audio
- Store pending scripts in R2 for review
- Simple web UI or CLI tool for approval workflow

## Updated Requirements

### New Features to Implement
1. **Configuration Management**
   - YAML-based content filtering config
   - Stored in R2, hot-reloadable
   - Schema validation

2. **Manual Workflow Controls**
   - HTTP endpoint: `POST /generate` (manual trigger)
   - HTTP endpoint: `GET /pending` (list pending scripts)
   - HTTP endpoint: `POST /approve/:id` (approve script → TTS)
   - HTTP endpoint: `POST /reject/:id` (reject and regenerate)
   - Basic auth protection

3. **Enhanced Error Handling**
   - Structured logging to Cloudflare Workers logs
   - Error notification system (optional email/webhook)
   - Graceful degradation
   - Retry logic with exponential backoff for API calls

4. **Documentation Requirements**
   - Domain setup guide
   - API key configuration guide
   - Content filtering configuration guide
   - Manual workflow usage guide
   - Monitoring and troubleshooting guide

## Implementation Impact

### Modified Components
- **scheduled-worker.ts**: Add error handling, config loading
- **New: api-worker.ts**: HTTP handlers for manual controls
- **New: config-loader.ts**: Load and validate YAML config
- **New: logger.ts**: Structured logging utility
- **storage.ts**: Add pending script storage/retrieval
- **wrangler.toml**: Add routes for HTTP endpoints
- **docs/**: New documentation directory

### New Dependencies
- `js-yaml`: YAML parsing (lightweight, Workers-compatible)
- `zod`: Schema validation for config

### Security Considerations
- HTTP endpoints need authentication (HTTP Basic Auth or API key)
- Config file should be validated before use
- Rate limiting on manual triggers

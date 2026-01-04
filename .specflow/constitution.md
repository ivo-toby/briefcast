# Briefcast Project Constitution

> This constitution defines ground rules for ALL AI agents working on this project.
> Last updated: 2026-01-04

## Identity

- **Project**: Briefcast
- **Purpose**: Automatically convert daily newsletters into podcast episodes using AI-powered summarization and text-to-speech
- **Target Users**: Individual newsletter subscribers who prefer audio consumption
- **Scale**: Personal/small-scale serverless application (single-user, <€15/month budget)
- **Domain**: Initially AI newsletters, but architecture supports any newsletter topic (gaming, knitting, finance, etc.) via configuration

---

## Technical Stack

### Core Technologies
- **Runtime**: Cloudflare Workers (serverless, TypeScript)
- **Language**: TypeScript with strict mode enabled
- **Storage**: Cloudflare R2 (audio files, RSS feed, config), Cloudflare KV (temporary email storage)
- **Email**: Cloudflare Email Workers (push-based, no IMAP)
- **AI Services**:
  - Claude API (Anthropic) - script generation, configurable model
  - Fish Audio API - text-to-speech, configurable voice
- **Deployment**: Cloudflare Workers via Wrangler CLI
- **Configuration**: YAML (config.yaml in R2, hot-reloadable)

### Data & Storage
- **Database**: None (stateless Workers, R2 for persistence)
- **Caching**: Cloudflare CDN (optional, for bandwidth escape hatch)
- **File Storage**: Cloudflare R2 with public access via custom domain

### APIs & Integration
- **API Style**: HTTP REST for manual control endpoints
- **Authentication**: Bearer token (HTTP Basic Auth alternative) for manual API
- **External APIs**: Claude (Anthropic), Fish Audio, Cloudflare services
- **RSS Feed**: Standard iTunes-compatible podcast RSS 2.0

### Deployment & CI/CD
- **Platform**: Cloudflare Workers
- **Containerization**: Not applicable (Workers runtime)
- **CI/CD**: Not required initially (manual `wrangler deploy`)
- **Environment**: Production only (use `.dev.vars` for local testing)

---

## Requirements Phase (BRD/PRD)

### Business Requirements (BRD)
- **Cost optimization is critical**: All decisions prioritize staying within €15/month budget
- **User control paramount**: Configurability over opinionation (YAML config for all key parameters)
- **Privacy-focused**: No logging of email content, personal newsletters stay private
- **Graceful degradation**: Better to skip a day than generate poor-quality content

### Product Requirements (PRD)
- **User experience**: Set-and-forget automation with manual override capability
- **Content quality**: Natural-sounding, ad-free, well-organized shownotes
- **Feature prioritization**: Core automation first, advanced features (web UI, real-time) deferred to future iterations
- **Scope boundaries**: Single-user, audio-only, daily batch processing (no real-time, no multi-user, no web UI for now)

---

## Specification Phase

### Specification Quality Standards
- **Acceptance criteria**: Every feature must have testable acceptance criteria
- **Error handling**: All error conditions and edge cases must be specified
- **Configuration**: All user-configurable options must be documented in spec
- **Cost impact**: Specs must include cost analysis for external API usage
- **Existing patterns**: Reference and extend existing Cloudflare Workers patterns
- **Human approval required**: No implementation starts without explicit spec approval

### Technical Decision Framework
- **Serverless-first**: Prefer Workers-compatible libraries and patterns
- **Cost-aware**: Evaluate API costs, caching opportunities, bandwidth usage
- **Configurability**: When in doubt, make it configurable via YAML
- **Simplicity**: Avoid over-engineering, YAGNI principle applies
- **Escape hatches**: Provide options for scaling (CDN, external services)

### Configuration Philosophy
- **YAML schema validation**: Use Zod for runtime schema validation
- **Fail fast on startup**: Invalid config = Worker fails to start (no silent fallbacks)
- **Hot-reload**: Config changes take effect on next cron run (no redeployment)
- **Breaking changes allowed**: Users must update config.yaml when upgrading versions
- **Document everything**: All config fields must be documented with examples and defaults

---

## Task Generation

### Task Decomposition Rules
- **Atomic tasks**: Each task should be independently testable and take 1-4 hours
- **Clear completion criteria**: "Done" means tests pass, docs updated, no errors
- **Explicit dependencies**: Tasks must declare dependencies (e.g., "requires FR-003 config loader")
- **Component-based**: Tasks aligned with spec components (email worker, script generator, TTS, etc.)

### Task Priorities
- **P1 (Critical)**: Blocking other work or core automation path
- **P2 (Important)**: Manual controls, error handling, documentation
- **P3 (Nice-to-have)**: Optimizations, future enhancements, optional features

### Follow-up Task Guidelines
- **TECH-DEBT**: Create for shortcuts taken (e.g., "TODO: add retry backoff jitter")
- **TEST-GAP**: Create for missing test coverage (e.g., "Add integration test for Claude API failure")
- **DOC**: Create for undocumented features (e.g., "Document CDN setup in scaling guide")
- **REFACTOR**: Create when code quality degrades (e.g., "Extract prompt generation into separate module")

---

## Implementation Phase

### Code Quality Standards

#### Testing Requirements (Comprehensive - 80%+ coverage)
- **Unit tests**: All core logic functions (content extraction, config validation, prompt generation)
- **Integration tests**: End-to-end flows (email → KV → script → TTS → RSS)
- **API tests**: All manual control endpoints with authentication
- **Edge case tests**: Error conditions, malformed inputs, API failures
- **Coverage target**: 80%+ overall, 100% on critical paths (cron job, API calls)
- **Testing framework**: Choose Workers-compatible framework (e.g., Vitest, Miniflare)

#### Linting & Formatting
- **TypeScript strict mode**: Enable all strict compiler options
- **ESLint**: Basic ESLint config for Workers (avoid heavy plugins)
- **Prettier**: Standard formatting, no customization needed
- **Pre-commit hooks**: Optional (user preference)
- **Auto-fix on save**: Recommended for local development

#### Documentation Requirements (Comprehensive)
- **README.md**: Project overview, quick start, architecture overview
- **Setup guides** (`docs/setup/`): Domain setup, API keys, Cloudflare configuration
- **Usage guides** (`docs/usage/`): Configuration reference, manual workflow, monitoring, scaling/CDN
- **Troubleshooting** (`docs/troubleshooting.md`): Common issues and solutions
- **API documentation**: All manual control endpoints with curl examples
- **Inline comments**: Only for non-obvious logic, complex algorithms, or workarounds
- **Architecture docs**: High-level component diagram, data flow, integration points

### Architecture Principles

#### Design Pattern
- **Modular serverless**: Each Worker component is independently testable
- **Separation of concerns**:
  - `email-worker.ts` - email ingestion only
  - `scheduled-worker.ts` - cron orchestration only
  - `api-worker.ts` - manual controls only
  - `lib/` - reusable logic (content extraction, API calls, storage)
- **Dependency injection**: Pass dependencies (env, storage) to functions, avoid globals
- **Pure functions**: Prefer pure functions for testability (especially content extraction, prompt generation)

#### Error Handling Strategy
- **Fail fast**: Configuration errors abort immediately (invalid YAML, missing secrets)
- **Graceful degradation**: External API failures log error and skip day (no partial episodes)
- **Never lose data**: Emails persist in KV (7-day TTL), scripts persist in R2 (30-day TTL)
- **Structured errors**: Use Error subclasses with context (e.g., `ConfigValidationError`, `ClaudeAPIError`)
- **Retry logic**: Exponential backoff for transient failures (max 3 retries)
- **User notification**: Optional webhook/email for critical errors (config-driven)

#### Logging Strategy
- **Structured JSON logging**: All logs as JSON with consistent schema
- **Log levels**: DEBUG, INFO, WARN, ERROR (no TRACE, keep it simple)
- **Required fields**: `timestamp`, `level`, `component`, `message`, `context` (object)
- **No PII**: Never log email content, user data, or secrets
- **Error stack traces**: Include full stack trace for ERROR level
- **Request IDs**: Track request IDs from external APIs for debugging

#### Security Requirements
- **Secrets management**: All secrets in Cloudflare Worker environment variables (never in code)
- **Authentication**: Bearer token for manual API endpoints (stored as Worker secret)
- **Rate limiting**: Max 20 requests/hour on manual API (configurable)
- **Input validation**: Validate all user inputs (API requests, config.yaml)
- **HTTPS only**: All external communication over HTTPS
- **No CORS**: API endpoints do not need CORS (CLI/curl only, no browser usage)

### Implementation Process

#### Autonomous Implementation
- **Spec-driven**: Implementation follows approved spec exactly (no improvisation)
- **Isolated worktrees**: All changes in git worktrees (never modify main directly)
- **Agent pipeline**: coder → reviewer → tester → qa (each stage must pass)
- **No shortcuts**: If a shortcut is taken, create TECH-DEBT task immediately
- **Test-first preferred**: Write tests before implementation when feasible

#### Git Workflow
- **Branch naming**: `spec/{spec-id}/{component}` (e.g., `spec/c2caecab/email-worker`)
- **Commit messages**: Descriptive, reference spec ID
- **No force push**: Never force push to any branch
- **Clean history**: Squash commits before final merge (optional)

---

## Constraints & Boundaries

### Cost Constraints (Critical)
- **Total budget**: <€15/month all-in
- **Cloudflare services**: Stay within free tier (Workers, R2, KV, Email Routing)
- **Claude API**: Target €5-8/month (monitor token usage)
- **Fish Audio API**: Target €5-10/month (monitor audio duration)
- **Bandwidth**: Monitor R2 egress, enable CDN if approaching 10GB/month free tier

### Performance Requirements
- **Email processing**: <30 seconds per email
- **Daily cron job**: <30 minutes total (for up to 20 newsletters)
- **API endpoints**: <5 seconds response time (excluding TTS generation)
- **RSS feed generation**: <5 seconds

### Compatibility Requirements
- **Podcast apps**: iTunes-compatible RSS feed (Apple Podcasts, Overcast, Pocket Casts, etc.)
- **Browsers**: Not applicable (no web UI, for now)
- **Email formats**: Support standard newsletter HTML (multipart MIME)
- **RSS validators**: Pass Cast Feed Validator and podcast-namespace validation

### Scalability Requirements
- **Newsletters**: Handle up to 50 newsletters/day
- **Episodes**: Store up to 100 episodes in R2 (configurable via `max_episodes`)
- **Manual API**: Support up to 100 API requests/day
- **Bandwidth escape hatch**: CDN options documented for high-traffic scenarios

---

## Explicitly Out of Scope

### Not Now, Maybe Future Iterations
- **Real-time processing**: Daily batch processing only (cron-based)
- **Web UI**: Manual controls via API/CLI only (no dashboard, for now)
- **Video/images**: Audio-only podcast (no video episodes, images in shownotes are just links)
- **Multi-language**: English output only (translation is future enhancement)
- **Conversation format**: Single-host narrative only (dialogue between hosts is v2.0)

### Never in Scope
- **Multi-user support**: Single-user personal tool only (if someone wants multiple podcasts, they deploy multiple instances)
- **Newsletter subscription management**: User manages subscriptions separately (we just process incoming emails)
- **Email client features**: No read/unread, folders, search (Cloudflare Email Workers is ingestion only)
- **Analytics/tracking**: No user tracking, listen analytics, or metrics collection (privacy-first)

### Explicitly Avoided Technologies
- **Traditional databases**: No PostgreSQL, MySQL, MongoDB (Workers environment, use R2/KV only)
- **Long-running processes**: No background jobs, daemons, or persistent connections (serverless only)
- **Stateful sessions**: No session storage, cookies, or user accounts (stateless Workers)
- **Frontend frameworks**: No React, Vue, Svelte (API only, for now)

---

## Change Management

### Constitution Updates
- **Versioning**: Constitution version tracks with project version
- **Approval required**: Any constitution changes require explicit user approval
- **Backward compatibility**: Old specs/tasks don't need retroactive updates
- **Communication**: Document why constitution changed (e.g., new tech stack decision)

### Spec Amendments
- **Minor changes**: Typos, clarifications, examples can be updated without re-approval
- **Major changes**: Functional changes, new requirements, architecture shifts require new spec version + approval
- **Deprecation**: Mark deprecated features clearly, provide migration path

### Breaking Changes
- **Config schema**: Breaking changes to config.yaml are allowed (user must update)
- **API endpoints**: Breaking changes to manual API require version bump + documentation
- **RSS feed**: Breaking changes to feed format require careful migration (podcast apps cache feeds)

---

## Agent-Specific Guidelines

### Specification Agent (Architect)
- **Thoroughness over speed**: Take time to design well, reference existing patterns
- **Cost awareness**: Every external API call has cost implications
- **User configurability**: When uncertain, make it configurable via YAML
- **Documentation planning**: Plan documentation structure as part of spec

### Implementation Agent (Coder)
- **Spec fidelity**: Implement exactly what's specified, no more, no less
- **Test coverage**: Write tests as you code, don't defer to end
- **Error messages**: Make errors actionable (tell user what to fix and how)
- **Comments**: Comment "why", not "what" (code should be self-documenting)

### Review Agent (Reviewer)
- **Security first**: Check for secrets in code, input validation, auth bypass
- **Performance**: Flag unnecessary API calls, inefficient loops, missing caching
- **Error handling**: Verify all error cases are handled gracefully
- **Consistency**: Code follows existing patterns and conventions

### Testing Agent (Tester)
- **Coverage**: Verify 80%+ coverage, 100% on critical paths
- **Edge cases**: Test malformed inputs, API failures, empty responses
- **Integration tests**: Test full flows, not just unit functions
- **Assertions**: Use specific assertions, not just "no error thrown"

### QA Agent (Quality Assurance)
- **Spec compliance**: Verify all acceptance criteria met
- **Cost validation**: Confirm implementation stays within budget constraints
- **Documentation**: Verify all docs are up-to-date and accurate
- **Regression**: Ensure no existing functionality broken

---

## Success Criteria

A task/feature is "done" when:
- ✅ All acceptance criteria from spec are met
- ✅ Tests pass with 80%+ coverage
- ✅ Code review approved (security, performance, consistency)
- ✅ Documentation updated (README, API docs, guides as applicable)
- ✅ QA validation passed (spec compliance, no regressions)
- ✅ Cost impact verified (stays within budget)
- ✅ No CRITICAL or HIGH severity issues from review

---

**This constitution is the source of truth for all AI agents working on Briefcast.**
**When in doubt, refer to this document or ask for clarification.**

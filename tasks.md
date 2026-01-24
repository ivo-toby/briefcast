# Briefcast Improvement Tasks

## Overview
Improvements identified from podcast script review (2026-01-11, 2026-01-12 episodes).

## Target Audience
- **Nerds, AI Engineers, Tinkerers**
- People who love to create their own tools
- Those who try new tools or AI paradigms almost daily
- Technical depth is appreciated, not dumbed down
- Practical, actionable insights over hype

*All content/prompting decisions should cater to this audience.*

## Music Generation
Intro, outro, and section transition music will be generated using **ToneJS** (to be designed separately).

---

## 1. Production Quality
**Status:** Pending
**Priority:** High

### Problems Identified
- Volume inconsistencies: each TTS chunk starts at different volume levels
- Root cause: OpenAI TTS chunks are concatenated without normalization
- No intro/outro music or transitions between topics
- Episodes lack clear structure for listeners

### Current Implementation (from codebase analysis)
- `src/lib/tts-generator.ts`: Chunks text by tokens (2000 max), calls OpenAI TTS per chunk
- Chunks are simply concatenated (`concatAudioBuffers`) with no processing
- No audio normalization between chunks
- No music/jingle integration

### Proposed Solution
1. **Sectioned Structure:**
   - Introduction with intro music
   - Topic sections with intermediate musical breaks/jingles
   - Conclusion that synthesizes all topics
   - Outro music

2. **Multi-Level Volume Normalization:**
   - Topics can exceed 2000 tokens → still need multiple TTS chunks per section
   - **Level 1:** Normalize chunks within each section
   - **Level 2:** Normalize sections relative to each other
   - **Level 3:** Add music transitions between sections

3. **Implementation Approach:**
   - Modify script generation to output structured sections (JSON or markers)
   - Generate TTS per section (may be multiple chunks per section)
   - Apply chunk-level normalization within sections
   - Apply section-level normalization across episode
   - Stitch with music transitions

---

## 2. Content Quality
**Status:** Pending
**Priority:** High

### Problems Identified
- Scripts feel generic and repetitive
- Takeaways lack specificity ("diversify your information sources")
- Topics sometimes feel disconnected without synthesis

### Current Implementation
- `src/lib/script-generator.ts`: Uses Claude with prompts from `config.yaml`
- System prompt: Generic "podcast host" persona
- User prompt template: `{newsletters}`, `{date}`, word count constraints
- No explicit structure enforced in output

### Proposed Solution
1. **Structured Script Format:**
   - Enforce sections in Claude output (intro, topics, synthesis conclusion)
   - Use markers or JSON structure for section boundaries

2. **Improved Prompting:**
   - More specific editorial voice guidance
   - Require concrete, actionable takeaways
   - Mandate synthesis conclusion (connect topics, not just summarize)

3. **Source Quality:**
   - Better filtering of newsletter content
   - Topic clustering before script generation

---

## 3. Dynamic Episode Duration
**Status:** Pending
**Priority:** High

### Problems Identified
- Hard-coded duration limits (10-15 min) cause two failure modes:
  - **Light content days:** LLM hallucinates filler to reach target duration
  - **Heavy content days:** Good content gets cut or rushed to fit limit
- Current config enforces: `min_words: 800`, `max_words: 1500`, `target_duration_minutes: 10`

### Current Behavior vs Desired Behavior

| Scenario | Current | Desired |
|----------|---------|---------|
| 1 good article | Pads with filler/hallucination to hit 10 min | 5-minute focused episode |
| 10 rich newsletters | Rushes/cuts to fit 10 min | 30-45 minute comprehensive episode |

### Proposed Solution
1. **Duration as Guidance, Not Constraint:**
   - Remove hard min/max word limits
   - Provide soft guidance: "aim for concise coverage, typically 10-20 minutes"
   - Let content volume determine actual length

2. **Content-Aware Prompting:**
   - Instruct LLM: "Cover what's genuinely interesting. Don't pad. Don't rush."
   - Allow short episodes (3-5 min) on light days
   - Allow long episodes (30-45 min) on heavy days

3. **Quality Signals:**
   - "If only one topic is worth discussing, make it a focused short episode"
   - "Never invent or speculate to fill time"
   - "It's okay to have varying episode lengths"

---

## Technical Context

### Key Files
| File | Purpose |
|------|---------|
| `src/lib/script-generator.ts` | Claude API, prompt building |
| `src/lib/tts-generator.ts` | OpenAI TTS, chunking, audio concat |
| `src/lib/content-extractor.ts` | Email parsing, HTML cleaning |
| `src/lib/storage.ts` | KV/R2 storage operations |
| `config.yaml` | All configuration including prompts |

### Current Audio Pipeline
```
Emails → Content Extraction → Claude Script → Token Chunking →
OpenAI TTS (per chunk) → Concatenate MP3s → Store to R2
```

### Proposed Audio Pipeline
```
Emails → Content Extraction → Claude Script (structured sections) →
Per-Section TTS → Volume Normalization → Add Music/Transitions →
Final Stitch → Store to R2
```

---

## Next Steps
1. ~~Explore codebase~~ (completed)
2. Discuss additional items with user
3. Create SpecFlow specifications for each improvement area
4. Implement changes

---

Last updated: 2026-01-12

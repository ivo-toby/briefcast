/**
 * Zod schema for structured podcast script output
 * Enforces section structure: intro, topics, synthesis
 */

import { z } from 'zod';

// Import base type from types to avoid duplication
import type { SectionType } from '../types/index.js';

// Re-export for convenience
export type { SectionType };

// =============================================================================
// Section Type Schema
// =============================================================================

/**
 * Zod schema for section types
 */
export const SectionTypeSchema = z.enum(['intro', 'topic', 'synthesis']);

// =============================================================================
// Section Schema
// =============================================================================

/**
 * Individual section in a structured script
 */
export const ScriptSectionSchema = z.object({
  type: SectionTypeSchema,
  title: z.string().optional(),
  content: z.string().min(10, 'Section content must be at least 10 characters'),
  sources: z.array(z.string()).optional(),
});

export type ScriptSection = z.infer<typeof ScriptSectionSchema>;

// =============================================================================
// Structured Script Schema
// =============================================================================

/**
 * Date format: YYYY-MM-DD
 */
const DateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format'
);

/**
 * Complete structured script schema with validation rules:
 * - Must have intro first
 * - Must have at least one topic
 * - Must have synthesis last
 */
export const StructuredScriptSchema = z.object({
  date: DateSchema,
  episodeTitle: z.string().min(5).max(200),
  estimatedDurationMinutes: z.number().min(3).max(60),
  sections: z.array(ScriptSectionSchema)
    .min(3, 'Script must have at least 3 sections (intro, topic, synthesis)')
    .refine(
      (sections) => {
        if (sections.length === 0) return false;

        // First section must be intro
        const first = sections[0];
        if (!first || first.type !== 'intro') return false;

        // Last section must be synthesis
        const last = sections[sections.length - 1];
        if (!last || last.type !== 'synthesis') return false;

        // Must have at least one topic
        const topics = sections.filter(s => s.type === 'topic');
        if (topics.length < 1) return false;

        return true;
      },
      {
        message: 'Script must start with intro, have at least one topic, and end with synthesis',
      }
    ),
});

export type StructuredScript = z.infer<typeof StructuredScriptSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate and parse structured script
 * @throws ZodError if validation fails
 */
export function validateScript(data: unknown): StructuredScript {
  return StructuredScriptSchema.parse(data);
}

/**
 * Safely validate structured script
 * @returns Result object with success/error
 */
export function safeValidateScript(data: unknown): z.SafeParseReturnType<unknown, StructuredScript> {
  return StructuredScriptSchema.safeParse(data);
}

/**
 * Check if a script has valid section order
 * Useful for quick validation before full parsing
 */
export function hasValidSectionOrder(sections: Array<{ type: string }>): boolean {
  if (sections.length < 3) return false;

  const first = sections[0];
  const last = sections[sections.length - 1];

  if (!first || first.type !== 'intro') return false;
  if (!last || last.type !== 'synthesis') return false;

  const hasTopics = sections.some(s => s.type === 'topic');
  return hasTopics;
}

// =============================================================================
// Script Generation Prompt Template
// =============================================================================

/**
 * JSON schema description for Claude prompt
 * Include this in the system prompt to guide output format
 */
export const SCRIPT_JSON_SCHEMA_DESCRIPTION = `
Output Format: Return a JSON object with this exact structure:
{
  "date": "YYYY-MM-DD",
  "episodeTitle": "Catchy episode title (5-200 chars)",
  "estimatedDurationMinutes": number (3-60),
  "sections": [
    {
      "type": "intro",
      "content": "Opening content welcoming listeners..."
    },
    {
      "type": "topic",
      "title": "Topic Title",
      "content": "Deep dive into the topic...",
      "sources": ["Source 1", "Source 2"]
    },
    // ... more topics ...
    {
      "type": "synthesis",
      "content": "Concluding synthesis connecting all topics..."
    }
  ]
}

Rules:
- First section MUST be type "intro"
- Last section MUST be type "synthesis"
- At least ONE section must be type "topic"
- Each topic should have a title
- Content should be natural spoken language
- Do NOT include speaker directions or [brackets]
`;

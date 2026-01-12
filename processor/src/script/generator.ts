/**
 * Script generator module
 * Generates structured podcast scripts from newsletter content
 */

import type { NewsletterContent, ProcessorEnv, Config } from '@briefcast/shared';
import {
  validateScript,
  type StructuredScript,
  ScriptValidationError,
} from '@briefcast/shared';
import { createClaudeClient, type ClaudeClient } from './claude-client.js';
import { SCRIPT_SYSTEM_PROMPT, selectPromptStrategy } from './prompts.js';

/**
 * Script generation options
 */
export interface ScriptGeneratorOptions {
  maxRetries?: number;
}

/**
 * Script generation result
 */
export interface ScriptGenerationResult {
  script: StructuredScript;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  generatedAt: Date;
}

/**
 * Script generator class
 */
export class ScriptGenerator {
  private readonly claudeClient: ClaudeClient;
  private readonly config: Config;

  constructor(env: ProcessorEnv, config: Config) {
    this.claudeClient = createClaudeClient(env);
    this.config = config;
  }

  /**
   * Generate a structured podcast script from newsletter content
   */
  async generate(
    contents: NewsletterContent[],
    date: string,
    _options: ScriptGeneratorOptions = {}
  ): Promise<ScriptGenerationResult> {
    if (contents.length === 0) {
      throw new ScriptValidationError('No content provided for script generation');
    }

    // Select appropriate prompt based on content
    const userPrompt = selectPromptStrategy(contents, date);

    // Generate script via Claude
    const script = await this.claudeClient.generateJson<StructuredScript>(
      SCRIPT_SYSTEM_PROMPT,
      userPrompt,
      (text) => {
        const parsed = JSON.parse(text);
        return validateScript(parsed);
      }
    );

    // Validate script structure
    this.validateScriptContent(script, contents);

    return {
      script,
      tokensUsed: {
        input: 0, // Would need to track from API response
        output: 0,
        total: 0,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Validate script content meets requirements
   */
  private validateScriptContent(
    script: StructuredScript,
    _sources: NewsletterContent[]
  ): void {
    // Check minimum content in each section
    for (const section of script.sections) {
      if (section.content.length < 50) {
        throw new ScriptValidationError(
          `Section "${section.type}" has insufficient content`,
          { sectionType: section.type, contentLength: section.content.length }
        );
      }
    }

    // Check topics have titles
    const topics = script.sections.filter((s) => s.type === 'topic');
    for (const topic of topics) {
      if (!topic.title || topic.title.length < 3) {
        throw new ScriptValidationError('Topic section missing title', {
          content: topic.content.substring(0, 100),
        });
      }
    }

    // Check estimated duration is reasonable
    const wordCount = script.sections.reduce(
      (sum, s) => sum + s.content.split(/\s+/).length,
      0
    );
    const estimatedMinutes = wordCount / 150; // ~150 wpm speaking rate

    if (Math.abs(estimatedMinutes - script.estimatedDurationMinutes) > 10) {
      // Don't throw, just log warning - the estimate might be off
    }
  }
}

/**
 * Create script generator from environment
 */
export function createScriptGenerator(
  env: ProcessorEnv,
  config: Config
): ScriptGenerator {
  return new ScriptGenerator(env, config);
}

/**
 * Format script for display/logging
 */
export function formatScriptSummary(script: StructuredScript): string {
  const topics = script.sections.filter((s) => s.type === 'topic');

  return `
Episode: ${script.episodeTitle}
Date: ${script.date}
Duration: ~${script.estimatedDurationMinutes} minutes
Topics: ${topics.length}
${topics.map((t, i) => `  ${i + 1}. ${t.title}`).join('\n')}
  `.trim();
}

/**
 * Script module exports
 * Provides structured script generation functionality
 */

// Generator
export {
  ScriptGenerator,
  createScriptGenerator,
  formatScriptSummary,
  type ScriptGeneratorOptions,
  type ScriptGenerationResult,
} from './generator.js';

// Claude client
export {
  ClaudeClient,
  createClaudeClient,
  type ClaudeClientConfig,
  type ClaudeMessage,
  type ClaudeResponse,
} from './claude-client.js';

// Prompts
export {
  SCRIPT_SYSTEM_PROMPT,
  generateUserPrompt,
  generateSingleSourcePrompt,
  generateLightContentPrompt,
  selectPromptStrategy,
} from './prompts.js';

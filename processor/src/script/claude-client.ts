/**
 * Claude API client wrapper
 * Handles structured output generation for podcast scripts
 */

import { ClaudeAPIError, retry, isRetryableError } from '@briefcast/shared';
import type { ProcessorEnv } from '@briefcast/shared';

// Node.js fetch is available in Node 18+
declare const fetch: typeof globalThis.fetch;

/**
 * Claude message structure
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Claude API response structure
 */
export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude API client configuration
 */
export interface ClaudeClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Claude API endpoint
 */
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Default configuration values
 */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Create Claude client from environment
 */
export function createClaudeClient(env: ProcessorEnv): ClaudeClient {
  return new ClaudeClient({
    apiKey: env.ANTHROPIC_API_KEY,
  });
}

/**
 * Claude API client for script generation
 */
export class ClaudeClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: ClaudeClientConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  }

  /**
   * Send a message to Claude and get a response
   */
  async sendMessage(
    systemPrompt: string,
    messages: ClaudeMessage[]
  ): Promise<string> {
    const response = await retry(
      () => this.makeRequest(systemPrompt, messages),
      {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 10000,
        shouldRetry: isRetryableError,
      }
    );

    // Extract text from response
    const textContent = response.content.find(
      (c: { type: string; text?: string }) => c.type === 'text'
    );
    if (!textContent) {
      throw new ClaudeAPIError('No text content in response');
    }

    return textContent.text;
  }

  /**
   * Generate structured JSON output
   */
  async generateJson<T>(
    systemPrompt: string,
    userPrompt: string,
    parseJson: (text: string) => T
  ): Promise<T> {
    const messages: ClaudeMessage[] = [
      { role: 'user', content: userPrompt },
    ];

    const responseText = await this.sendMessage(systemPrompt, messages);

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonText = extractJsonFromText(responseText);

    try {
      return parseJson(jsonText);
    } catch (error) {
      throw new ClaudeAPIError(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        {
          responseText: responseText.substring(0, 500),
          originalError: error,
        }
      );
    }
  }

  /**
   * Make raw API request
   */
  private async makeRequest(
    systemPrompt: string,
    messages: ClaudeMessage[]
  ): Promise<ClaudeResponse> {
    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages,
    };

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ClaudeAPIError(
          `Claude API error: ${response.status} ${response.statusText}`,
          response.status,
          { errorText }
        );
      }

      return (await response.json()) as ClaudeResponse;
    } catch (error) {
      if (error instanceof ClaudeAPIError) {
        throw error;
      }
      throw new ClaudeAPIError(
        `Claude API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { originalError: error }
      );
    }
  }
}

/**
 * Extract JSON from text that may be wrapped in markdown code blocks
 */
function extractJsonFromText(text: string): string {
  // Try to extract from ```json ... ``` blocks
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return jsonBlockMatch[1].trim();
  }

  // Try to extract from ``` ... ``` blocks
  const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch && jsonMatch[0]) {
    return jsonMatch[0];
  }

  // Return as-is and let JSON.parse handle errors
  return text.trim();
}

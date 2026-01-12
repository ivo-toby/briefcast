/**
 * OpenAI TTS client
 * Generates speech from text using OpenAI's TTS API
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { TTSAPIError, withRetry, isRetryableError } from '@briefcast/shared';
import type { ProcessorEnv } from '@briefcast/shared';

// Node.js fetch is available in Node 18+
declare const fetch: typeof globalThis.fetch;

/**
 * TTS voice options
 */
export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * TTS model options
 */
export type TTSModel = 'tts-1' | 'tts-1-hd';

/**
 * TTS client configuration
 */
export interface TTSClientConfig {
  apiKey: string;
  model?: TTSModel;
  voice?: TTSVoice;
  speed?: number;
}

/**
 * TTS generation options
 */
export interface TTSOptions {
  voice?: TTSVoice;
  speed?: number;
}

/**
 * TTS generation result
 */
export interface TTSResult {
  audioPath: string;
  durationEstimate: number; // Estimated based on word count
  bytesWritten: number;
}

/**
 * OpenAI TTS API endpoint
 */
const TTS_API_URL = 'https://api.openai.com/v1/audio/speech';

/**
 * Default configuration
 */
const DEFAULT_MODEL: TTSModel = 'tts-1';
const DEFAULT_VOICE: TTSVoice = 'nova';
const DEFAULT_SPEED = 1.0;

/**
 * OpenAI TTS client
 */
export class OpenAITTSClient {
  private readonly apiKey: string;
  private readonly model: TTSModel;
  private readonly defaultVoice: TTSVoice;
  private readonly defaultSpeed: number;

  constructor(config: TTSClientConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.defaultVoice = config.voice ?? DEFAULT_VOICE;
    this.defaultSpeed = config.speed ?? DEFAULT_SPEED;
  }

  /**
   * Generate speech from text
   */
  async generateSpeech(
    text: string,
    outputPath: string,
    options: TTSOptions = {}
  ): Promise<TTSResult> {
    const voice = options.voice ?? this.defaultVoice;
    const speed = options.speed ?? this.defaultSpeed;

    // Estimate duration based on word count (~150 wpm at 1.0x speed)
    const wordCount = text.split(/\s+/).length;
    const durationEstimate = (wordCount / 150 / speed) * 60;

    const audioBuffer = await withRetry(
      async () => this.makeRequest(text, voice, speed),
      {
        maxAttempts: 3,
        backoffMs: 1000,
        maxBackoffMs: 10000,
        shouldRetry: isRetryableError,
      }
    );

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Write audio file
    await fs.writeFile(outputPath, audioBuffer);

    return {
      audioPath: outputPath,
      durationEstimate,
      bytesWritten: audioBuffer.length,
    };
  }

  /**
   * Make TTS API request
   */
  private async makeRequest(
    text: string,
    voice: TTSVoice,
    speed: number
  ): Promise<Buffer> {
    try {
      const response = await fetch(TTS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          voice,
          speed,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new TTSAPIError(
          `OpenAI TTS error: ${response.status} ${response.statusText}`,
          response.status,
          { errorText }
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof TTSAPIError) {
        throw error;
      }
      throw new TTSAPIError(
        `TTS request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { originalError: error }
      );
    }
  }

  /**
   * Check text length limit
   * OpenAI TTS has a 4096 character limit
   */
  static validateTextLength(text: string): boolean {
    return text.length <= 4096;
  }

  /**
   * Split long text into chunks that fit within the limit
   */
  static splitText(text: string, maxLength: number = 4000): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        // If single sentence is too long, split by words
        if (sentence.length > maxLength) {
          const words = sentence.split(/\s+/);
          currentChunk = '';
          for (const word of words) {
            if (currentChunk.length + word.length + 1 <= maxLength) {
              currentChunk += (currentChunk ? ' ' : '') + word;
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = word;
            }
          }
        } else {
          currentChunk = sentence;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}

/**
 * Create TTS client from environment
 */
export function createTTSClient(env: ProcessorEnv): OpenAITTSClient {
  return new OpenAITTSClient({
    apiKey: env.OPENAI_API_KEY,
  });
}

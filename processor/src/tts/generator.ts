/**
 * Section-based TTS generator
 * Generates audio for each section of a structured script
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ProcessorEnv, Config } from '@briefcast/shared';
import type { StructuredScript, ScriptSection } from '@briefcast/shared';
import { TTSAPIError } from '@briefcast/shared';
import { OpenAITTSClient, createTTSClient, type TTSVoice } from './openai-client.js';

/**
 * Generated section audio
 */
export interface SectionAudio {
  sectionIndex: number;
  type: string;
  title?: string;
  audioPath: string;
  durationEstimate: number;
  bytesWritten: number;
}

/**
 * TTS generation result for full script
 */
export interface ScriptAudioResult {
  sections: SectionAudio[];
  totalDurationEstimate: number;
  totalBytes: number;
}

/**
 * TTS generator options
 */
export interface TTSGeneratorOptions {
  outputDir: string;
  voice?: TTSVoice;
  speed?: number;
}

/**
 * Section-based TTS generator
 */
export class TTSGenerator {
  private readonly client: OpenAITTSClient;
  private readonly config: Config;

  constructor(env: ProcessorEnv, config: Config) {
    this.client = createTTSClient(env);
    this.config = config;
  }

  /**
   * Generate audio for all sections in a script
   */
  async generateScriptAudio(
    script: StructuredScript,
    options: TTSGeneratorOptions
  ): Promise<ScriptAudioResult> {
    // Ensure output directory exists
    await fs.mkdir(options.outputDir, { recursive: true });

    const sectionAudios: SectionAudio[] = [];
    let totalDuration = 0;
    let totalBytes = 0;

    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];
      const audio = await this.generateSectionAudio(
        section,
        i,
        script.date,
        options
      );

      sectionAudios.push(audio);
      totalDuration += audio.durationEstimate;
      totalBytes += audio.bytesWritten;
    }

    return {
      sections: sectionAudios,
      totalDurationEstimate: totalDuration,
      totalBytes,
    };
  }

  /**
   * Generate audio for a single section
   */
  async generateSectionAudio(
    section: ScriptSection,
    index: number,
    date: string,
    options: TTSGeneratorOptions
  ): Promise<SectionAudio> {
    const voice = options.voice ?? this.getVoiceForSection(section);
    const speed = options.speed ?? this.config.tts.speed;

    // Build output path
    const filename = `${date}-${index.toString().padStart(2, '0')}-${section.type}.mp3`;
    const outputPath = path.join(options.outputDir, filename);

    // Check if content is too long
    const chunks = OpenAITTSClient.splitText(section.content);

    if (chunks.length === 1) {
      // Single chunk - direct generation
      const result = await this.client.generateSpeech(
        section.content,
        outputPath,
        { voice, speed }
      );

      return {
        sectionIndex: index,
        type: section.type,
        title: section.title,
        audioPath: outputPath,
        durationEstimate: result.durationEstimate,
        bytesWritten: result.bytesWritten,
      };
    }

    // Multiple chunks - generate and concatenate
    const chunkPaths: string[] = [];
    let totalDuration = 0;
    let totalBytes = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkPath = path.join(
        options.outputDir,
        `${date}-${index.toString().padStart(2, '0')}-${section.type}-chunk${i}.mp3`
      );

      const result = await this.client.generateSpeech(chunks[i], chunkPath, {
        voice,
        speed,
      });

      chunkPaths.push(chunkPath);
      totalDuration += result.durationEstimate;
      totalBytes += result.bytesWritten;
    }

    // Concatenate chunks (requires FFmpeg)
    await this.concatenateChunks(chunkPaths, outputPath);

    // Cleanup chunk files
    for (const chunkPath of chunkPaths) {
      await fs.unlink(chunkPath).catch(() => {});
    }

    return {
      sectionIndex: index,
      type: section.type,
      title: section.title,
      audioPath: outputPath,
      durationEstimate: totalDuration,
      bytesWritten: totalBytes,
    };
  }

  /**
   * Get appropriate voice for section type
   */
  private getVoiceForSection(section: ScriptSection): TTSVoice {
    // Use consistent voice from config
    return this.config.tts.voice as TTSVoice;
  }

  /**
   * Concatenate audio chunks using FFmpeg
   */
  private async concatenateChunks(
    chunkPaths: string[],
    outputPath: string
  ): Promise<void> {
    // Import FFmpeg wrapper dynamically to avoid circular dependency
    const { createFFmpegWrapper } = await import('../audio/ffmpeg.js');
    const ffmpeg = createFFmpegWrapper();
    await ffmpeg.concatenate(chunkPaths, outputPath);
  }
}

/**
 * Create TTS generator from environment
 */
export function createTTSGenerator(
  env: ProcessorEnv,
  config: Config
): TTSGenerator {
  return new TTSGenerator(env, config);
}

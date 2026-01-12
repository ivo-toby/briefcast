/**
 * Multi-level audio normalizer
 * Implements chunk → section → episode normalization pipeline
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { Config, LoudnessMeasurement } from '@briefcast/shared';
import { AudioProcessingError } from '@briefcast/shared';
import { FFmpegWrapper, createFFmpegWrapper, type NormalizationOptions } from './ffmpeg.js';

/**
 * Normalization level
 */
export type NormalizationLevel = 'chunk' | 'section' | 'episode';

/**
 * Normalization result for a single file
 */
export interface NormalizationResult {
  inputPath: string;
  outputPath: string;
  level: NormalizationLevel;
  beforeLoudness: LoudnessMeasurement;
  afterLoudness?: LoudnessMeasurement;
  targetLufs: number;
}

/**
 * Multi-level normalization pipeline result
 */
export interface PipelineResult {
  results: NormalizationResult[];
  finalOutputPath: string;
  totalDurationSeconds: number;
}

/**
 * Multi-level audio normalizer
 */
export class AudioNormalizer {
  private readonly ffmpeg: FFmpegWrapper;
  private readonly config: Config;
  private readonly tempDir: string;

  constructor(config: Config, tempDir: string = '/tmp/briefcast') {
    this.config = config;
    this.tempDir = tempDir;
    this.ffmpeg = createFFmpegWrapper({ tempDir });
  }

  /**
   * Get target LUFS for a normalization level
   */
  private getTargetLufs(level: NormalizationLevel): number {
    const audioConfig = this.config.audio.normalization;
    switch (level) {
      case 'chunk':
        // Chunks get normalized slightly louder to account for level adjustments
        return audioConfig.targetLufs + 2;
      case 'section':
        // Sections get normalized to a middle level
        return audioConfig.targetLufs + 1;
      case 'episode':
        // Final episode gets exact target
        return audioConfig.targetLufs;
      default:
        return audioConfig.targetLufs;
    }
  }

  /**
   * Normalize a single audio file
   */
  async normalizeFile(
    inputPath: string,
    outputPath: string,
    level: NormalizationLevel = 'episode'
  ): Promise<NormalizationResult> {
    const targetLufs = this.getTargetLufs(level);
    const maxPeakDb = this.config.audio.normalization.maxPeakDb;

    // Measure before loudness
    const beforeLoudness = await this.ffmpeg.measureLoudness(inputPath);

    // Skip if already close to target (within 1 dB)
    if (Math.abs(beforeLoudness.inputI - targetLufs) < 1) {
      await fs.copyFile(inputPath, outputPath);
      return {
        inputPath,
        outputPath,
        level,
        beforeLoudness,
        targetLufs,
      };
    }

    // Apply two-pass normalization
    await this.ffmpeg.normalize(inputPath, outputPath, {
      targetLufs,
      maxPeakDb,
    });

    // Measure after loudness
    const afterLoudness = await this.ffmpeg.measureLoudness(outputPath);

    return {
      inputPath,
      outputPath,
      level,
      beforeLoudness,
      afterLoudness,
      targetLufs,
    };
  }

  /**
   * Normalize multiple files at the same level
   */
  async normalizeBatch(
    inputPaths: string[],
    outputDir: string,
    level: NormalizationLevel
  ): Promise<NormalizationResult[]> {
    await fs.mkdir(outputDir, { recursive: true });

    const results: NormalizationResult[] = [];

    for (const inputPath of inputPaths) {
      const filename = path.basename(inputPath);
      const outputPath = path.join(outputDir, `normalized-${filename}`);

      const result = await this.normalizeFile(inputPath, outputPath, level);
      results.push(result);
    }

    return results;
  }

  /**
   * Run full multi-level normalization pipeline
   *
   * 1. Normalize each chunk (TTS outputs)
   * 2. Concatenate chunks into sections
   * 3. Normalize each section
   * 4. Concatenate sections into episode
   * 5. Final episode normalization
   */
  async runPipeline(
    chunkPaths: string[],
    outputPath: string,
    options?: {
      sectionBoundaries?: number[]; // Indices where new sections start
    }
  ): Promise<PipelineResult> {
    await fs.mkdir(this.tempDir, { recursive: true });

    const results: NormalizationResult[] = [];
    const timestamp = Date.now();

    // Step 1: Normalize chunks
    const normalizedChunkDir = path.join(this.tempDir, `chunks-${timestamp}`);
    const chunkResults = await this.normalizeBatch(
      chunkPaths,
      normalizedChunkDir,
      'chunk'
    );
    results.push(...chunkResults);

    // Get normalized chunk paths
    const normalizedChunkPaths = chunkResults.map((r) => r.outputPath);

    // Step 2: Handle section boundaries if provided
    let sectionPaths: string[];

    if (options?.sectionBoundaries && options.sectionBoundaries.length > 0) {
      // Split chunks into sections
      sectionPaths = await this.createSections(
        normalizedChunkPaths,
        options.sectionBoundaries,
        timestamp
      );

      // Normalize sections
      const sectionDir = path.join(this.tempDir, `sections-${timestamp}`);
      const sectionResults = await this.normalizeBatch(
        sectionPaths,
        sectionDir,
        'section'
      );
      results.push(...sectionResults);
      sectionPaths = sectionResults.map((r) => r.outputPath);
    } else {
      // No section boundaries - treat all chunks as one section
      sectionPaths = normalizedChunkPaths;
    }

    // Step 3: Concatenate sections into episode
    const rawEpisodePath = path.join(this.tempDir, `episode-raw-${timestamp}.mp3`);
    await this.ffmpeg.concatenate(sectionPaths, rawEpisodePath);

    // Step 4: Final episode normalization
    const episodeResult = await this.normalizeFile(
      rawEpisodePath,
      outputPath,
      'episode'
    );
    results.push(episodeResult);

    // Get total duration
    const info = await this.ffmpeg.getAudioInfo(outputPath);

    // Cleanup temp files
    await this.cleanup(timestamp);

    return {
      results,
      finalOutputPath: outputPath,
      totalDurationSeconds: info.durationSeconds,
    };
  }

  /**
   * Create section audio files from chunks
   */
  private async createSections(
    chunkPaths: string[],
    boundaries: number[],
    timestamp: number
  ): Promise<string[]> {
    const sectionDir = path.join(this.tempDir, `section-concat-${timestamp}`);
    await fs.mkdir(sectionDir, { recursive: true });

    const sectionPaths: string[] = [];
    const allBoundaries = [0, ...boundaries, chunkPaths.length];

    for (let i = 0; i < allBoundaries.length - 1; i++) {
      const start = allBoundaries[i];
      const end = allBoundaries[i + 1];
      const sectionChunks = chunkPaths.slice(start, end);

      if (sectionChunks.length === 0) continue;

      const sectionPath = path.join(sectionDir, `section-${i}.mp3`);

      if (sectionChunks.length === 1) {
        await fs.copyFile(sectionChunks[0], sectionPath);
      } else {
        await this.ffmpeg.concatenate(sectionChunks, sectionPath);
      }

      sectionPaths.push(sectionPath);
    }

    return sectionPaths;
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(timestamp: number): Promise<void> {
    const patterns = [
      `chunks-${timestamp}`,
      `sections-${timestamp}`,
      `section-concat-${timestamp}`,
      `episode-raw-${timestamp}.mp3`,
    ];

    for (const pattern of patterns) {
      const fullPath = path.join(this.tempDir, pattern);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await fs.rm(fullPath, { recursive: true });
        } else {
          await fs.unlink(fullPath);
        }
      } catch {
        // Ignore if doesn't exist
      }
    }
  }

  /**
   * Quick normalize for music files (different target)
   */
  async normalizeMusic(
    inputPath: string,
    outputPath: string
  ): Promise<NormalizationResult> {
    const targetLufs = this.config.audio.normalization.musicTargetLufs;
    const maxPeakDb = this.config.audio.normalization.maxPeakDb;

    const beforeLoudness = await this.ffmpeg.measureLoudness(inputPath);

    await this.ffmpeg.normalize(inputPath, outputPath, {
      targetLufs,
      maxPeakDb,
    });

    const afterLoudness = await this.ffmpeg.measureLoudness(outputPath);

    return {
      inputPath,
      outputPath,
      level: 'episode', // Music is treated as episode-level
      beforeLoudness,
      afterLoudness,
      targetLufs,
    };
  }
}

/**
 * Create audio normalizer from config
 */
export function createAudioNormalizer(
  config: Config,
  tempDir?: string
): AudioNormalizer {
  return new AudioNormalizer(config, tempDir);
}

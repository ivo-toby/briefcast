/**
 * Audio assembler
 * Combines section audio with intro/outro music and transitions
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { Config, EpisodeSectionInfo, SectionType } from '@briefcast/shared';
import { AudioProcessingError, STORAGE_KEYS } from '@briefcast/shared';
import { FFmpegWrapper, createFFmpegWrapper } from './ffmpeg.js';
import { AudioNormalizer, createAudioNormalizer } from './normalizer.js';
import type { R2StorageClient } from '../storage/r2-client.js';

/**
 * Section audio info for assembly
 */
export interface AssemblySectionInput {
  type: SectionType;
  title?: string;
  audioPath: string;
}

/**
 * Assembled episode result
 */
export interface AssembledEpisode {
  audioPath: string;
  durationSeconds: number;
  fileSizeBytes: number;
  sections: EpisodeSectionInfo[];
}

/**
 * Assembler options
 */
export interface AssemblerOptions {
  tempDir?: string;
  includeIntroMusic?: boolean;
  includeOutroMusic?: boolean;
  includeTransitions?: boolean;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  transitionDuration?: number;
}

const DEFAULT_OPTIONS: Required<AssemblerOptions> = {
  tempDir: '/tmp/briefcast',
  includeIntroMusic: true,
  includeOutroMusic: true,
  includeTransitions: true,
  fadeInDuration: 2,
  fadeOutDuration: 3,
  transitionDuration: 1,
};

/**
 * Audio assembler class
 */
export class AudioAssembler {
  private readonly ffmpeg: FFmpegWrapper;
  private readonly normalizer: AudioNormalizer;
  private readonly config: Config;
  private readonly r2Client: R2StorageClient;
  private readonly tempDir: string;

  constructor(
    config: Config,
    r2Client: R2StorageClient,
    tempDir: string = '/tmp/briefcast'
  ) {
    this.config = config;
    this.r2Client = r2Client;
    this.tempDir = tempDir;
    this.ffmpeg = createFFmpegWrapper({ tempDir });
    this.normalizer = createAudioNormalizer(config, tempDir);
  }

  /**
   * Assemble episode from section audio files
   */
  async assembleEpisode(
    sections: AssemblySectionInput[],
    outputPath: string,
    options: AssemblerOptions = {}
  ): Promise<AssembledEpisode> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    await fs.mkdir(opts.tempDir, { recursive: true });

    const timestamp = Date.now();
    const audioParts: string[] = [];
    const sectionInfos: EpisodeSectionInfo[] = [];
    let currentTime = 0;

    // 1. Add intro music if enabled
    if (opts.includeIntroMusic && this.config.audio.music.enabled) {
      const introPath = await this.getOrDownloadMusic('intro', timestamp);
      if (introPath) {
        // Add fade in to intro music
        const fadedIntroPath = path.join(opts.tempDir, `intro-faded-${timestamp}.mp3`);
        await this.ffmpeg.addFade(introPath, fadedIntroPath, opts.fadeInDuration, 0);
        audioParts.push(fadedIntroPath);

        const introInfo = await this.ffmpeg.getAudioInfo(fadedIntroPath);
        currentTime += introInfo.durationSeconds;
      }
    }

    // 2. Add each section with optional transitions
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Add transition between sections (except before first)
      if (i > 0 && opts.includeTransitions && this.config.audio.music.enabled) {
        const transitionPath = await this.getOrDownloadMusic('transition', timestamp, i);
        if (transitionPath) {
          audioParts.push(transitionPath);
          const transInfo = await this.ffmpeg.getAudioInfo(transitionPath);
          currentTime += transInfo.durationSeconds;
        }
      }

      // Record section start time
      const sectionStart = currentTime;

      // Add section audio
      audioParts.push(section.audioPath);
      const sectionInfo = await this.ffmpeg.getAudioInfo(section.audioPath);
      currentTime += sectionInfo.durationSeconds;

      // Record section info
      sectionInfos.push({
        type: section.type,
        title: section.title,
        startTimeSeconds: sectionStart,
        durationSeconds: sectionInfo.durationSeconds,
      });
    }

    // 3. Add outro music if enabled
    if (opts.includeOutroMusic && this.config.audio.music.enabled) {
      const outroPath = await this.getOrDownloadMusic('outro', timestamp);
      if (outroPath) {
        // Add fade out to outro music
        const fadedOutroPath = path.join(opts.tempDir, `outro-faded-${timestamp}.mp3`);
        await this.ffmpeg.addFade(outroPath, fadedOutroPath, 0, opts.fadeOutDuration);
        audioParts.push(fadedOutroPath);
      }
    }

    // 4. Concatenate all parts
    const rawPath = path.join(opts.tempDir, `episode-raw-${timestamp}.mp3`);
    await this.ffmpeg.concatenate(audioParts, rawPath);

    // 5. Final normalization and fade out
    const normalizedPath = path.join(opts.tempDir, `episode-normalized-${timestamp}.mp3`);
    await this.normalizer.normalizeFile(rawPath, normalizedPath, 'episode');

    // 6. Add final fade out
    await this.ffmpeg.addFade(normalizedPath, outputPath, 0, opts.fadeOutDuration);

    // Get final file info
    const finalInfo = await this.ffmpeg.getAudioInfo(outputPath);
    const fileStat = await fs.stat(outputPath);

    // Cleanup temp files
    await this.cleanup(timestamp);

    return {
      audioPath: outputPath,
      durationSeconds: finalInfo.durationSeconds,
      fileSizeBytes: fileStat.size,
      sections: sectionInfos,
    };
  }

  /**
   * Get or download music file from R2
   */
  private async getOrDownloadMusic(
    type: 'intro' | 'outro' | 'transition',
    timestamp: number,
    index?: number
  ): Promise<string | null> {
    try {
      let key: string;

      switch (type) {
        case 'intro':
          key = `${STORAGE_KEYS.MUSIC_PREFIX}intro.mp3`;
          break;
        case 'outro':
          key = `${STORAGE_KEYS.MUSIC_PREFIX}outro.mp3`;
          break;
        case 'transition':
          // Try numbered transition first, fall back to default
          key = `${STORAGE_KEYS.MUSIC_PREFIX}transition-${index ?? 1}.mp3`;
          break;
        default:
          return null;
      }

      // Check if music exists
      const exists = await this.r2Client.objectExists(key);
      if (!exists) {
        // For transitions, try default
        if (type === 'transition') {
          const defaultKey = `${STORAGE_KEYS.MUSIC_PREFIX}transition.mp3`;
          const defaultExists = await this.r2Client.objectExists(defaultKey);
          if (!defaultExists) return null;
          key = defaultKey;
        } else {
          return null;
        }
      }

      // Download to temp directory
      const localPath = path.join(
        this.tempDir,
        `music-${type}-${index ?? 0}-${timestamp}.mp3`
      );
      const buffer = await this.r2Client.getObject(key);
      await fs.writeFile(localPath, buffer);

      // Normalize music to appropriate level
      const normalizedPath = path.join(
        this.tempDir,
        `music-${type}-${index ?? 0}-norm-${timestamp}.mp3`
      );
      await this.normalizer.normalizeMusic(localPath, normalizedPath);

      return normalizedPath;
    } catch {
      // Music is optional, don't fail if not available
      return null;
    }
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(timestamp: number): Promise<void> {
    const files = await fs.readdir(this.tempDir);
    for (const file of files) {
      if (file.includes(String(timestamp))) {
        await fs.unlink(path.join(this.tempDir, file)).catch(() => {});
      }
    }
  }

  /**
   * Simple assembly without music (for testing or fallback)
   */
  async assembleSimple(
    sectionPaths: string[],
    outputPath: string
  ): Promise<AssembledEpisode> {
    const sectionInfos: EpisodeSectionInfo[] = [];
    let currentTime = 0;

    // Get section info for timing
    for (let i = 0; i < sectionPaths.length; i++) {
      const info = await this.ffmpeg.getAudioInfo(sectionPaths[i]);
      sectionInfos.push({
        type: i === 0 ? 'intro' : i === sectionPaths.length - 1 ? 'synthesis' : 'topic',
        startTimeSeconds: currentTime,
        durationSeconds: info.durationSeconds,
      });
      currentTime += info.durationSeconds;
    }

    // Concatenate and normalize
    const timestamp = Date.now();
    const rawPath = path.join(this.tempDir, `simple-raw-${timestamp}.mp3`);
    await this.ffmpeg.concatenate(sectionPaths, rawPath);

    await this.normalizer.normalizeFile(rawPath, outputPath, 'episode');

    const finalInfo = await this.ffmpeg.getAudioInfo(outputPath);
    const fileStat = await fs.stat(outputPath);

    // Cleanup
    await fs.unlink(rawPath).catch(() => {});

    return {
      audioPath: outputPath,
      durationSeconds: finalInfo.durationSeconds,
      fileSizeBytes: fileStat.size,
      sections: sectionInfos,
    };
  }
}

/**
 * Create audio assembler from config
 */
export function createAudioAssembler(
  config: Config,
  r2Client: R2StorageClient,
  tempDir?: string
): AudioAssembler {
  return new AudioAssembler(config, r2Client, tempDir);
}

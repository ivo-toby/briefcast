/**
 * FFmpeg wrapper for audio processing
 * Handles normalization, concatenation, and format conversion
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AudioProcessingError } from '@briefcast/shared';
import type { LoudnessMeasurement } from '@briefcast/shared';

const exec = promisify(execCallback);

/**
 * FFmpeg options for various operations
 */
export interface FFmpegOptions {
  tempDir?: string;
  verbose?: boolean;
}

/**
 * Audio file information
 */
export interface AudioInfo {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  codec: string;
  bitrate?: number;
}

/**
 * Normalization options
 */
export interface NormalizationOptions {
  targetLufs: number;
  maxPeakDb: number;
}

/**
 * Default normalization targets (EBU R128)
 */
const DEFAULT_NORMALIZATION: NormalizationOptions = {
  targetLufs: -16,
  maxPeakDb: -1,
};

/**
 * FFmpeg wrapper class
 */
export class FFmpegWrapper {
  private readonly tempDir: string;
  private readonly verbose: boolean;

  constructor(options: FFmpegOptions = {}) {
    this.tempDir = options.tempDir ?? '/tmp/briefcast';
    this.verbose = options.verbose ?? false;
  }

  /**
   * Check if FFmpeg is available
   */
  async checkAvailable(): Promise<boolean> {
    try {
      await exec('ffmpeg -version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get audio file information
   */
  async getAudioInfo(inputPath: string): Promise<AudioInfo> {
    try {
      const { stdout } = await exec(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`
      );

      const probe = JSON.parse(stdout);
      const audioStream = probe.streams?.find(
        (s: { codec_type?: string }) => s.codec_type === 'audio'
      );

      if (!audioStream) {
        throw new AudioProcessingError('No audio stream found', { inputPath });
      }

      return {
        durationSeconds: parseFloat(probe.format?.duration ?? audioStream.duration ?? '0'),
        sampleRate: parseInt(audioStream.sample_rate ?? '44100', 10),
        channels: audioStream.channels ?? 2,
        codec: audioStream.codec_name ?? 'unknown',
        bitrate: probe.format?.bit_rate
          ? parseInt(probe.format.bit_rate, 10)
          : undefined,
      };
    } catch (error) {
      if (error instanceof AudioProcessingError) throw error;
      throw new AudioProcessingError(
        `Failed to get audio info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPath, originalError: error }
      );
    }
  }

  /**
   * Measure loudness using EBU R128 loudnorm filter
   */
  async measureLoudness(inputPath: string): Promise<LoudnessMeasurement> {
    try {
      // First pass: analyze loudness
      const { stderr } = await exec(
        `ffmpeg -i "${inputPath}" -af loudnorm=I=-16:TP=-1:LRA=11:print_format=json -f null - 2>&1`
      );

      // Extract JSON from output
      const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
      if (!jsonMatch) {
        throw new AudioProcessingError('Failed to parse loudness measurement', {
          inputPath,
          output: stderr.substring(0, 500),
        });
      }

      const measurement = JSON.parse(jsonMatch[0]);

      return {
        inputI: parseFloat(measurement.input_i),
        inputTp: parseFloat(measurement.input_tp),
        inputLra: parseFloat(measurement.input_lra),
        inputThresh: parseFloat(measurement.input_thresh),
        offset: parseFloat(measurement.target_offset),
      };
    } catch (error) {
      if (error instanceof AudioProcessingError) throw error;
      throw new AudioProcessingError(
        `Failed to measure loudness: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPath, originalError: error }
      );
    }
  }

  /**
   * Normalize audio to target LUFS using two-pass loudnorm
   */
  async normalize(
    inputPath: string,
    outputPath: string,
    options: NormalizationOptions = DEFAULT_NORMALIZATION
  ): Promise<void> {
    try {
      // First pass: get measurements
      const measurement = await this.measureLoudness(inputPath);

      // Second pass: apply normalization with measured values
      await exec(
        `ffmpeg -y -i "${inputPath}" -af loudnorm=I=${options.targetLufs}:TP=${options.maxPeakDb}:LRA=11:measured_I=${measurement.inputI}:measured_TP=${measurement.inputTp}:measured_LRA=${measurement.inputLra}:measured_thresh=${measurement.inputThresh}:offset=${measurement.offset}:linear=true "${outputPath}"`
      );
    } catch (error) {
      if (error instanceof AudioProcessingError) throw error;
      throw new AudioProcessingError(
        `Failed to normalize audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPath, outputPath, originalError: error }
      );
    }
  }

  /**
   * Quick normalize with single-pass loudnorm (faster but less accurate)
   */
  async quickNormalize(
    inputPath: string,
    outputPath: string,
    options: NormalizationOptions = DEFAULT_NORMALIZATION
  ): Promise<void> {
    try {
      await exec(
        `ffmpeg -y -i "${inputPath}" -af loudnorm=I=${options.targetLufs}:TP=${options.maxPeakDb}:LRA=11 "${outputPath}"`
      );
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to quick normalize: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPath, outputPath, originalError: error }
      );
    }
  }

  /**
   * Concatenate audio files
   */
  async concatenate(
    inputPaths: string[],
    outputPath: string
  ): Promise<void> {
    if (inputPaths.length === 0) {
      throw new AudioProcessingError('No input files provided for concatenation');
    }

    if (inputPaths.length === 1) {
      // Just copy if single file
      await fs.copyFile(inputPaths[0], outputPath);
      return;
    }

    try {
      // Create concat file list
      await fs.mkdir(this.tempDir, { recursive: true });
      const listPath = path.join(this.tempDir, `concat-${Date.now()}.txt`);
      const fileList = inputPaths.map((p) => `file '${p}'`).join('\n');
      await fs.writeFile(listPath, fileList);

      // Concatenate
      await exec(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`
      );

      // Cleanup
      await fs.unlink(listPath);
    } catch (error) {
      if (error instanceof AudioProcessingError) throw error;
      throw new AudioProcessingError(
        `Failed to concatenate: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPaths, outputPath, originalError: error }
      );
    }
  }

  /**
   * Mix audio files (overlay)
   */
  async mixAudio(
    inputs: Array<{ path: string; volume?: number }>,
    outputPath: string
  ): Promise<void> {
    if (inputs.length === 0) {
      throw new AudioProcessingError('No input files provided for mixing');
    }

    try {
      const inputArgs = inputs.map((i) => `-i "${i.path}"`).join(' ');
      const volumeFilters = inputs
        .map((i, idx) => (i.volume !== undefined ? `[${idx}]volume=${i.volume}[a${idx}]` : `[${idx}]anull[a${idx}]`))
        .join(';');
      const mixInputs = inputs.map((_, idx) => `[a${idx}]`).join('');

      await exec(
        `ffmpeg -y ${inputArgs} -filter_complex "${volumeFilters};${mixInputs}amix=inputs=${inputs.length}:duration=longest" "${outputPath}"`
      );
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to mix audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputs, outputPath, originalError: error }
      );
    }
  }

  /**
   * Convert audio format
   */
  async convert(
    inputPath: string,
    outputPath: string,
    options?: {
      sampleRate?: number;
      channels?: number;
      bitrate?: string;
      codec?: string;
    }
  ): Promise<void> {
    try {
      const args: string[] = [];

      if (options?.sampleRate) args.push(`-ar ${options.sampleRate}`);
      if (options?.channels) args.push(`-ac ${options.channels}`);
      if (options?.bitrate) args.push(`-b:a ${options.bitrate}`);
      if (options?.codec) args.push(`-acodec ${options.codec}`);

      await exec(
        `ffmpeg -y -i "${inputPath}" ${args.join(' ')} "${outputPath}"`
      );
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to convert: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPath, outputPath, originalError: error }
      );
    }
  }

  /**
   * Apply crossfade between two audio files
   */
  async crossfade(
    input1: string,
    input2: string,
    outputPath: string,
    durationSeconds: number = 2
  ): Promise<void> {
    try {
      await exec(
        `ffmpeg -y -i "${input1}" -i "${input2}" -filter_complex "acrossfade=d=${durationSeconds}:c1=tri:c2=tri" "${outputPath}"`
      );
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to crossfade: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { input1, input2, outputPath, originalError: error }
      );
    }
  }

  /**
   * Trim audio file
   */
  async trim(
    inputPath: string,
    outputPath: string,
    startSeconds: number,
    durationSeconds?: number
  ): Promise<void> {
    try {
      const durationArg = durationSeconds !== undefined ? `-t ${durationSeconds}` : '';
      await exec(
        `ffmpeg -y -ss ${startSeconds} -i "${inputPath}" ${durationArg} -c copy "${outputPath}"`
      );
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to trim: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPath, outputPath, startSeconds, durationSeconds, originalError: error }
      );
    }
  }

  /**
   * Add fade in/out
   */
  async addFade(
    inputPath: string,
    outputPath: string,
    fadeIn: number = 0,
    fadeOut: number = 0
  ): Promise<void> {
    try {
      const info = await this.getAudioInfo(inputPath);
      const fadeOutStart = Math.max(0, info.durationSeconds - fadeOut);

      const filters: string[] = [];
      if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
      if (fadeOut > 0) filters.push(`afade=t=out:st=${fadeOutStart}:d=${fadeOut}`);

      if (filters.length === 0) {
        await fs.copyFile(inputPath, outputPath);
        return;
      }

      await exec(
        `ffmpeg -y -i "${inputPath}" -af "${filters.join(',')}" "${outputPath}"`
      );
    } catch (error) {
      if (error instanceof AudioProcessingError) throw error;
      throw new AudioProcessingError(
        `Failed to add fade: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { inputPath, outputPath, fadeIn, fadeOut, originalError: error }
      );
    }
  }

  /**
   * Apply loudness ducking (lower volume for background music)
   */
  async duck(
    voicePath: string,
    musicPath: string,
    outputPath: string,
    musicVolume: number = 0.2
  ): Promise<void> {
    try {
      await exec(
        `ffmpeg -y -i "${voicePath}" -i "${musicPath}" -filter_complex "[1:a]volume=${musicVolume}[music];[0:a][music]amix=inputs=2:duration=first" "${outputPath}"`
      );
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to duck audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { voicePath, musicPath, outputPath, originalError: error }
      );
    }
  }

  /**
   * Generate silence
   */
  async generateSilence(
    outputPath: string,
    durationSeconds: number,
    sampleRate: number = 44100
  ): Promise<void> {
    try {
      await exec(
        `ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=${sampleRate} -t ${durationSeconds} "${outputPath}"`
      );
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to generate silence: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { outputPath, durationSeconds, originalError: error }
      );
    }
  }
}

/**
 * Create FFmpeg wrapper with default options
 */
export function createFFmpegWrapper(options?: FFmpegOptions): FFmpegWrapper {
  return new FFmpegWrapper(options);
}

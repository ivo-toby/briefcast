/**
 * Audio module exports
 * Provides FFmpeg-based audio processing functionality
 */

// FFmpeg wrapper
export {
  FFmpegWrapper,
  createFFmpegWrapper,
  type FFmpegOptions,
  type AudioInfo,
  type NormalizationOptions,
} from './ffmpeg.js';

// Multi-level normalizer
export {
  AudioNormalizer,
  createAudioNormalizer,
  type NormalizationLevel,
  type NormalizationResult,
  type PipelineResult,
} from './normalizer.js';

// Audio assembler
export {
  AudioAssembler,
  createAudioAssembler,
  type AssemblySectionInput,
  type AssembledEpisode,
  type AssemblerOptions,
} from './assembler.js';

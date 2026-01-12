/**
 * Audio module exports
 * Provides FFmpeg-based audio processing functionality
 */

export {
  FFmpegWrapper,
  createFFmpegWrapper,
  type FFmpegOptions,
  type AudioInfo,
  type NormalizationOptions,
} from './ffmpeg.js';

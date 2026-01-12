/**
 * Unit tests for FFmpegWrapper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FFmpegWrapper, createFFmpegWrapper } from '../../src/audio/ffmpeg.js';
import { AudioProcessingError } from '@briefcast/shared';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs/promises';

// Mock child_process and fs
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  copyFile: vi.fn(),
}));

// Helper to create mock exec function
function mockExec(stdout: string = '', stderr: string = '') {
  const execMock = vi.mocked(childProcess.exec);
  execMock.mockImplementation((_cmd: string, callback?: Function) => {
    if (callback) {
      callback(null, { stdout, stderr });
    }
    return {} as any;
  });
  // For promisified version
  return vi.fn().mockResolvedValue({ stdout, stderr });
}

describe('FFmpegWrapper', () => {
  let wrapper: FFmpegWrapper;

  beforeEach(() => {
    wrapper = new FFmpegWrapper({ tempDir: '/tmp/test' });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create wrapper with default options', () => {
      const defaultWrapper = new FFmpegWrapper();
      expect(defaultWrapper).toBeInstanceOf(FFmpegWrapper);
    });

    it('should create wrapper with custom options', () => {
      const customWrapper = new FFmpegWrapper({
        tempDir: '/custom/temp',
        verbose: true,
      });
      expect(customWrapper).toBeInstanceOf(FFmpegWrapper);
    });
  });

  describe('createFFmpegWrapper', () => {
    it('should create wrapper instance', () => {
      const instance = createFFmpegWrapper();
      expect(instance).toBeInstanceOf(FFmpegWrapper);
    });

    it('should create wrapper with options', () => {
      const instance = createFFmpegWrapper({ tempDir: '/custom' });
      expect(instance).toBeInstanceOf(FFmpegWrapper);
    });
  });

  describe('checkAvailable', () => {
    it('should return true when FFmpeg is available', async () => {
      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(null, { stdout: 'ffmpeg version 6.0', stderr: '' });
        return {} as any;
      });

      // Create a new wrapper that uses the mocked exec
      const testWrapper = new FFmpegWrapper();
      const result = await testWrapper.checkAvailable();
      expect(result).toBe(true);
    });

    it('should return false when FFmpeg is not available', async () => {
      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(new Error('command not found'), null);
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      const result = await testWrapper.checkAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getAudioInfo', () => {
    it('should parse audio info from ffprobe output', async () => {
      const probeOutput = JSON.stringify({
        streams: [
          {
            codec_type: 'audio',
            codec_name: 'mp3',
            sample_rate: '44100',
            channels: 2,
            duration: '120.5',
          },
        ],
        format: {
          duration: '120.5',
          bit_rate: '192000',
        },
      });

      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(null, { stdout: probeOutput, stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      const info = await testWrapper.getAudioInfo('/test/audio.mp3');

      expect(info.durationSeconds).toBe(120.5);
      expect(info.sampleRate).toBe(44100);
      expect(info.channels).toBe(2);
      expect(info.codec).toBe('mp3');
      expect(info.bitrate).toBe(192000);
    });

    it('should throw AudioProcessingError when no audio stream found', async () => {
      const probeOutput = JSON.stringify({
        streams: [{ codec_type: 'video' }],
        format: {},
      });

      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(null, { stdout: probeOutput, stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await expect(testWrapper.getAudioInfo('/test/video.mp4'))
        .rejects.toThrow(AudioProcessingError);
    });

    it('should throw AudioProcessingError on ffprobe failure', async () => {
      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(new Error('ffprobe failed'), null);
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await expect(testWrapper.getAudioInfo('/nonexistent.mp3'))
        .rejects.toThrow(AudioProcessingError);
    });
  });

  describe('measureLoudness', () => {
    it('should parse loudness measurement from ffmpeg output', async () => {
      const loudnessOutput = `
        Some other output...
        {
          "input_i": "-24.5",
          "input_tp": "-3.2",
          "input_lra": "8.5",
          "input_thresh": "-35.2",
          "target_offset": "8.5"
        }
      `;

      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(null, { stdout: '', stderr: loudnessOutput });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      const measurement = await testWrapper.measureLoudness('/test/audio.mp3');

      expect(measurement.inputI).toBe(-24.5);
      expect(measurement.inputTp).toBe(-3.2);
      expect(measurement.inputLra).toBe(8.5);
      expect(measurement.inputThresh).toBe(-35.2);
      expect(measurement.offset).toBe(8.5);
    });

    it('should throw AudioProcessingError when measurement parsing fails', async () => {
      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(null, { stdout: '', stderr: 'no json here' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await expect(testWrapper.measureLoudness('/test/audio.mp3'))
        .rejects.toThrow(AudioProcessingError);
    });
  });

  describe('concatenate', () => {
    it('should throw error when no input files provided', async () => {
      await expect(wrapper.concatenate([], '/output.mp3'))
        .rejects.toThrow(AudioProcessingError);
    });

    it('should copy single file instead of concatenating', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.copyFile.mockResolvedValue(undefined);

      await wrapper.concatenate(['/input.mp3'], '/output.mp3');

      expect(fsMock.copyFile).toHaveBeenCalledWith('/input.mp3', '/output.mp3');
    });

    it('should create concat file list for multiple files', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.mkdir.mockResolvedValue(undefined);
      fsMock.writeFile.mockResolvedValue(undefined);
      fsMock.unlink.mockResolvedValue(undefined);

      const execMock = vi.mocked(childProcess.exec);
      execMock.mockImplementation((_cmd: string, callback?: Function) => {
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper({ tempDir: '/tmp/test' });
      await testWrapper.concatenate(['/input1.mp3', '/input2.mp3'], '/output.mp3');

      expect(fsMock.mkdir).toHaveBeenCalledWith('/tmp/test', { recursive: true });
      expect(fsMock.writeFile).toHaveBeenCalled();
    });
  });

  describe('mixAudio', () => {
    it('should throw error when no inputs provided', async () => {
      await expect(wrapper.mixAudio([], '/output.mp3'))
        .rejects.toThrow(AudioProcessingError);
    });

    it('should generate correct ffmpeg command for mixing', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.mixAudio(
        [{ path: '/voice.mp3', volume: 1 }, { path: '/music.mp3', volume: 0.3 }],
        '/output.mp3'
      );

      expect(capturedCmd).toContain('amix=inputs=2');
      expect(capturedCmd).toContain('volume=1');
      expect(capturedCmd).toContain('volume=0.3');
    });
  });

  describe('generateSilence', () => {
    it('should generate silence with default sample rate', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.generateSilence('/silence.mp3', 5);

      expect(capturedCmd).toContain('anullsrc');
      expect(capturedCmd).toContain('sample_rate=44100');
      expect(capturedCmd).toContain('-t 5');
    });

    it('should generate silence with custom sample rate', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.generateSilence('/silence.mp3', 3, 48000);

      expect(capturedCmd).toContain('sample_rate=48000');
    });
  });

  describe('trim', () => {
    it('should trim audio with start and duration', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.trim('/input.mp3', '/output.mp3', 10, 30);

      expect(capturedCmd).toContain('-ss 10');
      expect(capturedCmd).toContain('-t 30');
    });

    it('should trim audio with start only', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.trim('/input.mp3', '/output.mp3', 10);

      expect(capturedCmd).toContain('-ss 10');
      expect(capturedCmd).not.toContain('-t ');
    });
  });

  describe('convert', () => {
    it('should convert with all options', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.convert('/input.wav', '/output.mp3', {
        sampleRate: 44100,
        channels: 2,
        bitrate: '192k',
        codec: 'libmp3lame',
      });

      expect(capturedCmd).toContain('-ar 44100');
      expect(capturedCmd).toContain('-ac 2');
      expect(capturedCmd).toContain('-b:a 192k');
      expect(capturedCmd).toContain('-acodec libmp3lame');
    });
  });

  describe('crossfade', () => {
    it('should apply crossfade between two files', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.crossfade('/input1.mp3', '/input2.mp3', '/output.mp3', 3);

      expect(capturedCmd).toContain('acrossfade=d=3');
    });
  });

  describe('duck', () => {
    it('should apply ducking with custom volume', async () => {
      const execMock = vi.mocked(childProcess.exec);
      let capturedCmd = '';
      execMock.mockImplementation((cmd: string, callback?: Function) => {
        capturedCmd = cmd;
        if (callback) callback(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const testWrapper = new FFmpegWrapper();
      await testWrapper.duck('/voice.mp3', '/music.mp3', '/output.mp3', 0.15);

      expect(capturedCmd).toContain('volume=0.15');
      expect(capturedCmd).toContain('amix');
    });
  });
});

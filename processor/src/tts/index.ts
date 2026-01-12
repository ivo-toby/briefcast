/**
 * TTS module exports
 * Provides text-to-speech generation functionality
 */

// OpenAI TTS client
export {
  OpenAITTSClient,
  createTTSClient,
  type TTSClientConfig,
  type TTSOptions,
  type TTSResult,
  type TTSVoice,
  type TTSModel,
} from './openai-client.js';

// Section-based generator
export {
  TTSGenerator,
  createTTSGenerator,
  type SectionAudio,
  type ScriptAudioResult,
  type TTSGeneratorOptions,
} from './generator.js';

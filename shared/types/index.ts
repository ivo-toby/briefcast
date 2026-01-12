/**
 * Shared TypeScript interfaces and types for Briefcast
 * Used by both the processor and email worker packages
 */

// =============================================================================
// Section Types (shared between types and schemas)
// =============================================================================

/**
 * Section types for structured podcast scripts
 */
export type SectionType = 'intro' | 'topic' | 'synthesis';

// =============================================================================
// Structured Script Types - Zod schemas in schemas/script.ts
// Import StructuredScript, ScriptSection from schemas for full validation
// =============================================================================

// =============================================================================
// Email Types
// =============================================================================

/**
 * Raw email message from Cloudflare Email Worker
 */
export interface Email {
  from: string;
  to: string;
  subject: string;
  date: Date;
  html: string;
  text: string;
  messageId: string;
}

/**
 * Extracted newsletter content ready for script generation
 */
export interface NewsletterContent {
  emailId: string;
  subject: string;
  from: string;
  date: Date;
  links: Link[];
  cleanedText: string;
  wordCount: number;
}

/**
 * Link extracted from newsletter content
 */
export interface Link {
  url: string;
  title?: string;
  description?: string;
}

// =============================================================================
// Episode Types
// =============================================================================

/**
 * Podcast episode metadata stored in R2
 */
export interface EpisodeMetadata {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  durationSeconds: number;
  fileSizeBytes: number;
  audioUrl: string;
  sections: EpisodeSectionInfo[];
  sources: string[];
  generatedAt: string; // ISO date string
}

/**
 * Section timing information for chapter markers
 */
export interface EpisodeSectionInfo {
  type: SectionType;
  title?: string;
  startTimeSeconds: number;
  durationSeconds?: number;
}

/**
 * Audio file metadata (internal use)
 */
export interface AudioFile {
  id: string;
  date: Date;
  durationSeconds: number;
  fileSizeBytes: number;
  url: string;
  format: string;
  bitrate: number;
}

// =============================================================================
// RSS Types
// =============================================================================

/**
 * RSS feed item for podcast episode
 */
export interface RSSFeedItem {
  title: string;
  description: string;
  pubDate: Date;
  audioUrl: string;
  audioLength: number;
  duration: number;
  guid: string;
  episodeNumber?: number;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Audio normalization configuration
 */
export interface AudioNormalizationConfig {
  enabled: boolean;
  targetLufs: number;
  musicTargetLufs: number;
  maxPeakDb: number;
}

/**
 * Music assets configuration
 */
export interface MusicConfig {
  introPath: string;
  transitionPath: string;
  outroPath: string;
}

/**
 * Extended audio configuration
 */
export interface AudioConfig {
  normalization: AudioNormalizationConfig;
  music: MusicConfig;
}

/**
 * Script generation configuration (updated - no word limits)
 */
export interface ScriptGenerationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPromptTemplate: string;
}

/**
 * TTS configuration
 */
export interface TTSConfig {
  model: string;
  voice: string;
  bitrate: number;
  format: string;
  speed: number;
  stylePrompt?: string;
}

/**
 * Podcast metadata configuration
 */
export interface PodcastConfig {
  title: string;
  description: string;
  author: string;
  email: string;
  category: string;
  subcategory: string;
  language: string;
  copyright: string;
  imageUrl: string;
  siteUrl: string;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  maxEpisodes: number;
  emailTtlDays: number;
  saveScripts: boolean;
}

/**
 * Email configuration
 */
export interface EmailConfig {
  forwardTo: string;
  allowedSenders: string[];
}

/**
 * Content filtering configuration
 */
export interface FilteringConfig {
  includeTopics: string[];
  excludeTopics: string[];
  excludeKeywords: string[];
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  claudeTimeoutSeconds: number;
  ttsTimeoutSeconds: number;
  maxRetries: number;
  retryBackoffSeconds: number;
}

/**
 * Complete configuration schema for the processor
 */
export interface Config {
  filtering: FilteringConfig;
  scriptGeneration: ScriptGenerationConfig;
  tts: TTSConfig;
  audio: AudioConfig;
  podcast: PodcastConfig;
  storage: StorageConfig;
  email: EmailConfig;
  performance: PerformanceConfig;
}

// =============================================================================
// Environment Types
// =============================================================================

/**
 * Cloudflare Worker environment bindings (for email worker)
 * Note: R2Bucket type is provided by @cloudflare/workers-types
 * and should be used directly in the worker package
 */
export interface WorkerEnv {
  // R2Bucket type comes from @cloudflare/workers-types
  // Defined as 'unknown' here to avoid Cloudflare dependency in shared package
  PODCAST_BUCKET: unknown;
  ENVIRONMENT: 'development' | 'production';
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Docker processor environment variables
 */
export interface ProcessorEnv {
  // API Keys
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;

  // R2 Configuration
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_URL: string;

  // Optional
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  TEMP_DIR?: string;
  NODE_ENV?: 'development' | 'production';
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Logging context for structured logging
 */
export interface LogContext {
  [key: string]: unknown;
  requestId?: string;
  taskId?: string;
  emailId?: string;
  scriptId?: string;
  episodeId?: string;
  error?: Error | string;
}

/**
 * Retry configuration for API calls
 */
export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs?: number;
  shouldRetry?: (error: Error) => boolean;
}

/**
 * FFmpeg loudness measurement result
 */
export interface LoudnessMeasurement {
  inputI: number;      // Integrated loudness (LUFS)
  inputTp: number;     // True peak (dB)
  inputLra: number;    // Loudness range
  inputThresh: number; // Threshold
  offset: number;      // Target offset
}

// =============================================================================
// Storage Constants
// =============================================================================

/**
 * R2 storage key prefixes
 */
export const STORAGE_KEYS = {
  CONFIG: 'config.yaml',
  RSS_FEED: 'feed.xml',
  COVER_IMAGE: 'cover.jpg',
  AUDIO_PREFIX: 'episodes/',
  PENDING_EMAILS_PREFIX: 'pending-emails/',
  METADATA_PREFIX: 'metadata/',
  SCRIPTS_PREFIX: 'scripts/',
  MUSIC_PREFIX: 'assets/music/',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/**
 * Zod schema for Briefcast configuration
 * Validates config.yaml loaded from R2
 */

import { z } from 'zod';

// =============================================================================
// Audio Configuration Schemas
// =============================================================================

/**
 * Audio normalization settings using EBU R128 / ITU-R BS.1770-4 standards
 */
export const AudioNormalizationSchema = z.object({
  enabled: z.boolean().default(true),
  targetLufs: z.number().min(-70).max(0).default(-16),
  musicTargetLufs: z.number().min(-70).max(0).default(-20),
  maxPeakDb: z.number().min(-20).max(0).default(-1),
});

/**
 * Music asset paths in R2
 */
export const MusicConfigSchema = z.object({
  introPath: z.string().default('assets/music/intro.mp3'),
  transitionPath: z.string().default('assets/music/transition.mp3'),
  outroPath: z.string().default('assets/music/outro.mp3'),
});

/**
 * Complete audio configuration
 */
export const AudioConfigSchema = z.object({
  normalization: AudioNormalizationSchema.default({}),
  music: MusicConfigSchema.default({}),
});

// =============================================================================
// Core Configuration Schemas
// =============================================================================

/**
 * Content filtering configuration
 */
export const FilteringConfigSchema = z.object({
  includeTopics: z.array(z.string()).default([]),
  excludeTopics: z.array(z.string()).default([]),
  excludeKeywords: z.array(z.string()).default([]),
});

/**
 * Script generation configuration
 * Note: min_words, max_words, target_duration_minutes removed per spec
 * Episode length is now content-driven (5-45 minutes range)
 */
export const ScriptGenerationConfigSchema = z.object({
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().int().min(1).max(32000).default(8192),
  temperature: z.number().min(0).max(1).default(0.7),
  systemPrompt: z.string().min(10),
  userPromptTemplate: z.string().min(10),
});

/**
 * TTS configuration for OpenAI
 */
export const TTSConfigSchema = z.object({
  model: z.string().default('gpt-4o-mini-tts'),
  voice: z.enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse']).default('nova'),
  bitrate: z.number().int().min(32).max(320).default(128),
  format: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  stylePrompt: z.string().optional(),
});

/**
 * Podcast metadata configuration
 */
export const PodcastConfigSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  author: z.string().min(1),
  email: z.string().email(),
  category: z.string().default('Technology'),
  subcategory: z.string().default('Tech News'),
  language: z.string().default('en'),
  copyright: z.string().default(''),
  imageUrl: z.string().url(),
  siteUrl: z.string().url(),
});

/**
 * Storage configuration
 */
export const StorageConfigSchema = z.object({
  maxEpisodes: z.number().int().min(1).max(1000).default(100),
  emailTtlDays: z.number().int().min(1).max(365).default(7),
  saveScripts: z.boolean().default(true),
});

/**
 * Email handling configuration
 */
export const EmailConfigSchema = z.object({
  forwardTo: z.string().email().optional(),
  allowedSenders: z.array(z.string()).min(1),
});

/**
 * Performance tuning configuration
 */
export const PerformanceConfigSchema = z.object({
  claudeTimeoutSeconds: z.number().int().min(10).max(600).default(120),
  ttsTimeoutSeconds: z.number().int().min(10).max(600).default(60),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryBackoffSeconds: z.number().min(0.1).max(60).default(2),
});

// =============================================================================
// Complete Config Schema
// =============================================================================

/**
 * Complete configuration schema
 * Validates the entire config.yaml file
 */
export const ConfigSchema = z.object({
  filtering: FilteringConfigSchema.default({}),
  scriptGeneration: ScriptGenerationConfigSchema,
  tts: TTSConfigSchema.default({}),
  audio: AudioConfigSchema.default({}),
  podcast: PodcastConfigSchema,
  storage: StorageConfigSchema.default({}),
  email: EmailConfigSchema,
  performance: PerformanceConfigSchema.default({}),
});

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type AudioNormalization = z.infer<typeof AudioNormalizationSchema>;
export type MusicConfig = z.infer<typeof MusicConfigSchema>;
export type AudioConfig = z.infer<typeof AudioConfigSchema>;
export type FilteringConfig = z.infer<typeof FilteringConfigSchema>;
export type ScriptGenerationConfig = z.infer<typeof ScriptGenerationConfigSchema>;
export type TTSConfig = z.infer<typeof TTSConfigSchema>;
export type PodcastConfig = z.infer<typeof PodcastConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type EmailConfig = z.infer<typeof EmailConfigSchema>;
export type PerformanceConfig = z.infer<typeof PerformanceConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// =============================================================================
// Validation Helper
// =============================================================================

/**
 * Validate and parse configuration
 * @throws ZodError if validation fails
 */
export function validateConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

/**
 * Safely validate configuration
 * @returns Result object with success/error
 */
export function safeValidateConfig(data: unknown): z.SafeParseReturnType<unknown, Config> {
  return ConfigSchema.safeParse(data);
}

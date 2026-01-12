/**
 * Shared utilities for Briefcast
 */

// Error classes and utilities
export {
  BriefcastError,
  ConfigValidationError,
  EmailProcessingError,
  ContentExtractionError,
  ClaudeAPIError,
  TTSAPIError,
  StorageError,
  RSSGenerationError,
  AudioProcessingError,
  ScriptValidationError,
  RetryableError,
  isRetryableError,
  getErrorMessage,
  getErrorContext,
  wrapError,
} from './errors.js';

// Retry utilities
export {
  retry,
  retryIf,
  retryOn,
  createRetryConfig,
} from './retry.js';

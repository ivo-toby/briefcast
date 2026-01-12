/**
 * Custom error classes for Briefcast
 * Shared between processor and worker packages
 */

/**
 * Base error class for all Briefcast errors
 */
export class BriefcastError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BriefcastError';
    // Maintains proper stack trace in V8 environments (Node.js)
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (target: object, constructor: Function) => void;
    };
    if (ErrorWithCapture.captureStackTrace) {
      ErrorWithCapture.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Email processing error
 */
export class EmailProcessingError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'EmailProcessingError';
  }
}

/**
 * Content extraction error
 */
export class ContentExtractionError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ContentExtractionError';
  }
}

/**
 * Claude API error
 */
export class ClaudeAPIError extends BriefcastError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.name = 'ClaudeAPIError';
  }
}

/**
 * OpenAI TTS API error
 */
export class TTSAPIError extends BriefcastError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.name = 'TTSAPIError';
  }
}

/**
 * R2/S3 Storage error
 */
export class StorageError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'StorageError';
  }
}

/**
 * RSS feed generation error
 */
export class RSSGenerationError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'RSSGenerationError';
  }
}

/**
 * FFmpeg audio processing error
 */
export class AudioProcessingError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'AudioProcessingError';
  }
}

/**
 * Script validation error
 */
export class ScriptValidationError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ScriptValidationError';
  }
}

/**
 * Marker for errors that should trigger retry
 */
export class RetryableError extends BriefcastError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'RetryableError';
  }
}

/**
 * Determine if an error should be retried
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof RetryableError) {
    return true;
  }

  // Retry on network errors
  if (
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('ECONNRESET')
  ) {
    return true;
  }

  // Retry on API errors with specific status codes
  if (error instanceof ClaudeAPIError || error instanceof TTSAPIError) {
    const statusCode = error.statusCode;
    if (statusCode) {
      // Retry on 5xx server errors and rate limits (429)
      return statusCode >= 500 || statusCode === 429;
    }
  }

  return false;
}

/**
 * Extract error message safely from any value
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Extract error context safely
 */
export function getErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof BriefcastError && error.context) {
    return error.context;
  }
  return {};
}

/**
 * Wrap an error with additional context
 */
export function wrapError<T extends BriefcastError>(
  ErrorClass: new (message: string, context?: Record<string, unknown>) => T,
  originalError: unknown,
  additionalContext?: Record<string, unknown>
): T {
  const message = getErrorMessage(originalError);
  const originalContext = getErrorContext(originalError);
  const context = { ...originalContext, ...additionalContext };

  const wrapped = new ErrorClass(message, context);

  // Preserve original stack if available
  if (originalError instanceof Error && originalError.stack) {
    wrapped.stack = `${wrapped.stack}\nCaused by: ${originalError.stack}`;
  }

  return wrapped;
}

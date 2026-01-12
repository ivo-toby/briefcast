/**
 * Retry logic with exponential backoff
 * Shared between processor and worker packages
 */

// Use globalThis.setTimeout for cross-platform compatibility
declare const setTimeout: (callback: () => void, ms: number) => unknown;

import type { RetryOptions } from '../types/index.js';
import { isRetryableError } from './errors.js';

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  backoffMs: 1000,
  maxBackoffMs: 30000,
  shouldRetry: isRetryableError,
};

/**
 * Retry a function with exponential backoff
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Promise resolving to function result
 * @throws Last error if all retries exhausted
 *
 * @example
 * ```ts
 * const result = await retry(
 *   () => fetchData(),
 *   { maxAttempts: 3, backoffMs: 1000 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if this is the last attempt
      if (attempt === opts.maxAttempts) {
        break;
      }

      // Check if error should be retried
      if (!opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Calculate backoff with jitter
      const backoff = calculateBackoff(attempt, opts.backoffMs, opts.maxBackoffMs);

      // Wait before retrying
      await sleep(backoff);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Calculate exponential backoff with jitter
 *
 * @param attempt - Current attempt number (1-based)
 * @param baseMs - Base delay in milliseconds
 * @param maxMs - Maximum delay in milliseconds
 * @returns Calculated delay with jitter
 */
function calculateBackoff(attempt: number, baseMs: number, maxMs: number): number {
  // Exponential backoff: base * 2^(attempt - 1)
  const exponential = baseMs * Math.pow(2, attempt - 1);

  // Cap at maxMs
  const capped = Math.min(exponential, maxMs);

  // Add jitter (±25%)
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(capped + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with custom predicate
 *
 * @example
 * ```ts
 * const result = await retryIf(
 *   () => fetchData(),
 *   (error) => error.message.includes('timeout'),
 *   3,
 *   1000
 * );
 * ```
 */
export async function retryIf<T>(
  fn: () => Promise<T>,
  predicate: (error: Error) => boolean,
  maxAttempts = 3,
  backoffMs = 1000
): Promise<T> {
  return retry(fn, {
    maxAttempts,
    backoffMs,
    shouldRetry: predicate,
  });
}

/**
 * Retry only on specific error types
 *
 * @example
 * ```ts
 * const result = await retryOn(
 *   () => callAPI(),
 *   [TTSAPIError, ClaudeAPIError],
 *   3,
 *   1000
 * );
 * ```
 */
export async function retryOn<T>(
  fn: () => Promise<T>,
  errorTypes: Array<new (...args: unknown[]) => Error>,
  maxAttempts = 3,
  backoffMs = 1000
): Promise<T> {
  return retry(fn, {
    maxAttempts,
    backoffMs,
    shouldRetry: (error) => errorTypes.some((type) => error instanceof type),
  });
}

/**
 * Create a reusable retry configuration
 *
 * @example
 * ```ts
 * const apiRetry = createRetryConfig({ maxAttempts: 5, backoffMs: 2000 });
 * const result = await retry(fetchData, apiRetry);
 * ```
 */
export function createRetryConfig(options: Partial<RetryOptions>): Partial<RetryOptions> {
  return { ...options };
}

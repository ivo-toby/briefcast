/**
 * Structured logging utilities for the processor
 */

import type { LogContext } from '@briefcast/shared';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log level priority (higher = more severe)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  json: boolean;
  prefix?: string;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  json: process.env.NODE_ENV === 'production',
};

/**
 * Current logger configuration
 */
let currentConfig: LoggerConfig = { ...DEFAULT_CONFIG };

/**
 * Configure logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentConfig.level];
}

/**
 * Format log message
 */
function formatMessage(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString();

  if (currentConfig.json) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...(currentConfig.prefix ? { prefix: currentConfig.prefix } : {}),
      ...context,
    });
  }

  const prefix = currentConfig.prefix ? `[${currentConfig.prefix}] ` : '';
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `${timestamp} ${level.toUpperCase().padEnd(5)} ${prefix}${message}${contextStr}`;
}

/**
 * Log at specified level
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const formatted = formatMessage(level, message, context);

  switch (level) {
    case 'debug':
    case 'info':
      process.stdout.write(formatted + '\n');
      break;
    case 'warn':
    case 'error':
      process.stderr.write(formatted + '\n');
      break;
  }
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(prefix: string): Logger;
}

/**
 * Create logger instance
 */
export function createLogger(prefix?: string): Logger {
  const loggerPrefix = prefix ?? currentConfig.prefix;

  return {
    debug: (message, context) => {
      configureLogger({ prefix: loggerPrefix });
      log('debug', message, context);
    },
    info: (message, context) => {
      configureLogger({ prefix: loggerPrefix });
      log('info', message, context);
    },
    warn: (message, context) => {
      configureLogger({ prefix: loggerPrefix });
      log('warn', message, context);
    },
    error: (message, context) => {
      configureLogger({ prefix: loggerPrefix });
      log('error', message, context);
    },
    child: (childPrefix) => {
      const newPrefix = loggerPrefix
        ? `${loggerPrefix}:${childPrefix}`
        : childPrefix;
      return createLogger(newPrefix);
    },
  };
}

/**
 * Default logger
 */
export const logger = createLogger();

/**
 * Log start of operation
 */
export function logStart(operation: string, context?: LogContext): void {
  logger.info(`Starting: ${operation}`, context);
}

/**
 * Log completion of operation
 */
export function logComplete(
  operation: string,
  durationMs?: number,
  context?: LogContext
): void {
  logger.info(`Completed: ${operation}`, {
    ...context,
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
}

/**
 * Log error with stack trace
 */
export function logError(
  message: string,
  error: Error,
  context?: LogContext
): void {
  logger.error(message, {
    ...context,
    error: error.message,
    stack: error.stack,
  });
}

/**
 * Create timed operation wrapper
 */
export function timedOperation<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const start = Date.now();
  logStart(operation, context);

  return fn()
    .then((result) => {
      logComplete(operation, Date.now() - start, context);
      return result;
    })
    .catch((error) => {
      logError(`Failed: ${operation}`, error, context);
      throw error;
    });
}

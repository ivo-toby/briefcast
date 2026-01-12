/**
 * Configuration loader
 * Fetches and validates config.yaml from R2
 */

import yaml from 'js-yaml';
import {
  ConfigSchema,
  validateConfig,
  type Config,
  STORAGE_KEYS,
  ConfigValidationError,
} from '@briefcast/shared';
import type { R2StorageClient } from '../storage/r2-client.js';

/**
 * Cached configuration
 */
let cachedConfig: Config | null = null;

/**
 * Load configuration from R2
 * Caches the result for the duration of the processing run
 */
export async function loadConfig(r2Client: R2StorageClient): Promise<Config> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    // Fetch config.yaml from R2
    const configYaml = await r2Client.getObjectText(STORAGE_KEYS.CONFIG);

    // Parse YAML
    const rawConfig = yaml.load(configYaml);

    // Validate against schema
    const config = validateConfig(rawConfig);

    // Cache for this run
    cachedConfig = config;

    return config;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    throw new ConfigValidationError(
      `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error }
    );
  }
}

/**
 * Clear cached configuration
 * Call this at the start of each processing run
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get cached configuration
 * Throws if config hasn't been loaded
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    throw new ConfigValidationError('Configuration not loaded. Call loadConfig first.');
  }
  return cachedConfig;
}

/**
 * Validate configuration without caching
 * Useful for config file validation
 */
export function parseConfigYaml(yamlContent: string): Config {
  try {
    const rawConfig = yaml.load(yamlContent);
    return validateConfig(rawConfig);
  } catch (error) {
    throw new ConfigValidationError(
      `Invalid configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error }
    );
  }
}

/**
 * Convert snake_case keys to camelCase
 * R2 config uses snake_case, TypeScript uses camelCase
 */
function convertKeysToCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamelCase);
  }

  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).reduce(
      (acc, [key, value]) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        acc[camelKey] = convertKeysToCamelCase(value);
        return acc;
      },
      {} as Record<string, unknown>
    );
  }

  return obj;
}

/**
 * Load and transform configuration from R2
 * Handles snake_case to camelCase conversion
 */
export async function loadConfigWithTransform(r2Client: R2StorageClient): Promise<Config> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configYaml = await r2Client.getObjectText(STORAGE_KEYS.CONFIG);
    const rawConfig = yaml.load(configYaml);

    // Convert snake_case to camelCase
    const transformedConfig = convertKeysToCamelCase(rawConfig);

    // Validate
    const config = validateConfig(transformedConfig);
    cachedConfig = config;

    return config;
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    throw new ConfigValidationError(
      `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { originalError: error }
    );
  }
}

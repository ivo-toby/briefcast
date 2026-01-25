/**
 * Cloudflare KV client for external access
 * Uses Cloudflare API to read KV namespace from Docker processor
 */

import { StorageError, wrapError } from '@briefcast/shared';

/**
 * KV client configuration
 */
export interface KVClientConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
}

/**
 * KV key metadata
 */
export interface KVKeyInfo {
  name: string;
  expiration?: number;
  metadata?: Record<string, string>;
}

/**
 * KV list response
 */
interface KVListResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: KVKeyInfo[];
  result_info: {
    cursor?: string;
    count: number;
  };
}

/**
 * Cloudflare KV client for external API access
 */
export class KVStorageClient {
  private readonly accountId: string;
  private readonly namespaceId: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(config: KVClientConfig) {
    this.accountId = config.accountId;
    this.namespaceId = config.namespaceId;
    this.apiToken = config.apiToken;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${this.namespaceId}`;
  }

  /**
   * List all keys with optional prefix
   */
  async listKeys(prefix?: string): Promise<KVKeyInfo[]> {
    const allKeys: KVKeyInfo[] = [];
    let cursor: string | undefined;

    try {
      do {
        const params = new URLSearchParams();
        if (prefix) params.set('prefix', prefix);
        if (cursor) params.set('cursor', cursor);
        params.set('limit', '1000');

        const url = `${this.baseUrl}/keys?${params.toString()}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new StorageError(
            `KV list failed: ${response.status} ${response.statusText}`,
            { statusCode: response.status, errorText }
          );
        }

        const data = (await response.json()) as KVListResponse;
        if (!data.success) {
          throw new StorageError(
            `KV list failed: ${data.errors.map(e => e.message).join(', ')}`,
            { errors: data.errors }
          );
        }

        allKeys.push(...data.result);
        cursor = data.result_info.cursor;
      } while (cursor);

      return allKeys;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw wrapError(StorageError, error, { operation: 'listKeys', prefix });
    }
  }

  /**
   * Get a value by key
   */
  async getValue(key: string): Promise<string> {
    try {
      const url = `${this.baseUrl}/values/${encodeURIComponent(key)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new StorageError(
          `KV get failed: ${response.status} ${response.statusText}`,
          { statusCode: response.status, key, errorText }
        );
      }

      return await response.text();
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw wrapError(StorageError, error, { operation: 'getValue', key });
    }
  }

  /**
   * Get a value as JSON
   */
  async getValueJson<T>(key: string): Promise<T> {
    const text = await this.getValue(key);
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new StorageError(
        `Failed to parse KV value as JSON: ${key}`,
        { key, originalError: error }
      );
    }
  }

  /**
   * Delete a key
   */
  async deleteKey(key: string): Promise<void> {
    try {
      const url = `${this.baseUrl}/values/${encodeURIComponent(key)}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new StorageError(
          `KV delete failed: ${response.status} ${response.statusText}`,
          { statusCode: response.status, key, errorText }
        );
      }
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw wrapError(StorageError, error, { operation: 'deleteKey', key });
    }
  }
}

/**
 * Create KV client from environment variables
 */
export function createKVClient(env: {
  CF_ACCOUNT_ID: string;
  CF_KV_NAMESPACE_ID: string;
  CF_API_TOKEN: string;
}): KVStorageClient {
  return new KVStorageClient({
    accountId: env.CF_ACCOUNT_ID,
    namespaceId: env.CF_KV_NAMESPACE_ID,
    apiToken: env.CF_API_TOKEN,
  });
}

/**
 * R2 S3-compatible storage client
 * Uses AWS SDK v3 to interact with Cloudflare R2
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import type { ProcessorEnv } from '@briefcast/shared';
import { StorageError, wrapError } from '@briefcast/shared';

/**
 * R2 client configuration
 */
export interface R2ClientConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

/**
 * Object metadata from R2
 */
export interface R2ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}

/**
 * Create R2 client configuration from environment
 */
export function createR2Config(env: ProcessorEnv): R2ClientConfig {
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_BUCKET_NAME,
    publicUrl: env.R2_PUBLIC_URL,
  };
}

/**
 * R2 S3-compatible storage client
 */
export class R2StorageClient {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl?: string;

  constructor(config: R2ClientConfig) {
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl;

    // Configure S3 client for R2
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Get an object from R2
   */
  async getObject(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response: GetObjectCommandOutput = await this.client.send(command);

      if (!response.Body) {
        throw new StorageError(`Object not found: ${key}`);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw wrapError(StorageError, error, { key, operation: 'getObject' });
    }
  }

  /**
   * Get an object as text
   */
  async getObjectText(key: string): Promise<string> {
    const buffer = await this.getObject(key);
    return buffer.toString('utf-8');
  }

  /**
   * Get an object as JSON
   */
  async getObjectJson<T>(key: string): Promise<T> {
    const text = await this.getObjectText(key);
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new StorageError(`Invalid JSON in object: ${key}`, { key });
    }
  }

  /**
   * Put an object to R2
   */
  async putObject(
    key: string,
    body: Buffer | string,
    contentType?: string
  ): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: typeof body === 'string' ? Buffer.from(body) : body,
        ContentType: contentType,
      });

      await this.client.send(command);
    } catch (error) {
      throw wrapError(StorageError, error, { key, operation: 'putObject' });
    }
  }

  /**
   * Put JSON object to R2
   */
  async putObjectJson(key: string, data: unknown): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await this.putObject(key, json, 'application/json');
  }

  /**
   * Delete an object from R2
   */
  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      throw wrapError(StorageError, error, { key, operation: 'deleteObject' });
    }
  }

  /**
   * Check if an object exists
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      // NoSuchKey error means object doesn't exist
      if ((error as Error).name === 'NotFound' ||
          (error as Error).name === 'NoSuchKey') {
        return false;
      }
      throw wrapError(StorageError, error, { key, operation: 'objectExists' });
    }
  }

  /**
   * List objects with a prefix
   */
  async listObjects(
    prefix: string,
    maxKeys = 1000
  ): Promise<R2ObjectInfo[]> {
    try {
      const objects: R2ObjectInfo[] = [];
      let continuationToken: string | undefined;

      do {
        const command = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          MaxKeys: Math.min(maxKeys - objects.length, 1000),
          ContinuationToken: continuationToken,
        });

        const response: ListObjectsV2CommandOutput = await this.client.send(command);

        if (response.Contents) {
          for (const item of response.Contents) {
            if (item.Key) {
              objects.push({
                key: item.Key,
                size: item.Size ?? 0,
                lastModified: item.LastModified ?? new Date(),
                etag: item.ETag,
              });
            }
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken && objects.length < maxKeys);

      return objects;
    } catch (error) {
      throw wrapError(StorageError, error, { prefix, operation: 'listObjects' });
    }
  }

  /**
   * List object keys with a prefix
   */
  async listObjectKeys(prefix: string, maxKeys = 1000): Promise<string[]> {
    const objects = await this.listObjects(prefix, maxKeys);
    return objects.map(obj => obj.key);
  }

  /**
   * Get public URL for an object
   */
  getPublicUrl(key: string): string {
    if (!this.publicUrl) {
      throw new StorageError('Public URL not configured');
    }
    // Remove trailing slash from publicUrl if present
    const baseUrl = this.publicUrl.replace(/\/$/, '');
    // Ensure key doesn't start with slash
    const cleanKey = key.replace(/^\//, '');
    return `${baseUrl}/${cleanKey}`;
  }

  /**
   * Delete multiple objects
   */
  async deleteObjects(keys: string[]): Promise<void> {
    // R2 doesn't support bulk delete, so we delete one by one
    await Promise.all(keys.map(key => this.deleteObject(key)));
  }

  /**
   * Copy an object within R2 (by downloading and re-uploading)
   */
  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    const data = await this.getObject(sourceKey);
    await this.putObject(destKey, data);
  }
}

/**
 * Create R2 client from environment
 */
export function createR2Client(env: ProcessorEnv): R2StorageClient {
  const config = createR2Config(env);
  return new R2StorageClient(config);
}

/**
 * Unit tests for R2StorageClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { R2StorageClient, createR2Config, createR2Client } from '../../src/storage/r2-client.js';
import type { R2ClientConfig } from '../../src/storage/r2-client.js';
import type { ProcessorEnv } from '@briefcast/shared';
import { StorageError } from '@briefcast/shared';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
    GetObjectCommand: vi.fn(),
    PutObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
    HeadObjectCommand: vi.fn(),
  };
});

// Test configuration
const TEST_CONFIG: R2ClientConfig = {
  accountId: 'test-account-id',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucketName: 'test-bucket',
  publicUrl: 'https://cdn.example.com',
};

const TEST_ENV: ProcessorEnv = {
  ANTHROPIC_API_KEY: 'test-key',
  OPENAI_API_KEY: 'test-key',
  R2_ACCOUNT_ID: 'test-account-id',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://cdn.example.com',
};

describe('createR2Config', () => {
  it('should create config from environment', () => {
    const config = createR2Config(TEST_ENV);

    expect(config.accountId).toBe('test-account-id');
    expect(config.accessKeyId).toBe('test-access-key');
    expect(config.secretAccessKey).toBe('test-secret-key');
    expect(config.bucketName).toBe('test-bucket');
    expect(config.publicUrl).toBe('https://cdn.example.com');
  });
});

describe('createR2Client', () => {
  it('should create client from environment', () => {
    const client = createR2Client(TEST_ENV);
    expect(client).toBeInstanceOf(R2StorageClient);
  });
});

describe('R2StorageClient', () => {
  let client: R2StorageClient;
  let mockS3Send: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get mocked S3Client and set up mockS3Send
    const { S3Client } = await import('@aws-sdk/client-s3');
    mockS3Send = vi.fn();
    vi.mocked(S3Client).mockImplementation(() => ({
      send: mockS3Send,
    } as any));

    client = new R2StorageClient(TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create client with config', () => {
      expect(client).toBeInstanceOf(R2StorageClient);
    });

    it('should create client without public URL', () => {
      const configWithoutUrl = { ...TEST_CONFIG };
      delete configWithoutUrl.publicUrl;
      const clientWithoutUrl = new R2StorageClient(configWithoutUrl);
      expect(clientWithoutUrl).toBeInstanceOf(R2StorageClient);
    });
  });

  describe('getObject', () => {
    it('should return buffer from stream', async () => {
      const testData = Buffer.from('test content');

      // Create async iterable mock
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield testData;
        },
      };

      mockS3Send.mockResolvedValue({ Body: mockStream });

      const result = await client.getObject('test-key');

      expect(result).toEqual(testData);
    });

    it('should throw StorageError when body is empty', async () => {
      mockS3Send.mockResolvedValue({ Body: null });

      await expect(client.getObject('missing-key'))
        .rejects.toThrow(StorageError);
    });

    it('should wrap SDK errors', async () => {
      mockS3Send.mockRejectedValue(new Error('Network error'));

      await expect(client.getObject('test-key'))
        .rejects.toThrow(StorageError);
    });
  });

  describe('getObjectText', () => {
    it('should return text content', async () => {
      const testText = 'Hello, World!';
      const testData = Buffer.from(testText);

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield testData;
        },
      };

      mockS3Send.mockResolvedValue({ Body: mockStream });

      const result = await client.getObjectText('test-key');

      expect(result).toBe(testText);
    });
  });

  describe('getObjectJson', () => {
    it('should parse JSON content', async () => {
      const testObj = { foo: 'bar', num: 42 };
      const testData = Buffer.from(JSON.stringify(testObj));

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield testData;
        },
      };

      mockS3Send.mockResolvedValue({ Body: mockStream });

      const result = await client.getObjectJson<typeof testObj>('test-key');

      expect(result).toEqual(testObj);
    });

    it('should throw StorageError for invalid JSON', async () => {
      const testData = Buffer.from('not valid json');

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield testData;
        },
      };

      mockS3Send.mockResolvedValue({ Body: mockStream });

      await expect(client.getObjectJson('test-key'))
        .rejects.toThrow(StorageError);
    });
  });

  describe('putObject', () => {
    it('should put buffer content', async () => {
      mockS3Send.mockResolvedValue({});

      await client.putObject('test-key', Buffer.from('content'), 'text/plain');

      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should put string content', async () => {
      mockS3Send.mockResolvedValue({});

      await client.putObject('test-key', 'string content');

      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should wrap SDK errors', async () => {
      mockS3Send.mockRejectedValue(new Error('Upload failed'));

      await expect(client.putObject('test-key', 'content'))
        .rejects.toThrow(StorageError);
    });
  });

  describe('putObjectJson', () => {
    it('should put JSON content', async () => {
      mockS3Send.mockResolvedValue({});

      await client.putObjectJson('test-key', { foo: 'bar' });

      expect(mockS3Send).toHaveBeenCalled();
    });
  });

  describe('deleteObject', () => {
    it('should delete object', async () => {
      mockS3Send.mockResolvedValue({});

      await client.deleteObject('test-key');

      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should wrap SDK errors', async () => {
      mockS3Send.mockRejectedValue(new Error('Delete failed'));

      await expect(client.deleteObject('test-key'))
        .rejects.toThrow(StorageError);
    });
  });

  describe('objectExists', () => {
    it('should return true when object exists', async () => {
      mockS3Send.mockResolvedValue({});

      const result = await client.objectExists('test-key');

      expect(result).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      const error = new Error('Not Found');
      error.name = 'NotFound';
      mockS3Send.mockRejectedValue(error);

      const result = await client.objectExists('missing-key');

      expect(result).toBe(false);
    });

    it('should return false for NoSuchKey error', async () => {
      const error = new Error('No Such Key');
      error.name = 'NoSuchKey';
      mockS3Send.mockRejectedValue(error);

      const result = await client.objectExists('missing-key');

      expect(result).toBe(false);
    });

    it('should wrap other errors', async () => {
      mockS3Send.mockRejectedValue(new Error('Network error'));

      await expect(client.objectExists('test-key'))
        .rejects.toThrow(StorageError);
    });
  });

  describe('listObjects', () => {
    it('should list objects with prefix', async () => {
      mockS3Send.mockResolvedValue({
        Contents: [
          { Key: 'prefix/file1.txt', Size: 100, LastModified: new Date('2026-01-12'), ETag: '"abc123"' },
          { Key: 'prefix/file2.txt', Size: 200, LastModified: new Date('2026-01-11'), ETag: '"def456"' },
        ],
      });

      const result = await client.listObjects('prefix/');

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('prefix/file1.txt');
      expect(result[0].size).toBe(100);
      expect(result[1].key).toBe('prefix/file2.txt');
    });

    it('should handle empty results', async () => {
      mockS3Send.mockResolvedValue({ Contents: undefined });

      const result = await client.listObjects('empty-prefix/');

      expect(result).toHaveLength(0);
    });

    it('should handle pagination', async () => {
      mockS3Send
        .mockResolvedValueOnce({
          Contents: [{ Key: 'prefix/file1.txt', Size: 100, LastModified: new Date() }],
          NextContinuationToken: 'token1',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'prefix/file2.txt', Size: 200, LastModified: new Date() }],
        });

      const result = await client.listObjects('prefix/', 2000);

      expect(result).toHaveLength(2);
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it('should wrap SDK errors', async () => {
      mockS3Send.mockRejectedValue(new Error('List failed'));

      await expect(client.listObjects('prefix/'))
        .rejects.toThrow(StorageError);
    });
  });

  describe('listObjectKeys', () => {
    it('should return only keys', async () => {
      mockS3Send.mockResolvedValue({
        Contents: [
          { Key: 'prefix/file1.txt', Size: 100, LastModified: new Date() },
          { Key: 'prefix/file2.txt', Size: 200, LastModified: new Date() },
        ],
      });

      const result = await client.listObjectKeys('prefix/');

      expect(result).toEqual(['prefix/file1.txt', 'prefix/file2.txt']);
    });
  });

  describe('getPublicUrl', () => {
    it('should generate public URL', () => {
      const url = client.getPublicUrl('path/to/file.mp3');

      expect(url).toBe('https://cdn.example.com/path/to/file.mp3');
    });

    it('should handle trailing slash in base URL', () => {
      const clientWithSlash = new R2StorageClient({
        ...TEST_CONFIG,
        publicUrl: 'https://cdn.example.com/',
      });

      const url = clientWithSlash.getPublicUrl('file.mp3');

      expect(url).toBe('https://cdn.example.com/file.mp3');
    });

    it('should handle leading slash in key', () => {
      const url = client.getPublicUrl('/path/to/file.mp3');

      expect(url).toBe('https://cdn.example.com/path/to/file.mp3');
    });

    it('should throw when public URL not configured', () => {
      const clientWithoutUrl = new R2StorageClient({
        ...TEST_CONFIG,
        publicUrl: undefined,
      });

      expect(() => clientWithoutUrl.getPublicUrl('file.mp3'))
        .toThrow(StorageError);
    });
  });

  describe('deleteObjects', () => {
    it('should delete multiple objects', async () => {
      mockS3Send.mockResolvedValue({});

      await client.deleteObjects(['file1.txt', 'file2.txt', 'file3.txt']);

      expect(mockS3Send).toHaveBeenCalledTimes(3);
    });
  });

  describe('copyObject', () => {
    it('should copy object by download and re-upload', async () => {
      const testData = Buffer.from('test content');

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield testData;
        },
      };

      mockS3Send
        .mockResolvedValueOnce({ Body: mockStream }) // getObject
        .mockResolvedValueOnce({}); // putObject

      await client.copyObject('source-key', 'dest-key');

      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });
});

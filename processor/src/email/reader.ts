/**
 * Email reader module
 * Lists and fetches pending emails from Cloudflare KV storage
 */

import type { KVStorageClient, KVKeyInfo } from '../storage/kv-client.js';
import type { Email } from '@briefcast/shared';
import { EmailProcessingError, wrapError } from '@briefcast/shared';
import { parseEmail } from './parser.js';

/**
 * Email key prefix in KV
 */
const EMAIL_KEY_PREFIX = 'email:';

/**
 * Pending email reference from KV
 */
export interface PendingEmailRef {
  key: string;
  messageId: string;
  expiration?: number;
}

/**
 * Result of fetching a pending email
 */
export interface FetchedEmail {
  ref: PendingEmailRef;
  email: Email;
  rawContent: string;
}

/**
 * Extract message ID from KV key
 * Keys follow format: email:<messageId>
 */
function extractMessageId(key: string): string {
  return key.replace(/^email:/, '');
}

/**
 * List all pending emails in KV
 * Returns references that can be used to fetch full email content
 */
export async function listPendingEmails(
  kvClient: KVStorageClient
): Promise<PendingEmailRef[]> {
  try {
    const keys = await kvClient.listKeys(EMAIL_KEY_PREFIX);

    return keys
      .filter((key: KVKeyInfo) => key.name.startsWith(EMAIL_KEY_PREFIX))
      .map((key: KVKeyInfo) => ({
        key: key.name,
        messageId: extractMessageId(key.name),
        expiration: key.expiration,
      }));
  } catch (error) {
    throw wrapError(EmailProcessingError, error, {
      operation: 'listPendingEmails',
    });
  }
}

/**
 * Check if there are any pending emails
 */
export async function hasPendingEmails(
  kvClient: KVStorageClient
): Promise<boolean> {
  const emails = await listPendingEmails(kvClient);
  return emails.length > 0;
}

/**
 * Count pending emails
 */
export async function countPendingEmails(
  kvClient: KVStorageClient
): Promise<number> {
  const emails = await listPendingEmails(kvClient);
  return emails.length;
}

/**
 * Fetch a single email by its reference
 */
export async function fetchEmail(
  kvClient: KVStorageClient,
  ref: PendingEmailRef
): Promise<FetchedEmail> {
  try {
    const rawContent = await kvClient.getValue(ref.key);
    const email = await parseEmail(rawContent, ref.messageId);

    return {
      ref,
      email,
      rawContent,
    };
  } catch (error) {
    if (error instanceof EmailProcessingError) {
      throw error;
    }
    throw wrapError(EmailProcessingError, error, {
      operation: 'fetchEmail',
      key: ref.key,
      messageId: ref.messageId,
    });
  }
}

/**
 * Result of batch email fetch
 */
export interface BatchFetchResult {
  successful: FetchedEmail[];
  failed: Array<{ ref: PendingEmailRef; error: Error }>;
}

/**
 * Fetch all pending emails
 * Returns both successful and failed results
 */
export async function fetchAllPendingEmails(
  kvClient: KVStorageClient
): Promise<BatchFetchResult> {
  const refs = await listPendingEmails(kvClient);
  const successful: FetchedEmail[] = [];
  const failed: Array<{ ref: PendingEmailRef; error: Error }> = [];

  for (const ref of refs) {
    try {
      const fetched = await fetchEmail(kvClient, ref);
      successful.push(fetched);
    } catch (error) {
      // Collect errors for later handling
      failed.push({
        ref,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return { successful, failed };
}

/**
 * Delete a processed email from KV
 */
export async function deletePendingEmail(
  kvClient: KVStorageClient,
  ref: PendingEmailRef
): Promise<void> {
  try {
    await kvClient.deleteKey(ref.key);
  } catch (error) {
    throw wrapError(EmailProcessingError, error, {
      operation: 'deletePendingEmail',
      key: ref.key,
      messageId: ref.messageId,
    });
  }
}

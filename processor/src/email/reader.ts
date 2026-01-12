/**
 * Email reader module
 * Lists and fetches pending emails from R2 storage
 */

import type { R2StorageClient, R2ObjectInfo } from '../storage/r2-client.js';
import { STORAGE_KEYS, type Email } from '@briefcast/shared';
import { EmailProcessingError, wrapError } from '@briefcast/shared';
import { parseEmail } from './parser.js';

/**
 * Pending email reference from R2
 */
export interface PendingEmailRef {
  key: string;
  messageId: string;
  lastModified: Date;
  size: number;
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
 * Extract message ID from R2 key
 * Keys follow format: pending-emails/{messageId}.eml
 */
function extractMessageId(key: string): string {
  const filename = key.split('/').pop() ?? '';
  return filename.replace(/\.eml$/, '');
}

/**
 * List all pending emails in R2
 * Returns references that can be used to fetch full email content
 */
export async function listPendingEmails(
  r2Client: R2StorageClient
): Promise<PendingEmailRef[]> {
  try {
    const objects = await r2Client.listObjects(STORAGE_KEYS.PENDING_EMAILS_PREFIX);

    return objects
      .filter((obj: R2ObjectInfo) => obj.key.endsWith('.eml'))
      .map((obj: R2ObjectInfo) => ({
        key: obj.key,
        messageId: extractMessageId(obj.key),
        lastModified: obj.lastModified,
        size: obj.size,
      }))
      .sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime());
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
  r2Client: R2StorageClient
): Promise<boolean> {
  const emails = await listPendingEmails(r2Client);
  return emails.length > 0;
}

/**
 * Count pending emails
 */
export async function countPendingEmails(
  r2Client: R2StorageClient
): Promise<number> {
  const emails = await listPendingEmails(r2Client);
  return emails.length;
}

/**
 * Fetch a single email by its reference
 */
export async function fetchEmail(
  r2Client: R2StorageClient,
  ref: PendingEmailRef
): Promise<FetchedEmail> {
  try {
    const rawContent = await r2Client.getObjectText(ref.key);
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
 * Processes in order of arrival (oldest first)
 * Returns both successful and failed results
 */
export async function fetchAllPendingEmails(
  r2Client: R2StorageClient
): Promise<BatchFetchResult> {
  const refs = await listPendingEmails(r2Client);
  const successful: FetchedEmail[] = [];
  const failed: Array<{ ref: PendingEmailRef; error: Error }> = [];

  for (const ref of refs) {
    try {
      const fetched = await fetchEmail(r2Client, ref);
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
 * Delete a processed email from pending
 */
export async function deletePendingEmail(
  r2Client: R2StorageClient,
  ref: PendingEmailRef
): Promise<void> {
  try {
    await r2Client.deleteObject(ref.key);
  } catch (error) {
    throw wrapError(EmailProcessingError, error, {
      operation: 'deletePendingEmail',
      key: ref.key,
      messageId: ref.messageId,
    });
  }
}

/**
 * Move email to a different prefix (e.g., processed or failed)
 */
export async function moveEmail(
  r2Client: R2StorageClient,
  ref: PendingEmailRef,
  destPrefix: string
): Promise<string> {
  try {
    const filename = `${ref.messageId}.eml`;
    const destKey = `${destPrefix}${filename}`;

    await r2Client.copyObject(ref.key, destKey);
    await r2Client.deleteObject(ref.key);

    return destKey;
  } catch (error) {
    throw wrapError(EmailProcessingError, error, {
      operation: 'moveEmail',
      sourceKey: ref.key,
      destPrefix,
    });
  }
}

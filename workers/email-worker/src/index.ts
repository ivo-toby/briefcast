/**
 * Briefcast Email Worker
 * Cloudflare Worker that receives emails and stores them to R2
 *
 * This is a minimal worker designed to stay within <10ms CPU time.
 * All heavy processing is done by the Docker processor.
 */

import type { EmailMessage, R2Bucket } from '@cloudflare/workers-types';

/**
 * Worker environment bindings
 */
export interface Env {
  PODCAST_BUCKET: R2Bucket;
  ALLOWED_SENDERS: string; // Comma-separated list of allowed email addresses/domains
  ENVIRONMENT: 'development' | 'production';
}

/**
 * R2 key prefix for pending emails
 */
const PENDING_EMAILS_PREFIX = 'pending-emails/';

/**
 * Email worker entry point
 */
export default {
  /**
   * Handle incoming email
   */
  async email(message: EmailMessage, env: Env): Promise<void> {
    const { from, to } = message;

    // Check if sender is allowed
    if (!isAllowedSender(from, env.ALLOWED_SENDERS)) {
      console.log(`Rejected email from non-allowed sender: ${from}`);
      // Silently reject - don't expose our allowlist
      return;
    }

    console.log(`Received email from: ${from} to: ${to}`);

    try {
      // Get raw email content using the rawStream method
      const rawStream = message.raw as ReadableStream<Uint8Array>;
      const rawEmail = await streamToArrayBuffer(rawStream);

      // Generate unique key for this email
      const messageId = generateMessageId(from);
      const key = `${PENDING_EMAILS_PREFIX}${messageId}.eml`;

      // Store to R2
      await env.PODCAST_BUCKET.put(key, rawEmail, {
        customMetadata: {
          from: from,
          to: to,
          receivedAt: new Date().toISOString(),
        },
      });

      console.log(`Stored email to R2: ${key}`);
    } catch (error) {
      console.error('Failed to process email:', error);
      // Don't throw - we don't want to bounce the email
    }
  },
};

/**
 * Check if sender is in the allowlist
 */
function isAllowedSender(from: string, allowedSenders: string): boolean {
  if (!allowedSenders) return false;

  const fromLower = from.toLowerCase();
  const allowed = allowedSenders
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  for (const pattern of allowed) {
    // Exact match
    if (fromLower === pattern) return true;

    // Domain match (pattern starts with @)
    if (pattern.startsWith('@') && fromLower.endsWith(pattern)) return true;

    // Partial match (pattern is in the email)
    if (fromLower.includes(pattern)) return true;
  }

  return false;
}

/**
 * Generate unique message ID
 */
function generateMessageId(from: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const sanitizedFrom = from.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20);
  return `${timestamp}-${random}-${sanitizedFrom}`;
}

/**
 * Convert ReadableStream to ArrayBuffer
 */
async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

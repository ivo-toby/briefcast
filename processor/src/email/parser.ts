/**
 * Email parser module
 * Uses postal-mime to parse .eml files into structured Email objects
 */

import PostalMime from 'postal-mime';
import type { Email } from '@briefcast/shared';
import { EmailProcessingError } from '@briefcast/shared';

// PostalMime address type can be a mailbox or a group
interface ParsedAddress {
  name?: string;
  address?: string;
}

/**
 * Parse raw email content (.eml format) into structured Email object
 */
export async function parseEmail(
  rawContent: string,
  fallbackMessageId?: string
): Promise<Email> {
  try {
    const parser = new PostalMime();
    const parsed = await parser.parse(rawContent);

    // Extract sender address (postal-mime from can be Address | undefined)
    const fromAddr = parsed.from as ParsedAddress | undefined;
    const from = fromAddr?.address ?? null;
    if (!from) {
      throw new EmailProcessingError('Email missing sender address', {
        messageId: fallbackMessageId,
      });
    }

    // Extract recipient address (postal-mime to can be Address[] | undefined)
    const toAddrs = (parsed.to ?? []) as ParsedAddress[];
    const to = toAddrs
      .map((a) => a.address)
      .filter((a): a is string => typeof a === 'string')
      .join(', ');

    // Extract subject
    const subject = parsed.subject || '(No Subject)';

    // Extract date
    const date = parsed.date ? new Date(parsed.date) : new Date();
    if (isNaN(date.getTime())) {
      throw new EmailProcessingError('Invalid email date', {
        messageId: fallbackMessageId,
        dateStr: parsed.date,
      });
    }

    // Extract message ID
    const messageId = parsed.messageId || fallbackMessageId || generateMessageId();

    // Extract content
    const html = parsed.html || '';
    const text = parsed.text || '';

    // Validate we have some content
    if (!html && !text) {
      throw new EmailProcessingError('Email has no content', {
        messageId,
      });
    }

    return {
      from,
      to,
      subject,
      date,
      html,
      text,
      messageId,
    };
  } catch (error) {
    if (error instanceof EmailProcessingError) {
      throw error;
    }
    throw new EmailProcessingError(
      `Failed to parse email: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        messageId: fallbackMessageId,
        originalError: error,
      }
    );
  }
}

/**
 * Generate a fallback message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}@briefcast.local`;
}

/**
 * Extract sender domain from email address
 */
export function extractSenderDomain(email: Email): string | null {
  const match = email.from.match(/@([^>]+)/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract sender name from email address
 */
export function extractSenderName(email: Email): string | null {
  // Try to extract name from "Name <email>" format
  const match = email.from.match(/^([^<]+)\s*</);
  if (match) {
    return match[1].trim();
  }
  // Otherwise return the part before @
  const atIndex = email.from.indexOf('@');
  if (atIndex > 0) {
    return email.from.substring(0, atIndex);
  }
  return null;
}

/**
 * Get the best content from email (prefer text, fall back to HTML stripped)
 */
export function getEmailContent(email: Email): string {
  // Prefer plain text as it's cleaner for processing
  if (email.text && email.text.trim().length > 0) {
    return email.text;
  }

  // Fall back to stripped HTML
  if (email.html) {
    return stripHtmlTags(email.html);
  }

  return '';
}

/**
 * Basic HTML tag stripping
 */
function stripHtmlTags(html: string): string {
  return html
    // Remove script and style contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if email appears to be an automated/system email
 */
export function isAutomatedEmail(email: Email): boolean {
  const from = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();

  const automatedPatterns = [
    'noreply@',
    'no-reply@',
    'mailer-daemon@',
    'postmaster@',
    'bounce@',
    'unsubscribe',
    'delivery failed',
    'auto-reply',
    'out of office',
  ];

  return automatedPatterns.some(
    (pattern) => from.includes(pattern) || subject.includes(pattern)
  );
}

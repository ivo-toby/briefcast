/**
 * Content extractor module
 * Extracts and cleans content from newsletter emails
 */

import type { Email, NewsletterContent, Link } from '@briefcast/shared';
import { ContentExtractionError } from '@briefcast/shared';
import { getEmailContent } from '../email/parser.js';

/**
 * Minimum content length after cleaning
 */
const MIN_CONTENT_LENGTH = 100;

/**
 * Extract newsletter content from parsed email
 */
export function extractNewsletterContent(email: Email): NewsletterContent {
  // Get best available content
  const rawContent = getEmailContent(email);

  if (!rawContent || rawContent.length < MIN_CONTENT_LENGTH) {
    throw new ContentExtractionError('Email content too short', {
      messageId: email.messageId,
      contentLength: rawContent?.length ?? 0,
      minRequired: MIN_CONTENT_LENGTH,
    });
  }

  // Extract links from HTML if available, otherwise from text
  const links = email.html
    ? extractLinksFromHtml(email.html)
    : extractLinksFromText(rawContent);

  // Clean the text content
  const cleanedText = cleanText(rawContent);

  // Count words
  const wordCount = countWords(cleanedText);

  return {
    emailId: email.messageId,
    subject: email.subject,
    from: email.from,
    date: email.date,
    links,
    cleanedText,
    wordCount,
  };
}

/**
 * Extract links from HTML content
 */
export function extractLinksFromHtml(html: string): Link[] {
  const links: Link[] = [];
  const seen = new Set<string>();

  // Match anchor tags with href
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const url = match[1];
    const text = match[2];

    // Skip if no URL captured
    if (!url) continue;

    // Skip invalid or duplicate URLs
    if (!isValidUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    links.push({
      url,
      title: text ? cleanLinkText(text) || undefined : undefined,
    });
  }

  return links;
}

/**
 * Extract links from plain text content
 */
export function extractLinksFromText(text: string): Link[] {
  const links: Link[] = [];
  const seen = new Set<string>();

  // Match URLs in text
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    let url = match[0];

    // Clean trailing punctuation
    url = url.replace(/[.,;:!?)]+$/, '');

    if (!isValidUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    links.push({ url });
  }

  return links;
}

/**
 * Check if URL is valid for extraction
 */
function isValidUrl(url: string): boolean {
  if (!url) return false;

  // Must be http or https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // Skip common tracking/utility URLs
  const skipPatterns = [
    /^mailto:/i,
    /^javascript:/i,
    /^#/,
    /unsubscribe/i,
    /optout/i,
    /manage.?preferences/i,
    /email.?settings/i,
    /list-unsubscribe/i,
    /click\.convertkit\./i,
    /mailchimp\.com/i,
    /beehiiv\.com\/unsubscribe/i,
    /substack\.com\/api\//i,
    /twitter\.com\/intent/i,
    /facebook\.com\/sharer/i,
    /linkedin\.com\/share/i,
  ];

  return !skipPatterns.some((pattern) => pattern.test(url));
}

/**
 * Clean link text
 */
function cleanLinkText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Clean and normalize text content
 */
export function cleanText(text: string): string {
  return (
    text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace on lines
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      // Remove excessive spaces
      .replace(/ {2,}/g, ' ')
      // Trim overall
      .trim()
  );
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  if (!text) return 0;

  // Split on whitespace and filter empty strings
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

/**
 * Estimate reading time in minutes
 */
export function estimateReadingTime(wordCount: number): number {
  // Average reading speed: 200 words per minute
  const WPM = 200;
  return Math.ceil(wordCount / WPM);
}

/**
 * Extract key sentences from content (for descriptions)
 */
export function extractKeySentences(text: string, count: number = 3): string[] {
  // Split into sentences
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 300);

  // Return first N sentences
  return sentences.slice(0, count);
}

/**
 * Detect newsletter source/type from content patterns
 */
export function detectNewsletterType(email: Email): string | null {
  const from = email.from.toLowerCase();

  // Common newsletter patterns
  const patterns: Array<{ pattern: RegExp; type: string }> = [
    { pattern: /substack/i, type: 'substack' },
    { pattern: /beehiiv/i, type: 'beehiiv' },
    { pattern: /convertkit/i, type: 'convertkit' },
    { pattern: /mailchimp/i, type: 'mailchimp' },
    { pattern: /revue/i, type: 'revue' },
    { pattern: /buttondown/i, type: 'buttondown' },
  ];

  for (const { pattern, type } of patterns) {
    if (pattern.test(from) || pattern.test(email.html || '')) {
      return type;
    }
  }

  return null;
}

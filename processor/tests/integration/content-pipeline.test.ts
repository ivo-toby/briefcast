/**
 * Integration tests for the content processing pipeline
 * Tests email parsing -> content extraction -> newsletter content flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseEmail, getEmailContent } from '../../src/email/parser.js';
import { extractNewsletterContent } from '../../src/content/extractor.js';

// Sample email content for testing
const SAMPLE_EMAIL_EML = `From: newsletter@example.com
To: podcast@briefcast.fm
Subject: Weekly Tech Digest - AI Updates
Date: Mon, 12 Jan 2026 10:00:00 +0000
Message-ID: <test-001@example.com>
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<!DOCTYPE html>
<html>
<head><title>Weekly Tech Digest</title></head>
<body>
<h1>Weekly Tech Digest</h1>
<p>Welcome to this week's edition of our tech newsletter.</p>
<h2>AI Engineering Updates</h2>
<p>This week we saw major advances in AI engineering practices. The latest research from leading labs shows promising results in model efficiency.</p>
<p>Read more at <a href="https://example.com/article1">our full article</a>.</p>
<h2>Developer Tools</h2>
<p>New tools are making development faster than ever. Claude Code and similar AI assistants are changing how engineers work.</p>
<p>Check out the <a href="https://example.com/tools">tools roundup</a>.</p>
<footer>
<p>Unsubscribe | Privacy Policy</p>
</footer>
</body>
</html>`;

const SIMPLE_TEXT_EMAIL = `From: simple@example.com
To: podcast@briefcast.fm
Subject: Quick Update
Date: Mon, 12 Jan 2026 11:00:00 +0000
Message-ID: <test-002@example.com>
Content-Type: text/plain; charset=utf-8

Hello!

This is a simple text email with some content.

Best regards,
The Team`;

const MULTIPART_EMAIL = `From: multipart@example.com
To: podcast@briefcast.fm
Subject: Multipart Newsletter
Date: Mon, 12 Jan 2026 12:00:00 +0000
Message-ID: <test-003@example.com>
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="boundary123"

--boundary123
Content-Type: text/plain; charset=utf-8

Plain text version of the newsletter.

--boundary123
Content-Type: text/html; charset=utf-8

<html>
<body>
<h1>HTML Newsletter</h1>
<p>This is the rich HTML version with more formatting and details about the latest developments in AI.</p>
</body>
</html>
--boundary123--`;

describe('Content Pipeline Integration', () => {
  describe('parseEmail', () => {
    it('should parse HTML email and extract headers', async () => {
      const email = await parseEmail(SAMPLE_EMAIL_EML);

      expect(email.from).toBe('newsletter@example.com');
      expect(email.to).toBe('podcast@briefcast.fm');
      expect(email.subject).toBe('Weekly Tech Digest - AI Updates');
      expect(email.messageId).toBe('<test-001@example.com>');
    });

    it('should parse plain text email', async () => {
      const email = await parseEmail(SIMPLE_TEXT_EMAIL);

      expect(email.from).toBe('simple@example.com');
      expect(email.subject).toBe('Quick Update');
      expect(email.textContent).toContain('simple text email');
    });

    it('should parse multipart email and extract both parts', async () => {
      const email = await parseEmail(MULTIPART_EMAIL);

      expect(email.from).toBe('multipart@example.com');
      expect(email.subject).toBe('Multipart Newsletter');
      // Should have both text and HTML content
      expect(email.textContent).toBeDefined();
      expect(email.htmlContent).toBeDefined();
    });

    it('should use fallback message ID when not present', async () => {
      const emailWithoutId = `From: test@example.com
To: podcast@briefcast.fm
Subject: No ID
Content-Type: text/plain

Content here.`;

      const email = await parseEmail(emailWithoutId, 'fallback-id');
      expect(email.messageId).toBe('fallback-id');
    });
  });

  describe('getEmailContent', () => {
    it('should prefer HTML content over text', async () => {
      const email = await parseEmail(SAMPLE_EMAIL_EML);
      const content = getEmailContent(email);

      expect(content).toContain('Weekly Tech Digest');
      expect(content).toContain('AI Engineering Updates');
    });

    it('should fallback to text content when no HTML', async () => {
      const email = await parseEmail(SIMPLE_TEXT_EMAIL);
      const content = getEmailContent(email);

      expect(content).toContain('simple text email');
    });
  });

  describe('extractNewsletterContent', () => {
    it('should extract structured content from HTML email', async () => {
      const email = await parseEmail(SAMPLE_EMAIL_EML);
      const content = extractNewsletterContent(email);

      expect(content.source).toBe('newsletter@example.com');
      expect(content.subject).toBe('Weekly Tech Digest - AI Updates');
      expect(content.wordCount).toBeGreaterThan(0);
      expect(content.mainContent).toContain('AI Engineering Updates');
    });

    it('should extract links from HTML content', async () => {
      const email = await parseEmail(SAMPLE_EMAIL_EML);
      const content = extractNewsletterContent(email);

      expect(content.links.length).toBeGreaterThan(0);
      expect(content.links.some(l => l.url === 'https://example.com/article1')).toBe(true);
    });

    it('should handle plain text emails', async () => {
      const email = await parseEmail(SIMPLE_TEXT_EMAIL);
      const content = extractNewsletterContent(email);

      expect(content.source).toBe('simple@example.com');
      expect(content.wordCount).toBeGreaterThan(0);
    });

    it('should strip footer content', async () => {
      const email = await parseEmail(SAMPLE_EMAIL_EML);
      const content = extractNewsletterContent(email);

      // Footer content should be stripped
      expect(content.mainContent).not.toContain('Unsubscribe');
      expect(content.mainContent).not.toContain('Privacy Policy');
    });
  });

  describe('Full pipeline: email to content', () => {
    it('should process email through full pipeline', async () => {
      // Parse email
      const email = await parseEmail(SAMPLE_EMAIL_EML);

      // Extract content
      const content = extractNewsletterContent(email);

      // Validate the pipeline produced usable content
      expect(content.source).toBeDefined();
      expect(content.subject).toBeDefined();
      expect(content.mainContent.length).toBeGreaterThan(50);
      expect(content.wordCount).toBeGreaterThan(10);

      // Content should be clean and readable
      expect(content.mainContent).not.toContain('<html>');
      expect(content.mainContent).not.toContain('<script>');
    });

    it('should handle multiple emails in sequence', async () => {
      const emails = [SAMPLE_EMAIL_EML, SIMPLE_TEXT_EMAIL, MULTIPART_EMAIL];
      const contents = [];

      for (const emlContent of emails) {
        const email = await parseEmail(emlContent);
        const content = extractNewsletterContent(email);
        contents.push(content);
      }

      expect(contents).toHaveLength(3);
      expect(contents.every(c => c.wordCount > 0)).toBe(true);
      expect(contents.every(c => c.source.length > 0)).toBe(true);
    });
  });
});

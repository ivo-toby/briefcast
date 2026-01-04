import { describe, it, expect } from 'vitest';
import { parseEmail, extractContent } from '../../src/lib/content-extractor';
import { sampleNewsletter, malformedEmail, emptyEmail } from '../fixtures/emails';
import type { Config } from '../../src/lib/types';

describe('parseEmail', () => {
  it('should parse valid newsletter email', async () => {
    const email = await parseEmail(sampleNewsletter);

    expect(email).toBeDefined();
    expect(email.from).toBe('newsletter@example.com');
    expect(email.to).toBe('briefcast@your-domain.com');
    expect(email.subject).toBe('Weekly AI Newsletter - January 2026');
    expect(email.messageId).toBe('<sample123@example.com>');
    expect(email.html).toContain('This Week in AI');
  });

  it('should handle empty email body', async () => {
    const email = await parseEmail(emptyEmail);

    expect(email).toBeDefined();
    expect(email.from).toBe('empty@example.com');
    expect(email.subject).toBe('Empty Newsletter');
    expect(email.text).toBe('');
  });

  it('should parse malformed email without throwing', async () => {
    const email = await parseEmail(malformedEmail);

    expect(email).toBeDefined();
    expect(email.from).toBe('malformed@example.com');
  });
});

describe('extractContent', () => {
  const mockConfig: Config = {
    schedule: { cron: '0 5 * * *' },
    filtering: {
      include_topics: ['AI', 'machine learning'],
      exclude_keywords: ['spam', 'unsubscribe'],
    },
    script_generation: {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.7,
      system_prompt: 'Generate podcast script',
    },
    tts: {
      voice_id: 'default',
      bitrate: 128,
    },
    podcast: {
      title: 'Test Podcast',
      description: 'Test',
      author: 'Test Author',
      email: 'test@example.com',
      category: 'Technology',
      language: 'en-us',
      base_url: 'https://example.com',
    },
    storage: {
      email_ttl_days: 7,
      max_episodes: 100,
    },
    workflow: {
      auto_approve: false,
    },
  };

  it('should extract content from newsletter', async () => {
    const email = await parseEmail(sampleNewsletter);
    const content = extractContent(email, mockConfig);

    expect(content).toBeDefined();
    expect(content.subject).toBe('Weekly AI Newsletter - January 2026');
    expect(content.cleanedText).toContain('This Week in AI');
    expect(content.links).toBeInstanceOf(Array);
    expect(content.links.length).toBeGreaterThan(0);
    expect(content.wordCount).toBeGreaterThan(0);
  });

  it('should extract links from HTML content', async () => {
    const email = await parseEmail(sampleNewsletter);
    const content = extractContent(email, mockConfig);

    expect(content.links).toContain('https://example.com/openai-news');
    expect(content.links).toContain('https://example.com/google-ai');
    expect(content.links).toContain('https://example.com/funding');
  });

  it('should handle empty content', async () => {
    const email = await parseEmail(emptyEmail);
    const content = extractContent(email, mockConfig);

    expect(content.cleanedText).toBe('');
    expect(content.wordCount).toBe(0);
    expect(content.links).toEqual([]);
  });
});

/**
 * Unit tests for structured script schema validation
 */

import { describe, it, expect } from 'vitest';
import {
  StructuredScriptSchema,
  ScriptSectionSchema,
  SectionTypeSchema,
  validateScript,
  safeValidateScript,
  hasValidSectionOrder,
} from '../../src/schemas/script.js';

// =============================================================================
// Test Data Helpers
// =============================================================================

/**
 * Create a valid script for testing
 */
function createValidScript() {
  return {
    date: '2026-01-12',
    episodeTitle: 'Test Episode Title',
    estimatedDurationMinutes: 15,
    sections: [
      { type: 'intro' as const, content: 'Welcome to today\'s episode of the podcast.' },
      { type: 'topic' as const, title: 'First Topic', content: 'This is the first topic content here.', sources: ['Source 1'] },
      { type: 'topic' as const, title: 'Second Topic', content: 'This is the second topic content here.', sources: ['Source 2'] },
      { type: 'synthesis' as const, content: 'To wrap up, we discussed multiple topics today.' },
    ],
  };
}

// =============================================================================
// SectionTypeSchema Tests
// =============================================================================

describe('SectionTypeSchema', () => {
  it('should accept valid section types', () => {
    expect(SectionTypeSchema.parse('intro')).toBe('intro');
    expect(SectionTypeSchema.parse('topic')).toBe('topic');
    expect(SectionTypeSchema.parse('synthesis')).toBe('synthesis');
  });

  it('should reject invalid section types', () => {
    expect(() => SectionTypeSchema.parse('invalid')).toThrow();
    expect(() => SectionTypeSchema.parse('outro')).toThrow();
    expect(() => SectionTypeSchema.parse('')).toThrow();
    expect(() => SectionTypeSchema.parse(123)).toThrow();
  });
});

// =============================================================================
// ScriptSectionSchema Tests
// =============================================================================

describe('ScriptSectionSchema', () => {
  it('should accept valid section with required fields', () => {
    const section = {
      type: 'topic',
      content: 'This is valid content for the section.',
    };
    const result = ScriptSectionSchema.parse(section);
    expect(result.type).toBe('topic');
    expect(result.content).toBe('This is valid content for the section.');
    expect(result.title).toBeUndefined();
    expect(result.sources).toBeUndefined();
  });

  it('should accept section with optional fields', () => {
    const section = {
      type: 'topic',
      title: 'My Topic',
      content: 'This is valid content for the section.',
      sources: ['Source 1', 'Source 2'],
    };
    const result = ScriptSectionSchema.parse(section);
    expect(result.title).toBe('My Topic');
    expect(result.sources).toEqual(['Source 1', 'Source 2']);
  });

  it('should reject content shorter than 10 characters', () => {
    const section = {
      type: 'intro',
      content: 'Too short',
    };
    expect(() => ScriptSectionSchema.parse(section)).toThrow(/at least 10 characters/);
  });

  it('should reject missing content', () => {
    const section = {
      type: 'intro',
    };
    expect(() => ScriptSectionSchema.parse(section)).toThrow();
  });

  it('should reject invalid type', () => {
    const section = {
      type: 'invalid',
      content: 'This is valid content for the section.',
    };
    expect(() => ScriptSectionSchema.parse(section)).toThrow();
  });
});

// =============================================================================
// StructuredScriptSchema Tests
// =============================================================================

describe('StructuredScriptSchema', () => {
  describe('valid scripts', () => {
    it('should accept a valid complete script', () => {
      const script = createValidScript();
      const result = StructuredScriptSchema.parse(script);
      expect(result.date).toBe('2026-01-12');
      expect(result.episodeTitle).toBe('Test Episode Title');
      expect(result.sections).toHaveLength(4);
    });

    it('should accept script with minimum sections (intro, topic, synthesis)', () => {
      const script = {
        date: '2026-01-12',
        episodeTitle: 'Minimal Episode',
        estimatedDurationMinutes: 5,
        sections: [
          { type: 'intro', content: 'Welcome to the show today.' },
          { type: 'topic', title: 'Single Topic', content: 'This is the only topic.' },
          { type: 'synthesis', content: 'Thanks for listening today.' },
        ],
      };
      const result = StructuredScriptSchema.parse(script);
      expect(result.sections).toHaveLength(3);
    });

    it('should accept script with many topics', () => {
      const script = {
        date: '2026-01-12',
        episodeTitle: 'Many Topics Episode',
        estimatedDurationMinutes: 45,
        sections: [
          { type: 'intro', content: 'Welcome to the show today.' },
          { type: 'topic', title: 'Topic 1', content: 'Content for topic one.' },
          { type: 'topic', title: 'Topic 2', content: 'Content for topic two.' },
          { type: 'topic', title: 'Topic 3', content: 'Content for topic three.' },
          { type: 'topic', title: 'Topic 4', content: 'Content for topic four.' },
          { type: 'topic', title: 'Topic 5', content: 'Content for topic five.' },
          { type: 'synthesis', content: 'Thanks for listening today.' },
        ],
      };
      const result = StructuredScriptSchema.parse(script);
      expect(result.sections).toHaveLength(7);
    });
  });

  describe('date validation', () => {
    it('should accept valid date format', () => {
      const script = createValidScript();
      script.date = '2025-12-31';
      expect(() => StructuredScriptSchema.parse(script)).not.toThrow();
    });

    it('should reject invalid date formats', () => {
      const script = createValidScript();

      script.date = '2026-1-12';
      expect(() => StructuredScriptSchema.parse(script)).toThrow(/YYYY-MM-DD/);

      script.date = '01-12-2026';
      expect(() => StructuredScriptSchema.parse(script)).toThrow(/YYYY-MM-DD/);

      script.date = '2026/01/12';
      expect(() => StructuredScriptSchema.parse(script)).toThrow(/YYYY-MM-DD/);

      script.date = 'Jan 12, 2026';
      expect(() => StructuredScriptSchema.parse(script)).toThrow(/YYYY-MM-DD/);
    });
  });

  describe('episodeTitle validation', () => {
    it('should accept title within length limits', () => {
      const script = createValidScript();
      script.episodeTitle = 'Valid Title Here';
      expect(() => StructuredScriptSchema.parse(script)).not.toThrow();
    });

    it('should reject title shorter than 5 characters', () => {
      const script = createValidScript();
      script.episodeTitle = 'Test';
      expect(() => StructuredScriptSchema.parse(script)).toThrow();
    });

    it('should reject title longer than 200 characters', () => {
      const script = createValidScript();
      script.episodeTitle = 'A'.repeat(201);
      expect(() => StructuredScriptSchema.parse(script)).toThrow();
    });
  });

  describe('duration validation', () => {
    it('should accept duration within limits', () => {
      const script = createValidScript();

      script.estimatedDurationMinutes = 3;
      expect(() => StructuredScriptSchema.parse(script)).not.toThrow();

      script.estimatedDurationMinutes = 60;
      expect(() => StructuredScriptSchema.parse(script)).not.toThrow();

      script.estimatedDurationMinutes = 30;
      expect(() => StructuredScriptSchema.parse(script)).not.toThrow();
    });

    it('should reject duration below minimum', () => {
      const script = createValidScript();
      script.estimatedDurationMinutes = 2;
      expect(() => StructuredScriptSchema.parse(script)).toThrow();
    });

    it('should reject duration above maximum', () => {
      const script = createValidScript();
      script.estimatedDurationMinutes = 61;
      expect(() => StructuredScriptSchema.parse(script)).toThrow();
    });
  });

  describe('section order validation', () => {
    it('should reject script without intro first', () => {
      const script = {
        date: '2026-01-12',
        episodeTitle: 'No Intro Episode',
        estimatedDurationMinutes: 10,
        sections: [
          { type: 'topic', title: 'Topic', content: 'Starting with topic instead.' },
          { type: 'topic', title: 'Topic 2', content: 'Another topic section here.' },
          { type: 'synthesis', content: 'Thanks for listening today.' },
        ],
      };
      expect(() => StructuredScriptSchema.parse(script)).toThrow(/intro.*topic.*synthesis/);
    });

    it('should reject script without synthesis last', () => {
      const script = {
        date: '2026-01-12',
        episodeTitle: 'No Synthesis Episode',
        estimatedDurationMinutes: 10,
        sections: [
          { type: 'intro', content: 'Welcome to the show today.' },
          { type: 'topic', title: 'Topic', content: 'This is a topic section here.' },
          { type: 'topic', title: 'Topic 2', content: 'Ending with topic instead.' },
        ],
      };
      expect(() => StructuredScriptSchema.parse(script)).toThrow(/intro.*topic.*synthesis/);
    });

    it('should reject script without any topics', () => {
      const script = {
        date: '2026-01-12',
        episodeTitle: 'No Topics Episode',
        estimatedDurationMinutes: 10,
        sections: [
          { type: 'intro', content: 'Welcome to the show today.' },
          { type: 'synthesis', content: 'Thanks for listening today.' },
        ],
      };
      expect(() => StructuredScriptSchema.parse(script)).toThrow();
    });

    it('should reject script with fewer than 3 sections', () => {
      const script = {
        date: '2026-01-12',
        episodeTitle: 'Too Few Sections',
        estimatedDurationMinutes: 10,
        sections: [
          { type: 'intro', content: 'Welcome to the show today.' },
        ],
      };
      expect(() => StructuredScriptSchema.parse(script)).toThrow(/at least 3 sections/);
    });

    it('should reject empty sections array', () => {
      const script = {
        date: '2026-01-12',
        episodeTitle: 'Empty Sections',
        estimatedDurationMinutes: 10,
        sections: [],
      };
      expect(() => StructuredScriptSchema.parse(script)).toThrow();
    });
  });
});

// =============================================================================
// validateScript Tests
// =============================================================================

describe('validateScript', () => {
  it('should return parsed script for valid input', () => {
    const script = createValidScript();
    const result = validateScript(script);
    expect(result).toEqual(script);
  });

  it('should throw for invalid input', () => {
    const invalid = { date: 'invalid' };
    expect(() => validateScript(invalid)).toThrow();
  });
});

// =============================================================================
// safeValidateScript Tests
// =============================================================================

describe('safeValidateScript', () => {
  it('should return success result for valid input', () => {
    const script = createValidScript();
    const result = safeValidateScript(script);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(script);
    }
  });

  it('should return error result for invalid input', () => {
    const invalid = { date: 'invalid' };
    const result = safeValidateScript(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

// =============================================================================
// hasValidSectionOrder Tests
// =============================================================================

describe('hasValidSectionOrder', () => {
  it('should return true for valid section order', () => {
    const sections = [
      { type: 'intro' },
      { type: 'topic' },
      { type: 'synthesis' },
    ];
    expect(hasValidSectionOrder(sections)).toBe(true);
  });

  it('should return true for multiple topics', () => {
    const sections = [
      { type: 'intro' },
      { type: 'topic' },
      { type: 'topic' },
      { type: 'topic' },
      { type: 'synthesis' },
    ];
    expect(hasValidSectionOrder(sections)).toBe(true);
  });

  it('should return false for fewer than 3 sections', () => {
    expect(hasValidSectionOrder([{ type: 'intro' }])).toBe(false);
    expect(hasValidSectionOrder([{ type: 'intro' }, { type: 'topic' }])).toBe(false);
    expect(hasValidSectionOrder([])).toBe(false);
  });

  it('should return false when not starting with intro', () => {
    const sections = [
      { type: 'topic' },
      { type: 'topic' },
      { type: 'synthesis' },
    ];
    expect(hasValidSectionOrder(sections)).toBe(false);
  });

  it('should return false when not ending with synthesis', () => {
    const sections = [
      { type: 'intro' },
      { type: 'topic' },
      { type: 'topic' },
    ];
    expect(hasValidSectionOrder(sections)).toBe(false);
  });

  it('should return false when no topics', () => {
    const sections = [
      { type: 'intro' },
      { type: 'synthesis' },
      { type: 'synthesis' },
    ];
    expect(hasValidSectionOrder(sections)).toBe(false);
  });
});

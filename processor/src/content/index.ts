/**
 * Content module exports
 * Provides content extraction and processing functionality
 */

export {
  extractNewsletterContent,
  extractLinksFromHtml,
  extractLinksFromText,
  cleanText,
  countWords,
  estimateReadingTime,
  extractKeySentences,
  detectNewsletterType,
} from './extractor.js';

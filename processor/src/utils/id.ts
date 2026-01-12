/**
 * ID generation utilities
 */

/**
 * Generate episode ID from date
 * Format: ep-YYYYMMDD
 */
export function generateEpisodeId(date: string | Date): string {
  const dateStr = typeof date === 'string'
    ? date.replace(/-/g, '')
    : date.toISOString().split('T')[0].replace(/-/g, '');
  return `ep-${dateStr}`;
}

/**
 * Generate unique run ID
 * Format: run-{timestamp}-{random}
 */
export function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run-${timestamp}-${random}`;
}

/**
 * Generate unique request ID
 * Format: req-{timestamp}-{random}
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req-${timestamp}-${random}`;
}

/**
 * Extract date from episode ID
 */
export function getDateFromEpisodeId(episodeId: string): string | null {
  const match = episodeId.match(/^ep-(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Validate episode ID format
 */
export function isValidEpisodeId(id: string): boolean {
  return /^ep-\d{8}$/.test(id);
}

/**
 * Slugify string for use in filenames/URLs
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

/**
 * Email module exports
 * Provides email reading and parsing functionality
 */

// Reader functions
export {
  listPendingEmails,
  hasPendingEmails,
  countPendingEmails,
  fetchEmail,
  fetchAllPendingEmails,
  deletePendingEmail,
  moveEmail,
  type PendingEmailRef,
  type FetchedEmail,
  type BatchFetchResult,
} from './reader.js';

// Parser functions
export {
  parseEmail,
  extractSenderDomain,
  extractSenderName,
  getEmailContent,
  isAutomatedEmail,
} from './parser.js';

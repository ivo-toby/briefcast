import { readFileSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(__dirname, 'emails');

export const sampleNewsletter = readFileSync(join(fixturesDir, 'sample-newsletter.eml'), 'utf-8');
export const malformedEmail = readFileSync(join(fixturesDir, 'malformed.eml'), 'utf-8');
export const emptyEmail = readFileSync(join(fixturesDir, 'empty.eml'), 'utf-8');

export const mockEmails = {
  sampleNewsletter,
  malformedEmail,
  emptyEmail,
};

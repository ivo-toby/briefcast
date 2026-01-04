import type { Env } from './lib/types';
import { parseEmail } from './lib/content-extractor';
import { storeEmail } from './lib/storage';
import { createLogger } from './lib/logger';
import { loadConfig } from './lib/config-loader';

const logger = createLogger('email-worker');

export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  try {
    const config = await loadConfig(env);
    const rawEmail = new TextDecoder().decode(message.raw);
    const email = await parseEmail(rawEmail);

    logger.info('Email received', { from: email.from, subject: email.subject });

    await storeEmail(email.messageId, rawEmail, env, config.storage.email_ttl_days);

    logger.info('Email stored successfully', { emailId: email.messageId });
  } catch (error) {
    logger.error('Failed to process email', { error });
    throw error;
  }
}

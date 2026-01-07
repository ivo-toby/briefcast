import type { Env } from './lib/types';
import { parseEmail } from './lib/content-extractor';
import { storeEmail } from './lib/storage';
import { createLogger } from './lib/logger';
import { loadConfig } from './lib/config-loader';

const logger = createLogger('email-worker');

export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  try {
    const config = await loadConfig(env);

    // Read the raw email stream into an ArrayBuffer
    const rawEmailBuffer = await new Response(message.raw).arrayBuffer();
    const rawEmail = new TextDecoder().decode(rawEmailBuffer);
    const email = await parseEmail(rawEmail);

    logger.info('Email received', { from: email.from, subject: email.subject });

    // Check if sender is in allowlist before storing
    const isAllowed = config.email.allowed_senders.some(allowed => {
      // Support both exact email match and domain wildcard (*@domain.com)
      if (allowed.startsWith('*@')) {
        const domain = allowed.slice(2);
        return email.from.endsWith(`@${domain}`);
      }
      return email.from.toLowerCase() === allowed.toLowerCase();
    });

    if (isAllowed) {
      await storeEmail(email.messageId, rawEmail, env, config.storage.email_ttl_days);
      logger.info('Email stored successfully', { emailId: email.messageId });
    } else {
      logger.info('Email not stored - sender not in allowlist', { from: email.from });
    }

    // Always forward ALL emails to configured address
    await message.forward(config.email.forward_to);
    logger.info('Email forwarded', { to: config.email.forward_to });
  } catch (error) {
    logger.error('Failed to process email', { error });
    throw error;
  }
}

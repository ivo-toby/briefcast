import type { Env } from './lib/types';
import { loadConfig } from './lib/config-loader';
import { getEmails, deleteEmail, storePendingScript, storeAudio, cleanupOldEpisodes } from './lib/storage';
import { extractContent } from './lib/content-extractor';
import { generateScript } from './lib/script-generator';
import { createLogger } from './lib/logger';

const logger = createLogger('scheduled-worker');

export async function handleScheduled(env: Env): Promise<void> {
  try {
    logger.info('Starting daily aggregation');

    const config = await loadConfig(env);
    const emails = await getEmails(env);

    if (emails.size === 0) {
      logger.info('No newsletters to process, skipping');
      return;
    }

    const { parseEmail } = await import('./lib/content-extractor');
    const newsletters = [];

    for (const [id, raw] of emails) {
      const email = await parseEmail(raw);
      const content = extractContent(email, config);
      newsletters.push(content);
      await deleteEmail(id, env);
    }

    const script = await generateScript(newsletters, config, env);
    await storePendingScript(script, env);

    await cleanupOldEpisodes(config.storage.max_episodes, env);

    logger.info('Daily aggregation completed', { scriptId: script.id });
  } catch (error) {
    logger.error('Daily aggregation failed', { error });
    throw error;
  }
}

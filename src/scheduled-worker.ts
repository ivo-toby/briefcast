import type { Env } from './lib/types';
import { loadConfig } from './lib/config-loader';
import { getEmails, deleteEmail, storeAudio, storeScript, storeEpisodeMetadata, getAllEpisodes, updateRSSFeed, cleanupOldEpisodes } from './lib/storage';
import { extractContent } from './lib/content-extractor';
import { generateScript } from './lib/script-generator';
import { generateAudio } from './lib/tts-generator';
import { generateRSSFeed } from './lib/rss-generator';
import { createLogger } from './lib/logger';

const logger = createLogger('scheduled-worker');

export async function handleScheduled(env: Env): Promise<void> {
  try {
    logger.info('Starting daily podcast generation');

    const config = await loadConfig(env);
    const emails = await getEmails(env);

    if (emails.size === 0) {
      logger.info('No newsletters to process, skipping');
      return;
    }

    const { parseEmail } = await import('./lib/content-extractor');
    const newsletters = [];
    const emailIds: string[] = [];

    // Process all emails (but don't delete yet)
    for (const [id, raw] of emails) {
      const email = await parseEmail(raw);
      const content = extractContent(email, config);
      newsletters.push(content);
      emailIds.push(id);
    }

    logger.info('Generating podcast script', { newsletterCount: newsletters.length });

    // Generate script
    const script = await generateScript(newsletters, config, env);

    logger.info('Generating audio', { scriptId: script.id, wordCount: script.wordCount });

    // Generate audio (automatically, no approval needed)
    const { audioFile, buffer } = await generateAudio(script, config, env);
    const audioUrl = await storeAudio(audioFile, buffer, config, env);

    // Update audio file with actual URL
    audioFile.url = audioUrl;

    logger.info('Audio generated successfully', { audioUrl, durationSeconds: audioFile.durationSeconds });

    // Store script text file if enabled
    if (config.storage.save_scripts) {
      const scriptUrl = await storeScript(script, config, env);
      logger.info('Script saved', { scriptUrl });
    }

    // Store episode metadata
    await storeEpisodeMetadata(audioFile, script, env);

    // Regenerate RSS feed with all episodes
    const allEpisodes = await getAllEpisodes(env);
    const feedXml = generateRSSFeed(allEpisodes, config);
    await updateRSSFeed(feedXml, env);

    logger.info('RSS feed updated', { totalEpisodes: allEpisodes.length });

    // Clean up old episodes
    await cleanupOldEpisodes(config.storage.max_episodes, env);

    // Only delete emails after EVERYTHING succeeded
    for (const id of emailIds) {
      await deleteEmail(id, env);
    }

    logger.info('Emails deleted from KV', { count: emailIds.length });

    logger.info('Daily podcast generation completed', {
      scriptId: script.id,
      audioUrl,
      episodeCount: allEpisodes.length
    });
  } catch (error) {
    logger.error('Daily podcast generation failed', { error });
    throw error;
  }
}

/**
 * Briefcast Processor
 * Main orchestrator for podcast episode generation
 *
 * Pipeline:
 * 1. Load configuration from R2
 * 2. Fetch pending emails from R2
 * 3. Extract content from newsletters
 * 4. Generate structured script via Claude
 * 5. Generate TTS audio for each section
 * 6. Normalize and assemble audio
 * 7. Upload episode and update RSS feed
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ProcessorEnv, EpisodeMetadata } from '@briefcast/shared';
import { clearConfigCache } from '@briefcast/shared';

// Storage
import { createR2Client, createR2Config } from './storage/r2-client.js';

// Config
import { loadConfigWithTransform } from './config/loader.js';

// Email
import { fetchAllPendingEmails, deletePendingEmail } from './email/index.js';

// Content
import { extractNewsletterContent } from './content/index.js';

// Script
import { createScriptGenerator, formatScriptSummary } from './script/index.js';

// TTS
import { createTTSGenerator } from './tts/index.js';

// Audio
import { createAudioAssembler, type AssemblySectionInput } from './audio/index.js';

// RSS
import { createRSSGenerator } from './rss/index.js';

// Utils
import {
  logger,
  configureLogger,
  logStart,
  logComplete,
  logError,
  timedOperation,
  getTodayDate,
  generateEpisodeId,
  generateRunId,
} from './utils/index.js';

/**
 * Processing result
 */
export interface ProcessingResult {
  success: boolean;
  episodeId?: string;
  audioUrl?: string;
  durationSeconds?: number;
  error?: Error;
}

/**
 * Main processing function
 */
export async function processEmails(env: ProcessorEnv): Promise<ProcessingResult> {
  const runId = generateRunId();
  const date = getTodayDate();
  const episodeId = generateEpisodeId(date);

  // Configure logging
  configureLogger({
    level: env.LOG_LEVEL ?? 'info',
    json: env.NODE_ENV === 'production',
  });

  const log = logger.child('processor');
  log.info('Starting processing run', { runId, date, episodeId });

  // Clear config cache for fresh run
  clearConfigCache();

  try {
    // Initialize R2 client
    const r2Client = createR2Client(env);

    // Step 1: Load configuration
    log.info('Loading configuration');
    const config = await timedOperation(
      'load-config',
      () => loadConfigWithTransform(r2Client)
    );

    // Setup temp directory
    const tempDir = env.TEMP_DIR ?? '/tmp/briefcast';
    await fs.mkdir(tempDir, { recursive: true });

    // Step 2: Fetch pending emails
    log.info('Fetching pending emails');
    const { successful: emails, failed: fetchErrors } = await timedOperation(
      'fetch-emails',
      () => fetchAllPendingEmails(r2Client)
    );

    if (fetchErrors.length > 0) {
      log.warn('Some emails failed to fetch', {
        count: fetchErrors.length,
        ids: fetchErrors.map((e) => e.ref.messageId),
      });
    }

    if (emails.length === 0) {
      log.info('No pending emails to process');
      return { success: true };
    }

    log.info('Processing emails', { count: emails.length });

    // Step 3: Extract content from newsletters
    log.info('Extracting newsletter content');
    const contents = await timedOperation('extract-content', async () => {
      return emails.map((e) => extractNewsletterContent(e.email));
    });

    log.info('Extracted content', {
      count: contents.length,
      totalWords: contents.reduce((sum, c) => sum + c.wordCount, 0),
    });

    // Step 4: Generate structured script
    log.info('Generating script');
    const scriptGenerator = createScriptGenerator(env, config);
    const { script } = await timedOperation('generate-script', () =>
      scriptGenerator.generate(contents, date)
    );

    log.info('Script generated', { summary: formatScriptSummary(script) });

    // Step 5: Generate TTS audio for each section
    log.info('Generating TTS audio');
    const ttsGenerator = createTTSGenerator(env, config);
    const ttsOutputDir = path.join(tempDir, `tts-${episodeId}`);
    const ttsResult = await timedOperation('generate-tts', () =>
      ttsGenerator.generateScriptAudio(script, { outputDir: ttsOutputDir })
    );

    log.info('TTS complete', {
      sections: ttsResult.sections.length,
      estimatedDuration: ttsResult.totalDurationEstimate,
    });

    // Step 6: Assemble audio with music
    log.info('Assembling episode audio');
    const assembler = createAudioAssembler(config, r2Client, tempDir);
    const episodePath = path.join(tempDir, `${episodeId}.mp3`);

    const sectionInputs: AssemblySectionInput[] = ttsResult.sections.map((s) => ({
      type: s.type as 'intro' | 'topic' | 'synthesis',
      title: s.title,
      audioPath: s.audioPath,
    }));

    const assembled = await timedOperation('assemble-audio', () =>
      assembler.assembleEpisode(sectionInputs, episodePath)
    );

    log.info('Episode assembled', {
      durationSeconds: assembled.durationSeconds,
      fileSizeBytes: assembled.fileSizeBytes,
    });

    // Step 7: Upload episode to R2
    log.info('Uploading episode');
    const audioBuffer = await fs.readFile(episodePath);
    const audioKey = `episodes/${episodeId}.mp3`;
    await r2Client.putObject(audioKey, audioBuffer, 'audio/mpeg');
    const audioUrl = r2Client.getPublicUrl(audioKey);

    log.info('Episode uploaded', { audioUrl });

    // Step 8: Create episode metadata and update RSS
    const episodeMetadata: EpisodeMetadata = {
      id: episodeId,
      date,
      title: script.episodeTitle,
      description: generateDescription(script),
      durationSeconds: assembled.durationSeconds,
      fileSizeBytes: assembled.fileSizeBytes,
      audioUrl,
      sections: assembled.sections,
      sources: emails.map((e) => e.email.from),
      generatedAt: new Date().toISOString(),
    };

    log.info('Updating RSS feed');
    const rssGenerator = createRSSGenerator(config, r2Client);
    await timedOperation('update-rss', () =>
      rssGenerator.addEpisodeToFeed(episodeMetadata)
    );

    // Step 9: Cleanup - delete processed emails
    log.info('Cleaning up processed emails');
    for (const email of emails) {
      await deletePendingEmail(r2Client, email.ref);
    }

    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    log.info('Processing complete', {
      episodeId,
      audioUrl,
      durationSeconds: assembled.durationSeconds,
    });

    return {
      success: true,
      episodeId,
      audioUrl,
      durationSeconds: assembled.durationSeconds,
    };
  } catch (error) {
    logError('Processing failed', error as Error, { runId, episodeId });

    return {
      success: false,
      error: error as Error,
    };
  }
}

/**
 * Generate episode description from script
 */
function generateDescription(script: { sections: Array<{ type: string; title?: string }> }): string {
  const topics = script.sections
    .filter((s) => s.type === 'topic' && s.title)
    .map((s) => s.title);

  if (topics.length === 0) {
    return 'Daily tech briefing for AI engineers and tinkerers.';
  }

  return `Today's topics: ${topics.join(', ')}.`;
}

/**
 * Entry point
 */
async function main(): Promise<void> {
  // Load environment variables
  const env: ProcessorEnv = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME!,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL!,
    LOG_LEVEL: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ?? 'info',
    TEMP_DIR: process.env.TEMP_DIR,
    NODE_ENV: (process.env.NODE_ENV as 'development' | 'production') ?? 'production',
  };

  // Validate required env vars
  const required = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing required environment variable: ${key}`);
      process.exit(1);
    }
  }

  // Run processing
  const result = await processEmails(env);

  if (!result.success) {
    console.error('Processing failed:', result.error);
    process.exit(1);
  }

  console.log('Processing completed successfully');
  process.exit(0);
}

// Run main if executed directly
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

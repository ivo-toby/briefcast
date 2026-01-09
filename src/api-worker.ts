import type { Env, ManualTriggerResponse, PendingScriptsResponse, ApproveScriptResponse, TestTTSRequest, TestTTSResponse, GenerateScriptResponse } from './lib/types';
import { requireAuth } from './lib/auth';
import { handleScheduled } from './scheduled-worker';
import { getPendingScripts, deletePendingScript, storeAudio, storeScript, storeEpisodeMetadata, getAllEpisodes, updateRSSFeed, getEmails, storePendingScript } from './lib/storage';
import { generateAudio } from './lib/tts-generator';
import { generateRSSFeed } from './lib/rss-generator';
import { loadConfig } from './lib/config-loader';
import { createLogger } from './lib/logger';
import { extractContent } from './lib/content-extractor';
import { generateScript } from './lib/script-generator';

const logger = createLogger('api-worker');

export async function handleAPI(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/trigger' && request.method === 'POST') {
      return await requireAuth(handleTrigger)(request, env);
    }

    if (path === '/pending' && request.method === 'GET') {
      return await requireAuth(handlePending)(request, env);
    }

    if (path.startsWith('/approve/') && request.method === 'POST') {
      return await requireAuth(handleApprove)(request, env);
    }

    if (path.startsWith('/reject/') && request.method === 'POST') {
      return await requireAuth(handleReject)(request, env);
    }

    if (path === '/test-tts' && request.method === 'POST') {
      return await requireAuth(handleTestTTS)(request, env);
    }

    if (path === '/generate-script' && request.method === 'POST') {
      return await requireAuth(handleGenerateScript)(request, env);
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    logger.error('API error', { error, path });
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleTrigger(request: Request, env: Env): Promise<Response> {
  await handleScheduled(env);
  const response: ManualTriggerResponse = { success: true, message: 'Triggered successfully' };
  return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
}

async function handlePending(request: Request, env: Env): Promise<Response> {
  const scripts = await getPendingScripts(env);
  const response: PendingScriptsResponse = { scripts };
  return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
}

async function handleApprove(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const scriptId = url.pathname.split('/').pop() || '';
  const config = await loadConfig(env);
  const scripts = await getPendingScripts(env);
  const script = scripts.find((s) => s.id === scriptId);

  if (!script) {
    return new Response(JSON.stringify({ error: 'Script not found' }), { status: 404 });
  }

  // Generate and store audio
  const { audioFile, buffer } = await generateAudio(script, config, env);
  const audioUrl = await storeAudio(audioFile, buffer, config, env);

  // Update audio file with the actual URL
  audioFile.url = audioUrl;

  // Store script text file if enabled
  if (config.storage.save_scripts) {
    await storeScript(script, config, env);
  }

  // Store episode metadata for RSS feed
  await storeEpisodeMetadata(audioFile, script, env);

  // Regenerate RSS feed with all episodes
  const allEpisodes = await getAllEpisodes(env);
  const feedXml = generateRSSFeed(allEpisodes, config);
  await updateRSSFeed(feedXml, env);

  // Clean up
  await deletePendingScript(scriptId, env);

  logger.info('Script approved and RSS feed updated', { scriptId, episodeCount: allEpisodes.length });

  const response: ApproveScriptResponse = { success: true, message: 'Script approved', audioUrl };
  return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
}

async function handleReject(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const scriptId = url.pathname.split('/').pop() || '';
  await deletePendingScript(scriptId, env);
  return new Response(JSON.stringify({ success: true, message: 'Script rejected' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGenerateScript(request: Request, env: Env): Promise<Response> {
  try {
    logger.info('Starting script-only generation');

    const config = await loadConfig(env);
    const emails = await getEmails(env);

    if (emails.size === 0) {
      const response: GenerateScriptResponse = {
        success: false,
        message: 'No newsletters to process',
      };
      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { parseEmail } = await import('./lib/content-extractor');
    const newsletters = [];

    // Process all emails (but don't delete)
    for (const [_id, raw] of emails) {
      const email = await parseEmail(raw);
      const content = extractContent(email, config);
      newsletters.push(content);
    }

    logger.info('Generating podcast script', { newsletterCount: newsletters.length });

    // Generate script
    const script = await generateScript(newsletters, config, env);

    // Save as pending script for later approval
    await storePendingScript(script, env);

    logger.info('Script generated and saved as pending', { scriptId: script.id });

    const response: GenerateScriptResponse = {
      success: true,
      message: 'Script generated successfully',
      scriptId: script.id,
      scriptContent: script.content,
      wordCount: script.wordCount,
      newsletterCount: newsletters.length,
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Script generation failed', { error });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response: GenerateScriptResponse = {
      success: false,
      message: 'Script generation failed',
      error: errorMessage,
    };
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleTestTTS(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as TestTTSRequest;

    if (!body.text || typeof body.text !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing or invalid "text" field in request body'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const config = await loadConfig(env);

    // Override style_prompt if provided in request
    if (body.style_prompt) {
      config.tts.style_prompt = body.style_prompt;
    }

    // Create a mock script object
    const wordCount = body.text.split(/\s+/).length;
    const mockScript = {
      id: `test-${Date.now()}`,
      date: new Date(),
      content: body.text,
      wordCount: wordCount,
      estimatedDurationMinutes: Math.ceil(wordCount / 150),
      newsletterCount: 0,
      status: 'approved' as const,
      metadata: {
        topics: [],
        newsletterSources: [],
      },
    };

    logger.info('Testing TTS generation', {
      textLength: body.text.length,
      wordCount: mockScript.wordCount,
      hasStylePrompt: !!config.tts.style_prompt
    });

    // Generate audio
    const { audioFile, buffer } = await generateAudio(mockScript, config, env);

    // Store test audio in R2 with "test-" prefix
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-${timestamp}.${audioFile.format}`;

    await env.PODCAST_BUCKET.put(filename, buffer, {
      httpMetadata: {
        contentType: `audio/${audioFile.format}`,
      },
    });

    const audioUrl = `${config.podcast.site_url}/${filename}`;

    logger.info('TTS test completed and saved', {
      audioSizeBytes: audioFile.fileSizeBytes,
      durationSeconds: audioFile.durationSeconds,
      format: audioFile.format,
      url: audioUrl
    });

    const response: TestTTSResponse = {
      success: true,
      message: 'TTS generation successful',
      audioUrl: audioUrl,
      audioSizeBytes: audioFile.fileSizeBytes,
      durationSeconds: audioFile.durationSeconds,
      chunks: Math.ceil(mockScript.content.length / 2000),
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    logger.error('TTS test error', { error });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const response: TestTTSResponse = {
      success: false,
      message: 'TTS generation failed',
      error: errorMessage,
    };
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

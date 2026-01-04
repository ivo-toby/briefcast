import type { Env, ManualTriggerResponse, PendingScriptsResponse, ApproveScriptResponse } from './lib/types';
import { requireAuth } from './lib/auth';
import { handleScheduled } from './scheduled-worker';
import { getPendingScripts, deletePendingScript, storeAudio } from './lib/storage';
import { generateAudio } from './lib/tts-generator';
import { loadConfig } from './lib/config-loader';
import { createLogger } from './lib/logger';

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

  const audioFile = await generateAudio(script, config, env);
  const audioBuffer = new ArrayBuffer(0);
  const audioUrl = await storeAudio(audioFile, audioBuffer, env);
  await deletePendingScript(scriptId, env);

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

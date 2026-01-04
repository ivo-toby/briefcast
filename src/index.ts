import type { Env } from './lib/types';
import { handleEmail } from './email-worker';
import { handleScheduled } from './scheduled-worker';
import { handleAPI } from './api-worker';

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await handleScheduled(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    return await handleAPI(request, env);
  },
};

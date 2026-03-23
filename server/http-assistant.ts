import {
  parseAssistantPreferencesInput,
  parseAssistantTurnInput,
  parseCreateAssistantThreadInput,
} from './assistant-input.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export const handleAssistantRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (req.method === 'POST' && pathname === '/api/assistant/auth/chatgpt/start') {
    const result = await context.assistant.startChatgptLogin();
    writeJson(res, 200, result);
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/assistant/logout') {
    await context.assistant.logout();
    writeJson(res, 200, { ok: true });
    return true;
  }
  if (req.method === 'PUT' && pathname === '/api/assistant/preferences') {
    const preferences = context.assistant.updatePreferences(parseAssistantPreferencesInput(await readJson(req)));
    writeJson(res, 200, { preferences });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/assistant/threads') {
    const thread = await context.assistant.createThread(parseCreateAssistantThreadInput(await readJson(req)));
    writeJson(res, 200, { thread });
    return true;
  }
  const loginCancelMatch = pathname.match(/^\/api\/assistant\/auth\/chatgpt\/([^/]+)\/cancel$/);
  if (loginCancelMatch && req.method === 'POST') {
    await context.assistant.cancelLogin(decodeRouteParam(loginCancelMatch[1]));
    writeJson(res, 200, { ok: true });
    return true;
  }
  const threadMatch = pathname.match(/^\/api\/assistant\/threads\/([^/]+)$/);
  if (threadMatch && req.method === 'GET') {
    const thread = await context.assistant.readThread(decodeRouteParam(threadMatch[1]));
    writeJson(res, 200, { thread });
    return true;
  }
  const threadTurnsMatch = pathname.match(/^\/api\/assistant\/threads\/([^/]+)\/turns$/);
  if (threadTurnsMatch && req.method === 'POST') {
    const threadId = decodeRouteParam(threadTurnsMatch[1]);
    await context.assistant.startTurn({
      threadId,
      ...parseAssistantTurnInput(await readJson(req)),
    });
    writeJson(res, 200, { ok: true });
    return true;
  }
  const threadInterruptMatch = pathname.match(/^\/api\/assistant\/threads\/([^/]+)\/interrupt\/([^/]+)$/);
  if (threadInterruptMatch && req.method === 'POST') {
    await context.assistant.interruptTurn(
      decodeRouteParam(threadInterruptMatch[1]),
      decodeRouteParam(threadInterruptMatch[2])
    );
    writeJson(res, 200, { ok: true });
    return true;
  }
  return false;
};

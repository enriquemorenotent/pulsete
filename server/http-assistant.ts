import {
  assistantRequestBodyLimitBytes,
  parseAssistantImportInput,
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
    const preferences = context.assistant.updatePreferences(
      parseAssistantPreferencesInput(await readJson(req, assistantRequestBodyLimitBytes))
    );
    writeJson(res, 200, { preferences });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/assistant/threads') {
    const thread = await context.assistant.createThread(
      parseCreateAssistantThreadInput(await readJson(req, assistantRequestBodyLimitBytes))
    );
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
  if (threadMatch && req.method === 'DELETE') {
    await context.assistant.deleteThread(decodeRouteParam(threadMatch[1]));
    writeJson(res, 200, { ok: true });
    return true;
  }
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
      ...parseAssistantTurnInput(await readJson(req, assistantRequestBodyLimitBytes)),
    });
    writeJson(res, 200, { ok: true });
    return true;
  }
  const threadImportMatch = pathname.match(/^\/api\/assistant\/threads\/([^/]+)\/import-history$/);
  if (threadImportMatch && req.method === 'POST') {
    const threadId = decodeRouteParam(threadImportMatch[1]);
    await context.assistant.importHistory({
      threadId,
      ...parseAssistantImportInput(await readJson(req, assistantRequestBodyLimitBytes)),
    });
    writeJson(res, 200, { ok: true });
    return true;
  }
  const threadInterruptMatch = pathname.match(/^\/api\/assistant\/threads\/([^/]+)\/interrupt$/);
  if (threadInterruptMatch && req.method === 'POST') {
    await context.assistant.interruptThread(decodeRouteParam(threadInterruptMatch[1]));
    writeJson(res, 200, { ok: true });
    return true;
  }
  const turnInterruptMatch = pathname.match(/^\/api\/assistant\/threads\/([^/]+)\/interrupt\/([^/]+)$/);
  if (turnInterruptMatch && req.method === 'POST') {
    await context.assistant.interruptTurn(
      decodeRouteParam(turnInterruptMatch[1]),
      decodeRouteParam(turnInterruptMatch[2])
    );
    writeJson(res, 200, { ok: true });
    return true;
  }
  return false;
};

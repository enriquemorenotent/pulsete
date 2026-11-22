import { expect, test, type Page, type TestInfo, type WebSocketRoute } from '@playwright/test';
import type { BufferState, ChatMessage } from '../../shared/protocol-chat.js';
import type { ServerMessage } from '../../shared/protocol-messages.js';
import type { WorkspacePreferencesPatch } from '../../shared/protocol-preferences.js';
import { emptySnapshot, makeBuffer, makeNetwork } from '../../tests/helpers/app-state-test-helpers.js';

async function openTestConversation(page: Page, testInfo: TestInfo) {
  const network = makeNetwork({ workspaceOpen: true });
  const server = makeBuffer({ id: 'server' });
  const alice = makeBuffer({ id: 'alice', target: 'alice', kind: 'query' });
  const bob = makeBuffer({ id: 'bob', target: 'bob', kind: 'query' });
  const channel = makeBuffer({ id: 'help', target: '#help', kind: 'channel' });
  const snapshot = {
    ...emptySnapshot(),
    networks: [network],
    buffers: [server, alice, bob, channel],
    channels: [{ networkId: network.id, id: channel.id, name: channel.target, topic: '', users: [] }],
    networkStates: { [network.id]: { phase: 'connected' as const, nick: network.nick, serverName: 'Test IRC' } },
    sync: { epoch: 'test', revision: 0 },
  };
  let revision = 0;
  let socket!: WebSocketRoute;
  const outbound: string[] = [];
  const aliceMessageIds: string[] = [];
  const patch = (message: ServerMessage) => ({ ...message, sync: { epoch: 'test', revision: ++revision } });
  const incoming = (buffer: BufferState, id: string, messageOverrides: Partial<ChatMessage> = {}, arrival = true) => {
    if (buffer.id === alice.id) aliceMessageIds.push(id);
    socket.send(JSON.stringify(patch({
      type: 'message.append',
      message: { id, bufferId: buffer.id, networkId: buffer.networkId, nick: buffer.target, target: buffer.target,
        body: id, kind: 'line', self: false, ts: Date.now(), ...messageOverrides },
      ...(arrival ? { arrival: { buffer } } : {}),
    })));
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await page.routeWebSocket('**/ws', ws => {
    socket = ws;
    socket.onMessage(message => outbound.push(String(message)));
    socket.send(JSON.stringify({ type: 'state.ready', snapshot }));
  });
  await page.route('**/api/client-auth', route => route.fulfill({ status: 200 }));
  const historyMarker: ChatMessage = { id: 'initial-history', bufferId: alice.id, networkId: alice.networkId,
    nick: alice.target, target: alice.target, body: 'Earlier conversation', kind: 'line', self: false, ts: 1 };
  aliceMessageIds.push(historyMarker.id);
  await page.route('**/api/buffers/*/history?*', route => route.fulfill({ json: {
    messages: new URL(route.request().url()).pathname === '/api/buffers/alice/history'
      && aliceMessageIds.includes(historyMarker.id) ? [historyMarker] : [], hasMore: false,
  } }));
  await page.route('**/api/buffers/alice/history', route => {
    expect(route.request().method()).toBe('DELETE');
    return route.fulfill({ json: { buffer: alice, ok: true, messages: [patch({
      type: 'message.remove', bufferId: alice.id, networkId: alice.networkId,
      target: alice.target, messageIds: aliceMessageIds.splice(0),
    })] } });
  });
  await page.route('**/api/buffers/*/pins', route => route.fulfill({ json: { messages: [] } }));
  await page.route('**/api/buffers/*/draft', route => route.fulfill({ json: { draft: null, messages: [] } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: {
    connected: true, detail: 'Connected', provider: 'codex-openai-login', model: null, availableModels: [],
    modelsError: null, reasoningEffort: null, selectionNotice: null,
  } }));
  await page.route('**/api/assistant/index-progress', route => route.fulfill({ json: { stage: 'idle' } }));
  await page.route('**/api/preferences', route => {
    const preferences = { ...snapshot.preferences, ...route.request().postDataJSON() as WorkspacePreferencesPatch };
    return route.fulfill({ json: { preferences, messages: [patch({ type: 'preferences.updated', preferences })] } });
  });

  const requestedIds: string[] = [];
  const suggestion = 'Which link did you mean?';
  let releaseReply = () => {};
  await page.route('**/api/buffers/*/reply-suggestion', async route => {
    expect(new URL(route.request().url()).pathname).toBe('/api/buffers/alice/reply-suggestion');
    const { messageId } = route.request().postDataJSON() as { messageId: string };
    requestedIds.push(messageId);
    if (messageId.startsWith('slow')) {
      await new Promise<void>(resolve => { releaseReply = resolve; });
    }
    await route.fulfill({ json: { suggestion } });
  });

  // Deliver a gateway change and a keypress within the same browser task.
  await page.addInitScript(() => {
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (new URL(this.url).pathname === '/ws') {
          window.addEventListener('test-gateway-message', event => {
            this.dispatchEvent(new MessageEvent('message', { data: (event as CustomEvent<string>).detail }));
          });
        }
      }
    };
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Pulsete');
  const openAlice = page.getByRole('button', { name: /^Open alice\b/ });
  const openBob = page.getByRole('button', { name: /^Open bob\b/ });
  await openAlice.click();
  await expect(page.getByText(historyMarker.body, { exact: true })).toBeVisible();
  const composer = page.getByRole('textbox', { name: 'Message', exact: true });
  const ghost = page.getByText(suggestion, { exact: true });
  await composer.click();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue('');
  await composer.screenshot({ path: testInfo.outputPath('empty-composer.png') });

  incoming(alice, 'disabled');
  await expect(page.getByText('disabled', { exact: true })).toBeVisible();
  const preferences = page.getByRole('dialog', { name: 'Preferences' });
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await preferences.getByRole('tab', { name: 'AI assistant' }).click();
  const toggle = preferences.getByRole('checkbox', { name: 'Suggest replies in direct messages' });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toHaveAccessibleDescription(/sends up to eight recent messages.*OpenAI/i);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await preferences.getByRole('button', { name: 'Close', exact: true }).last().click();
  await composer.click();

  return { network, alice, bob, channel, composer, ghost, openAlice, openBob, incoming, patch, socket,
    requestedIds, suggestion, outbound, errors, releaseReply: () => releaseReply() };
}

test('a live direct message can suggest an editable reply in the desktop composer', async ({ page }, testInfo) => {
  const { alice, bob, channel, composer, ghost, openAlice, openBob, incoming, patch, socket,
    requestedIds, suggestion, outbound, errors, releaseReply } = await openTestConversation(page, testInfo);

  incoming(bob, 'background');
  incoming(alice, 'history', { delivery: 'server-history' }, false);
  incoming(alice, 'self', { self: true }, false);
  incoming(alice, 'muted', {}, false);
  await page.getByRole('button', { name: /^Open #help\b/ }).click();
  incoming(channel, 'channel');
  await openAlice.click();
  await expect(composer).toBeFocused();
  incoming(alice, 'first in burst');
  incoming(alice, 'newest');
  await expect(ghost).toBeVisible();
  expect(requestedIds).toEqual(['newest']);
  await expect(composer).toHaveValue('');
  await expect(composer).toHaveAccessibleDescription(/press Tab to accept or Escape to dismiss/i);
  await composer.locator('..').screenshot({ path: testInfo.outputPath('suggested-reply.png') });

  await composer.press('Escape');
  await expect(ghost).toBeHidden();
  await expect(composer).toHaveValue('');
  incoming(alice, 'answered elsewhere');
  await expect(ghost).toBeVisible();
  incoming(alice, 'my reply from another client', { self: true }, false);
  await expect(ghost).toBeHidden();
  await composer.press('Tab');
  await expect(composer).toHaveValue('');
  incoming(alice, 'question before action');
  await expect(ghost).toBeVisible();
  incoming(alice, 'finds the answer', { kind: 'action' });
  await expect(ghost).toBeHidden();
  incoming(alice, 'question before notice');
  await expect(ghost).toBeVisible();
  incoming(alice, 'Never mind.', { kind: 'notice' });
  await expect(ghost).toBeHidden();
  await composer.press('Tab');
  await expect(composer).toHaveValue('');
  incoming(alice, 'earlier private detail', { nick: 'earlier-peer' });
  incoming(alice, 'question before mute');
  await expect(ghost).toBeVisible();
  socket.send(JSON.stringify(patch({ type: 'muted-nick.upsert', mutedNick: {
    id: 'mute-alice', networkId: alice.networkId, nick: 'earlier-peer',
  } })));
  await expect(ghost).toBeHidden();
  await composer.press('Tab');
  await expect(composer).toHaveValue('');
  socket.send(JSON.stringify(patch({ type: 'muted-nick.remove', mutedNickId: 'mute-alice' })));
  incoming(alice, 'earlier outgoing line', { self: true }, false);
  incoming(alice, 'remaining question');
  await expect(ghost).toBeVisible();
  socket.send(JSON.stringify(patch({ type: 'message.remove', networkId: alice.networkId,
    target: alice.target, messageIds: ['earlier outgoing line'] })));
  await expect(ghost).toBeHidden();
  await composer.press('Tab');
  await expect(composer).toHaveValue('');
  incoming(alice, 'accept this');
  await expect(ghost).toBeVisible();
  await composer.press('Tab');
  await expect(composer).toHaveValue(suggestion);
  await expect(composer).toBeFocused();
  expect(await composer.evaluate(input => (input as HTMLInputElement).selectionStart)).toBe(suggestion.length);
  await expect(ghost).toBeHidden();
  await composer.screenshot({ path: testInfo.outputPath('accepted-draft.png') });
  expect(outbound.map(message => JSON.parse(message).type)).not.toContain('message.send');

  await composer.fill('al');
  await composer.press('Tab');
  await expect(composer).toHaveValue(/^alice/);
  await composer.fill('/joi');
  await composer.press('Tab');
  await expect(composer).toHaveValue(/^\/join/);
  await composer.fill('');
  incoming(alice, 'slow before typing');
  await expect.poll(() => requestedIds.at(-1)).toBe('slow before typing');
  await composer.fill('My own reply');
  releaseReply();
  await expect(ghost).toBeHidden();
  await expect(composer).toHaveValue('My own reply');

  await composer.fill('');
  incoming(alice, 'slow before switching');
  await expect.poll(() => requestedIds.at(-1)).toBe('slow before switching');
  await openBob.click();
  releaseReply();
  await expect(ghost).toBeHidden();
  await expect(composer).toHaveValue('');
  await openAlice.click();
  await expect(ghost).toBeHidden();

  const deleteHistory = async () => {
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete history', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete PM history?' });
    await dialog.getByRole('button', { name: 'Delete history' }).click();
    await expect(dialog).toBeHidden();
  };

  incoming(alice, 'delete after suggestion');
  await expect(ghost).toBeVisible();
  await deleteHistory();
  await expect(page.getByText('delete after suggestion', { exact: true })).toBeHidden();
  await expect(ghost).toBeHidden();
  await composer.press('Tab');
  await expect(composer).toHaveValue('');

  incoming(alice, 'slow before deletion');
  await expect.poll(() => requestedIds.at(-1)).toBe('slow before deletion');
  const cancelled = page.waitForEvent('requestfailed', request =>
    request.url().endsWith('/reply-suggestion') && request.postDataJSON()?.messageId === 'slow before deletion');
  await deleteHistory();
  await cancelled;
  releaseReply();
  await expect(ghost).toBeHidden();
  await expect(composer).toHaveValue('');

  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  // Virtuoso reports this diagnostic when the transcript's rows are cleared.
  expect(errors.filter(error => error !== 'Failed binary finding record in array - , searched for -2')).toEqual([]);
});

for (const change of ['mute', 'delete', 'message', 'switch'] as const) {
  test(`a ${change} cannot leave a reply acceptable at any stage`, async ({ page }, testInfo) => {
    const { alice, composer, ghost, incoming, patch, openAlice, openBob, requestedIds, releaseReply } =
      await openTestConversation(page, testInfo);
    for (const stage of ['debounce', 'pending', 'visible'] as const) {
      const id = stage === 'pending' ? 'slow question' : stage;
      const earlier = 'earlier-' + stage;
      incoming(alice, earlier, { self: true, nick: 'other' }, false);
      incoming(alice, id);
      await expect(page.getByText(id, { exact: true })).toBeVisible();
      if (stage === 'pending') await expect.poll(() => requestedIds.includes(id)).toBe(true);
      if (stage === 'visible') await expect(ghost).toBeVisible();
      const message = change === 'mute'
        ? patch({ type: 'muted-nick.upsert', mutedNick: { id: earlier, networkId: alice.networkId, nick: 'other' } })
        : change === 'delete'
          ? patch({ type: 'message.remove', networkId: alice.networkId, bufferId: alice.id, target: alice.target, messageIds: [earlier] })
          : change === 'message'
            ? patch({ type: 'message.append', message: { id: 'notice-' + stage, bufferId: alice.id, networkId: alice.networkId,
                target: alice.target, nick: alice.target, body: 'Never mind', kind: 'notice', self: false, ts: Date.now() } })
            : null;
      const aborted = stage === 'pending' ? page.waitForEvent('requestfailed', req =>
        req.url().endsWith('/reply-suggestion') && req.postDataJSON().messageId === id) : null;
      const switchButton = await openBob.elementHandle();
      await composer.evaluate((input, args) => {
        if (args.message) window.dispatchEvent(new CustomEvent('test-gateway-message', { detail: JSON.stringify(args.message) }));
        else (args.switchButton as HTMLButtonElement).click();
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      }, { message, switchButton });
      if (aborted) { await aborted; releaseReply(); }
      if (change === 'switch') await openAlice.click();
      await expect(ghost).toBeHidden();
      await expect(composer).toHaveValue('');
      if (stage === 'debounce') {
        await page.waitForTimeout(550);
        expect(requestedIds).not.toContain(id);
      }
    }
  });
}

import { expect, test } from '@playwright/test';
import type { AiAssistantProviderStatus, AiAssistantRequest } from '../../shared/protocol-ai.js';

const status: AiAssistantProviderStatus = { connected: true, detail: 'Connected', provider: 'codex-openai-login', model: 'test',
  availableModels: [{ id: 'test', label: 'Test model', defaultReasoningEffort: 'low', reasoningEfforts: ['low'] }],
  modelsError: null, reasoningEffort: 'low', selectionNotice: null };

test('chat consent stays with the question and conversation, and follow-ups keep separate tokens', async ({ page }, testInfo) => {
  const generalToken = '419964d7-9b5b-455c-9828-c82346147366';
  const chatToken = '4f0f04c8-b31c-4581-ac55-91d6058ae123';
  const requests: AiAssistantRequest[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      if (!response.headers.has('test-chat-progress')) return response;
      const result = await response.json();
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode('{"type":"progress","stage":"using-chat"}\n'));
        window.addEventListener('finish-chat-response', () => {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'result', response: result }) + '\n'));
          controller.close();
        }, { once: true });
      } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
    };
  });
  await page.route('**/api/assistant/status', route => route.fulfill({ json: status }));
  await page.route('**/api/buffers/*/assistant', route => {
    if (route.request().method() === 'DELETE') return route.fulfill({ json: {} });
    const request = route.request().postDataJSON() as AiAssistantRequest;
    requests.push(request);
    const context = { buffer: { id: 'buffer-1', networkId: 'network', kind: 'query', target: 'Reading group' }, messages: [] };
    const response = { status, mode: request.mode, context };
    if (!request.scope && request.prompt.startsWith('What did she')) {
      return route.fulfill({ json: { ...response, needsChatConfirmation: true, answer: 'Should I use the current IRC chat for this question?' } });
    }
    if (request.scope === 'auto') return route.fulfill({ headers: { 'test-chat-progress': '1' }, json: {
      ...response, usedChat: true, continuationToken: chatToken, answer: 'The chat-backed answer.',
    } });
    return route.fulfill({ json: { ...response, usedChat: false, continuationToken: generalToken,
      generalContextExpired: request.scope === 'none' ? true : undefined,
      answer: request.prompt.startsWith('What did she') ? 'I need more detail.' : 'A general answer.' } });
  });

  await page.goto('/e2e/assistant-sources/index.html?lookup&privacy');
  await expect(page).toHaveTitle('Assistant sources regression fixture');
  const assistantTab = page.getByRole('tab', { name: 'Assistant' });
  await assistantTab.click();
  const input = page.getByRole('textbox', { name: 'Message assistant' });
  async function submit(question: string) { await input.fill(question); await input.press('Enter'); }
  await submit('What is the capital of Canada?');
  await expect(page.getByText('A general answer.', { exact: true })).toBeVisible();
  const longQuestion = `What did she say? ${'This is a long clarification. '.repeat(105).trim()}`;
  await submit(longQuestion);
  const approve = page.getByRole('button', { name: 'Use this chat' });
  const decline = page.getByRole('button', { name: 'Answer without chat' });
  const preview = page.getByRole('region', { name: 'Question awaiting chat access' });
  await expect(approve).toBeInViewport({ ratio: 1 });
  await expect(decline).toBeInViewport({ ratio: 1 });
  await expect(input).toBeInViewport({ ratio: 1 });
  await preview.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.locator('main').screenshot({ path: testInfo.outputPath('chat-access-confirmation.png') });
  await page.getByRole('button', { name: 'Switch conversation' }).click();
  await assistantTab.click();
  await expect(page.getByRole('heading', { name: 'Other chat' })).toBeVisible();
  await expect(approve).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch conversation' }).click();
  await assistantTab.click();
  await approve.click();
  await expect(page.getByText('Using this chat', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('finish-chat-response')));
  await expect(page.getByText('The chat-backed answer.', { exact: true })).toBeVisible();
  expect(requests[2]).toMatchObject({ prompt: longQuestion, scope: 'auto', generalContinuationToken: generalToken });

  await submit('What did she say afterward?');
  await decline.click();
  await expect(page.getByText('I need more detail.', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'The earlier Assistant context expired.' })).toBeVisible();
  expect(requests[4]).toMatchObject({ prompt: 'What did she say afterward?', scope: 'none', assistantTurns: [],
    continuationToken: chatToken, generalContinuationToken: generalToken });

  const newChat = page.getByRole('button', { name: 'New assistant chat' });
  for (const shortcut of ['Catch me up', 'Help me reply']) {
    await newChat.click();
    await page.getByRole('button', { name: shortcut }).click();
    await expect(page.getByText('Using this chat', { exact: true })).toBeVisible();
    expect(requests.at(-1)?.scope).toBe('auto');
    await page.evaluate(() => window.dispatchEvent(new Event('finish-chat-response')));
    await expect(page.getByText('The chat-backed answer.', { exact: true })).toBeVisible();
  }
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a public clarification can be answered with only the subject', async ({ page }, testInfo) => {
  const token = '5e2abc46-2170-492d-90c7-f436c0ab866a';
  const requests: AiAssistantRequest[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await page.route('**/api/assistant/status', route => route.fulfill({ json: status }));
  await page.route('**/api/buffers/buffer-1/assistant', route => {
    const request = route.request().postDataJSON() as AiAssistantRequest;
    requests.push(request);
    const context = { buffer: { id: 'buffer-1', networkId: 'network', kind: 'query', target: 'Reading group' }, messages: [] };
    return route.fulfill({ json: { status, mode: 'answer', usedChat: false, context, continuationToken: token,
      answer: requests.length === 1 ? 'Who or what should I look up?' : 'Marie Curie was born on November 7, 1867.',
    } });
  });

  await page.goto('/e2e/assistant-sources/index.html?lookup');
  await expect(page).toHaveTitle('Assistant sources regression fixture');
  await page.getByRole('tab', { name: 'Assistant' }).click();
  const input = page.getByRole('textbox', { name: 'Message assistant' });
  await input.fill('When was she born?');
  await input.press('Enter');
  await expect(page.getByText('Who or what should I look up?')).toBeVisible();
  await input.fill('Marie Curie');
  await input.press('Enter');
  await expect(page.getByText('Marie Curie was born on November 7, 1867.')).toBeVisible();
  expect(requests[1]).toMatchObject({ prompt: 'Marie Curie', generalContinuationToken: token });
  expect(requests[1]?.scope).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Use this chat' })).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.locator('main').screenshot({ path: testInfo.outputPath('public-clarification.png') });
});

import { expect, test } from '@playwright/test';
import type { AiAssistantProviderStatus, AiAssistantRequest } from '../../shared/protocol-ai.js';

for (const outcome of ['success', 'missing', 'error'] as const) {
  test(`a cited excerpt remains available with ${outcome} navigation`, async ({ page }) => {
    await page.goto('/e2e/assistant-sources/index.html');
    await expect(page).toHaveTitle('Assistant sources regression fixture');
    await page.getByLabel('Navigation result').selectOption(outcome);
    const details = page.locator('details').nth(1);
    await details.locator('summary').click();
    await expect(details.getByText('Saved excerpt 2', { exact: true })).toBeVisible();
    await expect(page.locator('details').first()).not.toHaveAttribute('open', '');
    await details.getByRole('button', { name: 'Open message' }).click();
    await expect(page.getByRole('status', { name: 'Navigation calls' })).toHaveText('["buffer-2/message-2"]');
    if (outcome === 'success') {
      await expect(details.getByRole('status')).toHaveCount(0);
    } else {
      await expect(details.getByRole('status')).toHaveText('The original message is unavailable.');
      await page.getByLabel('Navigation result').selectOption('success');
      await details.getByRole('button', { name: 'Open message' }).click();
      await expect(details.getByRole('status')).toHaveCount(0);
    }
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  });
}

test('the desktop assistant follows a conversation with a model picker and automatic context', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  const status: AiAssistantProviderStatus = {
    connected: true, detail: 'Connected', provider: 'codex-openai-login', model: 'test',
    availableModels: [
      { id: 'test', label: 'Test model', defaultReasoningEffort: 'low', reasoningEfforts: ['low'] },
      { id: 'other', label: 'Other model', defaultReasoningEffort: 'medium', reasoningEfforts: ['medium', 'high'] },
    ],
    modelsError: null, reasoningEffort: 'low', selectionNotice: null,
  };
  const buffer = { id: 'buffer-1', networkId: 'network', kind: 'query', target: 'Reading group' };
  const sources = ['Marie Curie is my role model.', 'An unrelated message.'].map((body, index) => ({
    label: 'S' + (index + 1),
    message: { ...buffer, id: 'example-' + index, bufferId: buffer.id, ts: 1700000000000,
      kind: 'line', nick: 'reader', self: false, body },
  }));
  const webSources = [{ label: 'W1', title: 'Biography', url: 'https://example.test/curie' }];
  const requests: AiAssistantRequest[] = [];
  await page.route('**/api/assistant/status', route => route.fulfill({ json: status }));
  await page.route('**/api/buffers/buffer-1/assistant', route => {
    const request = route.request().postDataJSON() as AiAssistantRequest;
    requests.push(request);
    const replies = [
      { answer: 'She said Marie Curie was her role model. [S1]', mode: 'answer' },
      { answer: 'Marie Curie pioneered research on radioactivity and won Nobel Prizes in physics and chemistry. [W1]', mode: 'answer' },
      { answer: 'I’d love to hear how you first learned about her!', mode: 'suggest-reply' },
    ];
    return route.fulfill({ json: { status, ...replies[requests.length - 1],
      context: { buffer, messages: [], sources, webSources: requests.length === 2 ? webSources : undefined },
    } });
  });

  await page.goto('/e2e/assistant-sources/index.html?lookup');
  await expect(page).toHaveTitle('Assistant sources regression fixture');
  await expect(page).toHaveURL(/\/e2e\/assistant-sources\/index\.html\?lookup$/);
  await page.getByRole('tab', { name: 'Assistant' }).click();
  const picker = page.getByRole('button', { name: /^Choose assistant model/ });
  const modelSettings = page.getByRole('dialog', { name: 'Assistant model settings' });
  const input = page.getByRole('textbox', { name: 'Message assistant' });
  await expect(input).toHaveAttribute('placeholder', 'Ask anything…');
  await expect(page.getByRole('heading', { name: 'How can I help?' })).toBeVisible();
  await expect(picker).toHaveText('Test model · Low');
  await expect(page.getByRole('button', { name: 'Assistant settings' })).toHaveCount(0);
  await page.locator('main').screenshot({ path: '/tmp/pulsete-assistant-empty.png' });

  await input.fill('Who was her role model?');
  await input.press('Enter');
  const source = page.getByText('Source', { exact: true });
  await source.click();
  await expect(page.getByText('Marie Curie is my role model.', { exact: true })).toBeVisible();
  await expect(page.getByText('An unrelated message.', { exact: true })).toHaveCount(0);
  await source.click();

  await picker.click();
  await expect(modelSettings).toBeVisible();
  await modelSettings.getByRole('combobox', { name: 'Model', exact: true }).click();
  await page.getByRole('option', { name: 'Other model' }).click();
  await expect(picker).toHaveText('Other model · Medium');
  await modelSettings.getByRole('combobox', { name: 'Reasoning' }).click();
  await page.getByRole('option', { name: 'High' }).click();
  await expect(picker).toHaveText('Other model · High');
  await page.locator('main').screenshot({ path: '/tmp/pulsete-assistant-model-picker.png' });
  await page.keyboard.press('Escape');
  await expect(modelSettings).toBeHidden();
  await expect(picker).toBeFocused();

  await input.fill('What is she known for?');
  await input.press('Enter');
  await expect(page.getByRole('link', { name: 'Web source' })).toHaveAttribute('href', webSources[0].url);
  await expect(page.getByText(/\[S1\]|\[W1\]|Incomplete history/)).toHaveCount(0);
  await page.locator('main').screenshot({ path: '/tmp/pulsete-assistant-conversation.png' });

  await input.fill('Help me write a reply.');
  await input.press('Enter');
  await page.getByRole('button', { name: 'Use draft' }).click();
  await expect(page.getByRole('status', { name: 'IRC draft' })).toHaveText('I’d love to hear how you first learned about her!');
  expect(requests[1].selection).toEqual({ model: 'other', reasoningEffort: 'high' });
  for (const request of requests) {
    expect(request).not.toHaveProperty('scope');
    expect(request).not.toHaveProperty('webLookup');
  }
  expect(requests[1].assistantTurns.map(({ text }) => text)).toEqual(['Who was her role model?', 'She said Marie Curie was her role model.']);

  await page.getByRole('button', { name: 'New assistant chat' }).click();
  await expect(page.getByRole('heading', { name: 'How can I help?' })).toBeVisible();
  await expect(picker).toHaveText('Other model · High');
  await page.getByRole('button', { name: 'Expand assistant' }).click();
  await expect(page.getByRole('button', { name: 'Reduce assistant width' })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const showMedia of [true, false]) {
  test(`the desktop assistant shows grounded media cards with previews ${showMedia ? 'enabled' : 'disabled'}`, async ({ page }) => {
    const portrait = 'https://example.test/portrait';
    const clip = 'https://example.test/clip.mp4';
    const article = 'https://example.test/article';
    const status: AiAssistantProviderStatus = {
      connected: true, detail: 'Connected', provider: 'codex-openai-login', model: 'test',
      availableModels: [], modelsError: null, reasoningEffort: 'low', selectionNotice: null,
    };
    const previewRequests: string[] = [];
    await page.route('**/api/assistant/status', route => route.fulfill({ json: status }));
    await page.route('**/api/buffers/buffer-1/assistant', route => route.fulfill({ json: {
      status, answer: 'Here’s the portrait and a short documentary.', mode: 'answer',
      context: {
        buffer: { id: 'buffer-1', kind: 'query', networkId: 'network', target: 'Reading group' },
        messages: [],
        attachments: [
          { kind: 'image', title: 'Portrait from the archive', url: portrait, source: 'W1' },
          { kind: 'video', title: 'Short documentary', url: clip, source: 'W2' },
          { kind: 'link', title: 'Read the biography', url: article, source: 'W3' },
        ],
      },
    } }));
    await page.route('**/api/media/page-preview', route => {
      const { url } = route.request().postDataJSON() as { url: string };
      previewRequests.push(url);
      return route.fulfill({ json: { preview: url === portrait
        ? { title: 'Portrait', pageUrl: portrait, imageUrl: 'https://example.test/image.png' }
        : null, unavailableReason: null } });
    });
    await page.route('**/api/media/resource?*', route => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#315975"/></svg>',
    }));

    await page.goto('/e2e/assistant-sources/index.html?lookup' + (showMedia ? '' : '&hide-media'));
    await page.getByRole('tab', { name: 'Assistant' }).click();
    const input = page.getByRole('textbox', { name: 'Message assistant' });
    await input.fill('Show me a picture and a documentary.');
    await input.press('Enter');

    const cards = page.getByRole('list', { name: 'Reply media' });
    await expect(cards.getByRole('link', { name: /Read the biography/ })).toHaveAttribute('href', article);
    const picture = cards.getByRole('button', { name: 'Enlarge Portrait from the archive' });
    const video = cards.locator('video');
    if (showMedia) {
      await expect.poll(() => picture.getByRole('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(240);
      await expect(video).toHaveAttribute('controls', '');
      await expect(video).toHaveAttribute('preload', 'none');
      await expect(video).not.toHaveAttribute('autoplay', '');
      await page.locator('main').screenshot({ path: '/tmp/pulsete-assistant-media.png' });
      await picture.click();
      const dialog = page.getByRole('dialog', { name: 'Portrait from the archive' });
      await expect(dialog.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', portrait);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(picture).toBeFocused();
      expect(previewRequests.sort()).toEqual([article, portrait].sort());
    } else {
      await expect(picture).toHaveCount(0);
      await expect(video).toHaveCount(0);
      await expect(cards.getByRole('link', { name: /Portrait from the archive/ })).toHaveAttribute('href', portrait);
      expect(previewRequests).toEqual([]);
    }
  });
}

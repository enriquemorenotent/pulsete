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

test('the desktop assistant follows a conversation with optional sources and lookup settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  const status: AiAssistantProviderStatus = {
    connected: true, detail: 'Connected', provider: 'codex-openai-login', model: 'test',
    availableModels: [{ id: 'test', label: 'Test model', defaultReasoningEffort: 'low', reasoningEfforts: ['low'] }],
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
      context: { buffer, messages: [], sources, webSources: request.webLookup ? webSources : undefined },
    } });
  });

  await page.goto('/e2e/assistant-sources/index.html?lookup');
  await expect(page).toHaveTitle('Assistant sources regression fixture');
  await expect(page).toHaveURL(/\/e2e\/assistant-sources\/index\.html\?lookup$/);
  await page.getByRole('tab', { name: 'Assistant' }).click();
  const settings = page.getByRole('button', { name: 'Assistant settings' });
  const lookup = page.getByRole('checkbox', { name: 'Web lookup' });
  const recentOnly = page.getByRole('checkbox', { name: 'Limit to recent chat' });
  const input = page.getByRole('textbox', { name: 'Message assistant' });
  await expect(input).toHaveAttribute('placeholder', 'Ask anything…');
  await expect(page.getByRole('heading', { name: 'How can I help?' })).toBeVisible();
  await expect(lookup).toHaveCount(0);
  await page.locator('main').screenshot({ path: '/tmp/pulsete-assistant-empty.png' });

  await input.fill('Who was her role model?');
  await input.press('Enter');
  const source = page.getByText('Source', { exact: true });
  await source.click();
  await expect(page.getByText('Marie Curie is my role model.', { exact: true })).toBeVisible();
  await expect(page.getByText('An unrelated message.', { exact: true })).toHaveCount(0);
  await source.click();

  await settings.click();
  await expect(lookup).not.toBeChecked();
  await expect(recentOnly).not.toBeChecked();
  await lookup.click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(settings).toBeFocused();
  await input.fill('What is she known for?');
  await input.press('Enter');
  await expect(page.getByRole('link', { name: 'Web source' })).toHaveAttribute('href', webSources[0].url);
  await expect(page.getByText(/\[S1\]|\[W1\]|Incomplete history/)).toHaveCount(0);
  await page.locator('main').screenshot({ path: '/tmp/pulsete-assistant-conversation.png' });

  await settings.click();
  await recentOnly.click();
  await page.getByRole('button', { name: 'Done' }).click();
  await input.fill('Help me write a reply.');
  await input.press('Enter');
  await page.getByRole('button', { name: 'Use draft' }).click();
  await expect(page.getByRole('status', { name: 'IRC draft' })).toHaveText('I’d love to hear how you first learned about her!');
  expect(requests.map(({ scope, webLookup }) => [scope, webLookup])).toEqual([['auto', false], ['auto', true], ['recent', true]]);
  expect(requests[1].assistantTurns.map(({ text }) => text)).toEqual(['Who was her role model?', 'She said Marie Curie was her role model.']);

  await page.getByRole('button', { name: 'New assistant chat' }).click();
  await expect(page.getByRole('heading', { name: 'How can I help?' })).toBeVisible();
  await settings.click();
  await expect(lookup).not.toBeChecked();
  await expect(recentOnly).toBeChecked();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Expand assistant' }).click();
  await expect(page.getByRole('button', { name: 'Reduce assistant width' })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';
import type { AiAssistantProviderStatus, AiAssistantRequest } from '../../shared/protocol-ai.js';

for (const entryPoint of ['citation', 'button'] as const) {
  for (const outcome of ['success', 'missing', 'error'] as const) {
    test(`${entryPoint} opens its own source with ${outcome} navigation`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto('/e2e/assistant-sources/index.html');
      await expect(page).toHaveTitle('Assistant sources regression fixture');
      await page.getByLabel('Navigation result').selectOption(outcome);
      const details = page.locator('details').nth(1);
      if (entryPoint === 'citation') {
        await page.getByRole('link', { name: '[S1]', exact: true }).nth(1).click();
      } else {
        await details.locator('summary').click();
        await details.getByRole('button', { name: 'Open message' }).click();
      }
      await expect(details).toHaveAttribute('open', '');
      await expect(details.getByText('Saved excerpt 2', { exact: true })).toBeVisible();
      await expect(page.getByRole('status', { name: 'Navigation calls' })).toHaveText('["buffer-2/message-2"]');
      await expect(page.locator('details').first()).not.toHaveAttribute('open', '');
      if (outcome === 'success') {
        await expect(page.getByRole('alert')).toHaveCount(0);
      } else {
        await expect(details.getByRole('alert')).toContainText('original message is unavailable');
        await page.getByLabel('Navigation result').selectOption('success');
        await details.getByRole('button', { name: 'Open message' }).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      await details.locator('summary').click();
      await expect(details).not.toHaveAttribute('open', '');
      await page.getByRole('link', { name: '[S1]', exact: true }).nth(1).click();
      await expect(details).toHaveAttribute('open', '');
      await expect(page.locator('a[href$="-S9"]')).toHaveCount(0);
      expect(new URL(page.url()).hash).toBe('');
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
      if (entryPoint === 'citation' && outcome === 'success') {
        await page.screenshot({ path: '/tmp/pulsete-assistant-sources.png' });
      }
    });
  }
}

test('desktop assistant opts into public lookup independently of chat history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  const status: AiAssistantProviderStatus = {
    connected: true, detail: 'Connected', provider: 'codex-openai-login', model: 'test',
    availableModels: [{ id: 'test', label: 'Test model', defaultReasoningEffort: 'low', reasoningEfforts: ['low'] }],
    modelsError: null, reasoningEffort: 'low', selectionNotice: null,
  };
  const buffer = { id: 'buffer-1', networkId: 'network', kind: 'channel', target: '#test' };
  const sources = [{ label: 'S1', message: { ...buffer, id: 'example', bufferId: buffer.id,
    ts: 1700000000000, kind: 'line', nick: 'reader', self: false, body: 'Marie Curie is my role model.' } }];
  const webSources = [{ label: 'W1', title: 'Biography', url: 'https://example.test/curie' }];
  const requests: AiAssistantRequest[] = [];
  await page.route('**/api/assistant/status', route => route.fulfill({ json: status }));
  await page.route('**/api/buffers/buffer-1/assistant', route => {
    const request = route.request().postDataJSON() as AiAssistantRequest;
    requests.push(request);
    return route.fulfill({ json: { status, mode: 'answer',
      answer: request.webLookup ? 'Marie Curie [S1] was born on November 7, 1867 [W1].' : 'Marie Curie [S1].',
      context: { buffer, messages: [], sources, webSources: request.webLookup ? webSources : undefined },
    } });
  });
  await page.goto('/e2e/assistant-sources/index.html?lookup');
  await expect(page).toHaveTitle('Assistant sources regression fixture');
  await expect(page).toHaveURL(/\/e2e\/assistant-sources\/index\.html\?lookup$/);
  const lookup = page.getByRole('checkbox', { name: 'Web lookup' });
  const scope = page.getByLabel('Assistant context scope');
  const input = page.getByRole('textbox', { name: 'Message assistant' });
  await expect(lookup).not.toBeChecked();
  await scope.selectOption('saved');
  await input.fill('Who was her role model?');
  await input.press('Enter');
  await expect(page.getByRole('link', { name: '[S1]', exact: true })).toBeVisible();
  await lookup.click();
  await expect(lookup).toBeChecked();
  await expect(scope).toHaveValue('saved');
  await input.fill('When was she born?');
  await input.press('Enter');
  await expect(page.getByRole('link', { name: '[W1]', exact: true })).toHaveAttribute('href', webSources[0].url);
  await page.locator('details').last().locator('summary').click();
  await expect(page.getByRole('link', { name: '[W1] Biography' })).toBeVisible();
  expect(requests.map(({ webLookup, scope }) => [webLookup, scope])).toEqual([[false, 'saved'], [true, 'saved']]);
  expect(requests[1].assistantTurns.map(({ text }) => text)).toEqual(['Who was her role model?', 'Marie Curie [S1].']);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: '/tmp/pulsete-assistant-web.png' });
});

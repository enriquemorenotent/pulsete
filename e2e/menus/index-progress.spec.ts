import { expect, test } from '@playwright/test';
import type { AssistantIndexProgress } from '../../shared/protocol-ai.js';

test('the workspace header shows measured history progress independently of the assistant panel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  let progress: AssistantIndexProgress = { stage: 'idle' };
  await page.route('**/api/assistant/index-progress', route => route.fulfill({ json: progress }));
  await page.goto('/e2e/menus/index.html?index-progress');
  await expect(page).toHaveURL(/index-progress$/);
  await expect(page).toHaveTitle('Menu regression fixture');
  await expect(page.getByRole('heading', { name: 'Menu regression fixture' })).toBeVisible();
  const header = page.getByRole('navigation', { name: 'Workspace tools' });
  const history = header.getByRole('button', { name: 'Chat history' });
  await expect(history).toBeVisible();
  await expect(header.getByRole('status')).toBeEmpty();

  progress = { stage: 'downloading', receivedBytes: 64, totalBytes: 100 };
  await expect(header.getByRole('progressbar', { name: 'Downloading search model' })).toHaveAttribute('aria-valuetext', '64%');
  progress = { stage: 'preparing' };
  await expect(header.getByRole('status')).toHaveText('Preparing chat history…');
  await expect(header.getByRole('progressbar')).toHaveCount(0);
  progress = { stage: 'indexing', completed: 24, total: 80 };
  const bar = header.getByRole('progressbar', { name: 'Indexing chat history' });
  await expect(bar).toHaveAttribute('aria-valuetext', '24 of 80 sections');
  await expect(bar).toHaveAttribute('value', '24');
  await expect(bar).toHaveAttribute('max', '80');
  const [barBox, historyBox] = await Promise.all([bar.boundingBox(), history.boundingBox()]);
  expect(barBox!.x + barBox!.width).toBeLessThan(historyBox!.x);
  await page.screenshot({ path: '/tmp/pulsete-index-progress-desktop.png' });
  progress = { stage: 'indexing', completed: 40, total: 80 };
  await expect(bar).toHaveAttribute('value', '40');
  progress = { stage: 'paused' };
  await expect(header.getByRole('status')).toHaveText('History indexing paused');
  progress = { stage: 'updating' };
  await expect(header.getByRole('status')).toHaveText('Updating chat index…');
  progress = { stage: 'ready' };
  await expect(header.getByRole('status')).toHaveText('History search ready');
  progress = { stage: 'idle' };
  await expect(header.getByRole('status')).toBeEmpty();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

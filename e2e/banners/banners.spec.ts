import { expect, test, type Page } from '@playwright/test';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  await page.clock.install();
  await page.goto('/e2e/banners/index.html');
  await expect(page).toHaveTitle('Notification regression fixture');
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors.get(page)).toEqual([]);
});
const dismiss = (page: Page) => page.getByRole('button', { name: 'Dismiss notification' });

test('a normal notification with reconnection wording still expires', async ({ page }) => {
  await page.getByRole('button', { name: 'Timed notification' }).click();
  await expect(page.getByText('Reconnecting to gateway', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(dismiss(page)).toBeVisible();
  await page.clock.fastForward(4300);
  await expect(dismiss(page)).toHaveCount(0);
});

test('a persistent notification with different wording stays until reconnection', async ({ page }) => {
  await page.getByRole('button', { name: 'Persistent notification' }).click();
  await expect(page.getByText('Connection interrupted; trying again.', { exact: true })).toBeVisible();
  await page.clock.fastForward(10000);
  await expect(dismiss(page)).toBeVisible();
  await page.screenshot({ path: '/tmp/pulsete-persistent-notification.png' });
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(dismiss(page)).toHaveCount(0);
});

test('replacing a timed notification cancels its timer and manual dismissal still works', async ({ page }) => {
  await page.getByRole('button', { name: 'Timed notification' }).click();
  await expect(dismiss(page)).toBeVisible();
  await page.clock.fastForward(1000);
  await page.getByRole('button', { name: 'Persistent notification' }).click();
  await page.clock.fastForward(10000);
  await expect(dismiss(page)).toBeVisible();
  await dismiss(page).click();
  await expect(dismiss(page)).toHaveCount(0);
});

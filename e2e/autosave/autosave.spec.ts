import { expect, test, type Page } from '@playwright/test';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()); });
  await page.clock.install();
  await page.goto('/e2e/autosave/index.html');
  await expect(page).toHaveTitle('Autosave regression fixture');
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors.get(page)).toEqual([]);
});
const notes = (page: Page) => page.getByRole('textbox', { name: 'Notes', exact: true });
const requests = (page: Page) => page.getByTestId('request');

test('notes serialize writes, coalesce edits, and keep the latest text after an old failure', async ({ page }) => {
  await notes(page).fill('old');
  await page.clock.fastForward(650);
  await expect(requests(page)).toHaveCount(1);
  await notes(page).fill('middle');
  await page.clock.fastForward(650);
  await notes(page).fill('latest');
  await page.clock.fastForward(650);
  await expect(requests(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Fail', exact: true }).click();
  await expect(requests(page)).toHaveCount(1);
  await expect(requests(page)).toContainText('latest');
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(requests(page)).toHaveCount(0);
  await expect(notes(page)).toHaveValue('latest');
  await expect(page.getByTestId('saved')).toHaveText('{"buffer:a":"latest"}');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/pulsete-autosave.png' });
});

test('scope changes flush the old editor with its own callback and retain pending text on return', async ({ page }) => {
  await notes(page).fill('conversation notes');
  await page.getByRole('button', { name: 'Server', exact: true }).click();
  await expect(notes(page)).toHaveValue('');
  await expect(requests(page)).toContainText('buffer:a: "conversation notes"');
  await notes(page).fill('server notes');
  await page.clock.fastForward(650);
  await expect(requests(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await expect(notes(page)).toHaveValue('conversation notes');
  await requests(page).filter({ hasText: 'network:a' }).getByRole('button', { name: 'Complete' }).click();
  await expect(notes(page)).toHaveValue('conversation notes');
  await requests(page).getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByTestId('saved')).toContainText('"network:a":"server notes"');
  await expect(page.getByTestId('saved')).toContainText('"buffer:a":"conversation notes"');
});

test('unmount and reopen preserve write ordering, including clearing notes', async ({ page }) => {
  await notes(page).fill('old');
  await page.clock.fastForward(650);
  await notes(page).fill('pending');
  await page.getByRole('button', { name: 'Toggle editor' }).click();
  await page.getByRole('button', { name: 'Toggle editor' }).click();
  await expect(notes(page)).toHaveValue('pending');
  await notes(page).fill('');
  await page.clock.fastForward(650);
  await expect(requests(page)).toHaveCount(1);
  await requests(page).getByRole('button', { name: 'Complete' }).click();
  await expect(requests(page)).toHaveCount(1);
  await expect(requests(page)).toContainText('buffer:a: ""');
  await expect(notes(page)).toHaveValue('');
  await requests(page).getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByTestId('saved')).toHaveText('{"buffer:a":""}');
});

test('failed notes stay editable and a new edit saves without an automatic retry', async ({ page }) => {
  await notes(page).fill('failed');
  await page.clock.fastForward(650);
  await page.getByRole('button', { name: 'Fail', exact: true }).click();
  await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
  await page.clock.fastForward(5000);
  await expect(requests(page)).toHaveCount(0);
  await notes(page).fill('fixed');
  await page.clock.fastForward(650);
  await expect(requests(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

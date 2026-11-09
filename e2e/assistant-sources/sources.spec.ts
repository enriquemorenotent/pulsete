import { expect, test } from '@playwright/test';

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

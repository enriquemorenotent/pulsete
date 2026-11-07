import { expect, test } from '@playwright/test';

const href = 'https://example.test/picture.png';
for (const surface of ['Account picture', 'User avatar', 'DM profile picture', 'Message image']) {
  test(`${surface} uses the shared viewer and closes cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/api/media/resource?*', async route => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get('networkId')).toBe('preview-test');
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#284a68"/><circle cx="450" cy="300" r="180" fill="#88c5ee"/></svg>' });
    });
    await page.goto('/e2e/media-preview/index.html');
    await expect(page).toHaveTitle('Media preview regression fixture');
    const trigger = page.getByRole('region', { name: surface, exact: true }).getByRole('button');
    await trigger.click();
    if (surface === 'Account picture') {
      await page.getByRole('menuitem', { name: 'View profile picture', exact: true }).click();
    }
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img')).toBeVisible();
    await expect.poll(() => dialog.getByRole('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(900);
    await expect(dialog.getByRole('link', { name: 'Open original' })).toHaveAttribute('href', href);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    if (surface === 'Account picture') await expect(trigger).toBeFocused();
    await trigger.click();
    if (surface === 'Account picture') await page.getByRole('menuitem', { name: 'View profile picture', exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.locator('[data-state="open"].fixed.inset-0').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Account actions for No picture', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'View profile picture', exact: true })).toHaveCount(0);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

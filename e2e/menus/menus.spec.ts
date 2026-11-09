import { expect, test, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()); });
  await page.goto('/e2e/menus/index.html');
  await expect(page).toHaveTitle('Menu regression fixture');
  await expect(page.getByRole('heading', { name: 'Menu regression fixture' })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors.get(page)).toEqual([]);
});
const noShortcuts = (page: Page) => expect(page.locator('output')).toContainText('jumps=0; palette=0;');

for (const label of ['More actions', 'Avatar options for Reader']) {
  test(`${label} owns shortcuts, closes on Escape and returns focus`, async ({ page }) => {
    const trigger = page.getByRole('button', { name: label, exact: true });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Control+k');
    const url = page.url();
    await page.keyboard.press('Alt+ArrowLeft');
    expect(page.url()).toBe(url);
    await noShortcuts(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await noShortcuts(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('output')).toContainText('jumps=1;');
    await page.keyboard.press('Control+k');
    await expect(page.locator('output')).toContainText('palette=1;');
  });
  test(`${label} dismisses on outside click`, async ({ page }) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.mouse.click(850, 450);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await noShortcuts(page);
  });
}

test('header menu supports arrow navigation and selection', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'More actions', exact: true });
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Second action' })).toBeFocused();
  await page.screenshot({ path: '/tmp/pulsete-shared-menu.png' });
  await page.keyboard.press('Enter');
  await expect(page.locator('output')).toContainText('action=Second action');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('Escape closes only the nested menu before its dialog', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open test dialog' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Test dialog' });
  await dialog.getByRole('button', { name: 'More actions' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'More actions' })).toBeFocused();
  await dialog.getByRole('textbox').fill('Editable');
  await page.keyboard.press('Control+k');
  await noShortcuts(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await noShortcuts(page);
});

test('emoji popover also keeps priority over workspace shortcuts', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Edit emoji tag for Reader' });
  await trigger.click();
  await page.keyboard.press('Control+k');
  await noShortcuts(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await noShortcuts(page);
});

test('avatar selection opens the file picker and crop dialog', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Avatar options for Reader' });
  await trigger.click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Set custom avatar' }).click();
  await (await chooser).setFiles({ name: 'avatar.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>') });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Crop Avatar' })).toBeVisible();
  await page.keyboard.press('Control+k');
  await noShortcuts(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await noShortcuts(page);
  await expect(trigger).toBeFocused();
});


test('invalid avatar files show an error in the reopened menu', async ({ page }) => {
  await page.getByRole('button', { name: 'Avatar options for Reader' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Set custom avatar' }).click();
  await (await chooser).setFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Choose an image file.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await noShortcuts(page);
});

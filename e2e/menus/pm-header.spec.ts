import { expect, test } from '@playwright/test';
import { emptySnapshot, makeBuffer, makeNetwork } from '../../tests/helpers/app-state-test-helpers.js';

test('PM toolbar groups contact and history controls and keeps primary actions visible', async ({ page }, testInfo) => {
  const network = makeNetwork({ workspaceOpen: true });
  const server = makeBuffer({ id: 'server' });
  const query = makeBuffer({ id: 'alice', kind: 'query', target: 'Alice' });
  const outbound: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.routeWebSocket('**/ws', ws => {
    ws.onMessage(message => outbound.push(String(message)));
    ws.send(JSON.stringify({
      type: 'state.ready',
      snapshot: {
        ...emptySnapshot(),
        networks: [network],
        buffers: [server, query],
        networkStates: { [network.id]: { phase: 'connected', nick: network.nick, serverName: 'Test IRC' } },
        sync: { epoch: 'pm-header', revision: 0 },
      },
    }));
  });
  await page.route('**/api/client-auth', route => route.fulfill({ status: 200 }));
  await page.route('**/api/buffers/*/history?*', route => route.fulfill({ json: { messages: [], hasMore: false } }));
  await page.route('**/api/buffers/*/pins', route => route.fulfill({ json: { messages: [] } }));
  await page.route('**/api/preferences', route => route.fulfill({ json: { messages: [] } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { connected: true } }));
  await page.route('**/api/assistant/index-progress', route => route.fulfill({ json: { stage: 'idle' } }));

  await page.goto('/');
  await expect(page).toHaveTitle('Pulsete');
  await page.getByRole('button', { name: /^Open Alice\b/ }).click();
  const media = page.getByRole('button', { name: 'Media', exact: true });
  const contact = page.getByRole('button', { name: 'Contact settings for Alice' });
  const search = page.getByRole('button', { name: 'Search history', exact: true });
  const more = page.getByRole('button', { name: 'More actions', exact: true });
  for (const control of [media, contact, search, more]) await expect(control).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close Alice', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete history', exact: true })).toHaveCount(0);

  await contact.click();
  const panel = page.getByRole('dialog', { name: 'Contact settings for Alice' });
  for (const label of ['Add Alice to watchlist', 'Enable notifications for Alice', 'Mute Alice']) {
    await expect(panel.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'false');
  }
  await panel.getByRole('button', { name: 'Edit emoji tag for Alice' }).click();
  await expect(page.getByRole('menu', { name: 'Emoji tags for Alice' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Avatar options for Alice' }).click();
  await expect(page.getByRole('menuitem', { name: 'Set custom avatar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pm-header-contact.png') });
  await panel.getByRole('button', { name: 'User details (WHOIS)' }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => outbound.some(message => message.includes('WHOIS Alice'))).toBe(true);

  await more.click();
  await expect(page.getByRole('menuitem', { name: 'Download history' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete history' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete PM history?' });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await search.click();
  await expect(page.getByRole('dialog', { name: 'Search history' })).toBeVisible();
  await page.keyboard.press('Escape');
  await media.click();
  await expect(page.getByRole('dialog', { name: 'Media shared with Alice' })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

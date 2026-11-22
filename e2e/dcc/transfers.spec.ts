import { expect, test, type WebSocketRoute } from '@playwright/test';
import type { DccTransfer } from '../../shared/dcc.js';
import { emptySnapshot, makeBuffer, makeNetwork } from '../../tests/helpers/app-state-test-helpers.js';

test('desktop DMs send DCC offers and the transfers panel tracks accepted files', async ({ page }, testInfo) => {
  const direct = makeNetwork({ name: 'Direct IRC', workspaceOpen: true });
  const routed = { ...makeNetwork({ id: 'routed', name: 'Routed IRC', workspaceOpen: true }), nordVpnLocation: 'amsterdam' };
  const alice = makeBuffer({ id: 'alice', target: 'alice', networkId: direct.id, kind: 'query' });
  const bob = makeBuffer({ id: 'bob', target: 'bob', networkId: routed.id, kind: 'query' });
  const servers = [direct, routed].map(network => makeBuffer({ id: `server-${network.id}`, networkId: network.id }));
  const networkStates = Object.fromEntries([direct, routed].map(network =>
    [network.id, { phase: 'connected', nick: network.nick, serverName: 'Test IRC' }]));
  const offer: DccTransfer = {
    id: '62985a07-b992-49c3-9d77-a41b291b7f27', networkId: direct.id, networkName: direct.name,
    peer: 'alice', filename: 'example file.txt', address: '8.8.8.8', port: 49321, size: 130,
    bytes: 0, direction: 'receive', status: 'offered',
  };
  let socket!: WebSocketRoute;
  let revision = 0;
  const sync = () => ({ epoch: 'dcc-test', revision });
  const update = (transfers: DccTransfer[]) => {
    revision++;
    socket.send(JSON.stringify({ type: 'dcc.updated', dcc: { enabled: true, transfers }, sync: sync() }));
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await page.routeWebSocket('**/ws', ws => {
    socket = ws;
    ws.send(JSON.stringify({
      type: 'state.ready', snapshot: {
        ...emptySnapshot(), networks: [direct, routed], networkStates, buffers: [...servers, alice, bob],
        dcc: { enabled: true, transfers: [] }, sync: sync(),
      },
    }));
  });
  await page.route('**/api/client-auth', route => route.fulfill({ status: 200 }));
  await page.route('**/api/buffers/*/history?*', route => route.fulfill({ json: { messages: [], hasMore: false } }));
  await page.route('**/api/buffers/*/pins', route => route.fulfill({ json: { messages: [] } }));
  await page.route('**/api/preferences', route => route.fulfill({ json: { messages: [] } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { connected: true } }));
  await page.route('**/api/assistant/index-progress', route => route.fulfill({ json: { stage: 'idle' } }));
  let sent: unknown;
  await page.route('**/api/dcc/send', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: {} });
  });
  let acceptAttempts = 0;
  await page.route(`**/api/dcc/${offer.id}/accept`, async route => {
    expect(route.request().method()).toBe('POST');
    acceptAttempts++;
    update([acceptAttempts === 1
      ? { ...offer, error: 'That file already exists. Choose a new filename.' }
      : { ...offer, status: 'transferring', bytes: 65 }]);
    await route.fulfill({ json: {} });
  });

  await page.goto('/');
  await expect(page).toHaveTitle('Pulsete');
  await page.getByRole('button', { name: 'Open Routed IRC', exact: true, pressed: false }).click();
  await page.getByRole('button', { name: /^Open bob\b/ }).click();
  const unavailable = page.getByRole('button', { name: 'Send file', exact: true });
  await expect(unavailable).toBeDisabled();
  await unavailable.focus();
  await expect(unavailable).toHaveAccessibleDescription(/DCC requires a direct connection/);
  await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Open Direct IRC', exact: true, pressed: false }).click();
  await page.getByRole('button', { name: /^Open alice\b/ }).click();
  await page.getByRole('button', { name: 'Send file', exact: true }).click();
  const sending = page.getByRole('dialog', { name: 'Send file to alice' });
  await expect(sending).toContainText('unencrypted');
  await sending.getByText('Manual router setup', { exact: true }).click();
  await sending.getByLabel('Advertised IP').fill('8.8.4.4');
  await sending.getByLabel('Port', { exact: true }).fill('49322');
  await sending.getByRole('button', { name: 'Choose file' }).click();
  await expect(sending).toHaveCount(0);
  expect(sent).toEqual({ bufferId: alice.id, advertisedAddress: '8.8.4.4', port: 49322 });

  const outgoing: DccTransfer = { ...offer, id: 'test-send', direction: 'send', bufferId: alice.id, status: 'waiting' };
  update([outgoing]);
  const viewTransfers = page.getByRole('button', { name: 'View file transfers', exact: true });
  await expect(page.getByText('Waiting for the recipient', { exact: true })).toBeVisible();
  update([{ ...outgoing, status: 'failed', error: 'The listening port is already in use.' }]);
  await expect(page.getByText('Failed', { exact: true })).toBeVisible();
  await viewTransfers.click();
  await expect(page.getByRole('dialog', { name: 'File transfers' })).toContainText('The listening port is already in use.');
  await page.getByRole('button', { name: 'Close file transfers' }).click();

  update([offer]);
  await page.getByRole('button', { name: /File transfers, 1 new offer/ }).click();
  const transfers = page.getByRole('dialog', { name: 'File transfers' });
  await expect(transfers).toContainText('From alice on Direct IRC · 130 B · 8.8.8.8:49321');
  await transfers.getByRole('button', { name: 'Accept' }).click();
  await expect(transfers.getByRole('alert')).toContainText('That file already exists.');
  await transfers.getByRole('button', { name: 'Choose another name' }).click();
  await expect(transfers.getByRole('alert')).toHaveCount(0);
  await expect(transfers.getByRole('progressbar')).toHaveAttribute('value', '65');
  await transfers.screenshot({ path: testInfo.outputPath('dcc-transfer-progress.png') });
  update([{ ...offer, status: 'completed', bytes: 130 }]);
  await expect(transfers.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { NordVpnSettings, nordAccountSetupUrl } from '../web/src/NordVpnSettings.js';
import { emptyNetworkForm } from '../web/src/network-form.js';

test('NordVPN setup opens the external account page without claiming authentication', () => {
  const markup = renderToStaticMarkup(<NordVpnSettings form={emptyNetworkForm()} onChange={() => {}} />);
  assert.ok(markup.includes(`href="${nordAccountSetupUrl}"`));
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
  assert.match(markup, /Connect to NordVPN/);
  assert.doesNotMatch(markup, /Credentials saved/);
});

test('saved NordVPN credentials do not require repeated entry', () => {
  const markup = renderToStaticMarkup(<NordVpnSettings form={{ ...emptyNetworkForm(), hasNordVpnCredentials: true, nordVpnLocation: 'amsterdam' }} onChange={() => {}} />);
  assert.match(markup, /Credentials saved/);
  assert.match(markup, /Update credentials/);
  assert.doesNotMatch(markup, /type="password"/);
  assert.match(markup, /value="amsterdam" selected/);
});

test('new proxy setup explains service credentials and flags incomplete entry', () => {
  const markup = renderToStaticMarkup(<NordVpnSettings form={{ ...emptyNetworkForm(), nordVpnLocation: 'amsterdam', nordVpnUsername: 'example' }} onChange={() => {}} />);
  assert.match(markup, /type="password"/);
  assert.match(markup, /Enter both service credentials before saving/);
  assert.match(markup, /Each connection runs its own isolated tunnel/);
});

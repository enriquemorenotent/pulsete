import assert from 'node:assert/strict';
import test from 'node:test';
import { createBanner } from '../web/src/banner.js';
import { initialState, reducer } from '../web/src/app-state.js';
import { createGatewayActions } from '../web/src/app-actions-gateway.js';
import { GatewaySocketClosedError, gatewayReconnectBannerOptions, gatewayReconnectMessage } from '../web/src/gateway.js';
import type { SocketHandle } from '../web/src/client.js';

test('notification lifetime is explicit and independent of its wording', () => {
  const normal = reducer(initialState, { type: 'set-banner', banner: { kind: 'error', message: gatewayReconnectMessage } });
  assert.equal(normal.transient.banner?.dismissAfterMs, 4200);
  assert.deepEqual(reducer(normal, { type: 'gateway-connected' }).transient.banner, normal.transient.banner);
  const persistent = createBanner('notice', 'Keep this visible', { id: 'other-status', dismissAfterMs: null });
  const state = reducer(initialState, { type: 'set-banner', banner: persistent });
  assert.deepEqual(reducer(state, { type: 'gateway-connected' }).transient.banner, persistent);
});

test('reconnecting resolves by identifier even when its text changes', () => {
  const banner = createBanner('error', 'A different connection message', gatewayReconnectBannerOptions);
  const state = reducer(initialState, { type: 'set-banner', banner });
  assert.equal(state.transient.banner?.dismissAfterMs, null);
  assert.equal(reducer(state, { type: 'gateway-connected' }).transient.banner, null);
});

test('both unavailable and failing gateway sockets publish persistent identified notifications', () => {
  for (const connected of [false, true]) {
    const banners = [] as ReturnType<typeof createBanner>[];
    const state = { ...initialState, domain: { ...initialState.domain, gatewayStatus: connected ? 'connected' as const : 'disconnected' as const } };
    const socket = connected ? { send() { throw new GatewaySocketClosedError(); } } as unknown as SocketHandle : null;
    const actions = createGatewayActions({
      getState: () => state,
      socketRef: { current: socket },
      updateBanner: (kind, message, options) => banners.push(createBanner(kind, message, options)),
    });
    assert.equal(actions.sendGatewayMessage({ type: 'raw.send', networkId: 'test', raw: 'WHOIS reader' }), false);
    assert.deepEqual(banners, [createBanner('error', gatewayReconnectMessage, gatewayReconnectBannerOptions)]);
  }
});

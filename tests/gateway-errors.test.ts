import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewayActions } from '../web/src/app-actions-gateway.js';
import { initialState } from '../web/src/app-state.js';
import { createBanner } from '../web/src/banner.js';
import {
  GatewaySocketClosedError, gatewaySocketClosedMessage, gatewayReconnectMessage,
  gatewayReconnectBannerOptions, toGatewayErrorMessage, toGatewayErrorOptions,
} from '../web/src/gateway.js';

test('connection errors are recognized by type regardless of wording', () => {
  const error = new GatewaySocketClosedError();
  error.message = 'Different wording';
  assert.equal(toGatewayErrorMessage(error, 'Failed'), gatewayReconnectMessage);
  assert.deepEqual(toGatewayErrorOptions(error), gatewayReconnectBannerOptions);
  const ordinary = new Error(gatewaySocketClosedMessage);
  assert.equal(toGatewayErrorMessage(ordinary, 'Failed'), gatewaySocketClosedMessage);
  assert.equal(toGatewayErrorOptions(ordinary), undefined);
});

test('gateway actions report ordinary failures without claiming to reconnect and honor silent sends', () => {
  for (const failure of [new Error('Invalid outgoing message'), new Error(gatewaySocketClosedMessage), 'unknown']) {
    const banners: ReturnType<typeof createBanner>[] = [];
    const actions = createGatewayActions({
      getState: () => ({ ...initialState, domain: { ...initialState.domain, gatewayStatus: 'connected' } }),
      socketRef: { current: { send() { throw failure; }, close() {} } },
      updateBanner: (kind, message, options) => banners.push(createBanner(kind, message, options)),
    });
    const message = { type: 'network.connect', networkId: 'net-1' } as const;
    assert.equal(actions.sendGatewayMessage(message), false);
    assert.deepEqual(banners, [createBanner('error', failure instanceof Error ? failure.message : 'Failed to send message')]);
    assert.equal(actions.sendGatewayMessage(message, false), false);
    assert.equal(banners.length, 1);
  }
});

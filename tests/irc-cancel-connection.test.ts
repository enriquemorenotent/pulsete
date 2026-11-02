import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { IrcConnection } from '../server/irc.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

test('canceling a pending VPN connection aborts the tunnel and cannot schedule a reconnect', () => {
  const connection = new IrcConnection({ ...createNetworkInput(), id: 'cancel-test', workspaceOpen: true, hasPassword: false }, { onEvent: () => {} });
  const pending = new net.Socket();
  let stopped = 0;
  connection.openSocket(pending);
  connection.lifecycle.stopVpnTunnel = () => { stopped++; };
  connection.disconnect();
  assert.equal(stopped, 1);
  assert.equal(pending.destroyed, true);
  assert.equal(pending.writableLength, 0);
  assert.equal(connection.lifecycle.socket, null);
  assert.equal(connection.lifecycle.manualDisconnect, true);
  assert.equal(connection.state.phase, 'offline');
  connection.handleSocketClosed(pending);
  assert.equal(connection.lifecycle.reconnectTimer, null);
  assert.equal(connection.lifecycle.stopVpnTunnel, undefined);
});

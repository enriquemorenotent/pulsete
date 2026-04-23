import assert from 'node:assert/strict';
import test from 'node:test';
import type { NetworkProfile } from '../shared/protocol.js';
import {
  getNetworkManagerAuthLabel,
  getNetworkManagerAutoJoinLabel,
  getNetworkManagerConnectButtonState,
  getNetworkManagerRowStatus,
  getNetworkManagerStatusLabel,
} from '../web/src/network-manager-dialog-model.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'saved-network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? false,
  connectionClosed: overrides.connectionClosed,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  username: overrides.username ?? 'sofia',
  realName: overrides.realName ?? 'Sofia',
  hasPassword: overrides.hasPassword ?? false,
  authMethod: overrides.authMethod,
  authTarget: overrides.authTarget,
  authAccount: overrides.authAccount,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});







test('getNetworkManagerConnectButtonState disables the button for an already connected network', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(makeNetwork(), { phase: 'connected', serverName: null, nick: 'sofia' }),
    { label: 'Connected', disabled: true }
  );
});

test('getNetworkManagerConnectButtonState disables the button while a network is connecting', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(makeNetwork(), { phase: 'connecting', serverName: null, nick: 'sofia' }),
    { label: 'Connecting', disabled: true }
  );
});

test('getNetworkManagerConnectButtonState keeps Connect enabled for offline networks', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(makeNetwork(), { phase: 'offline', serverName: null, nick: 'sofia' }),
    { label: 'Connect', disabled: false }
  );
});

test('getNetworkManagerConnectButtonState disables the button when nothing is selected', () => {
  assert.deepEqual(
    getNetworkManagerConnectButtonState(null, null),
    { label: 'Connect', disabled: true }
  );
});

test('getNetworkManagerRowStatus keeps Online and Connecting visible independently of selection', () => {
  assert.equal(getNetworkManagerRowStatus({ phase: 'connected', serverName: null, nick: 'sofia' }), 'online');
  assert.equal(getNetworkManagerRowStatus({ phase: 'connecting', serverName: null, nick: 'sofia' }), 'connecting');
  assert.equal(getNetworkManagerRowStatus({ phase: 'offline', serverName: null, nick: 'sofia' }), null);
  assert.equal(getNetworkManagerRowStatus(null), null);
});

test('network manager detail helpers produce scan-friendly UI copy', () => {
  const network = makeNetwork({
    name: 'Libera.Chat',
    authMethod: 'nickserv',
    authAccount: 'sofia',
    autoJoin: ['#pulsete', '#ops'],
  });

  assert.equal(getNetworkManagerAuthLabel(network), 'NickServ');
  assert.equal(getNetworkManagerAutoJoinLabel(network), '2 channels');
  assert.equal(getNetworkManagerStatusLabel({ phase: 'connected', serverName: null, nick: network.nick }), 'Online');
  assert.equal(getNetworkManagerStatusLabel({ phase: 'connecting', serverName: null, nick: network.nick }), 'Connecting');
  assert.equal(getNetworkManagerStatusLabel({ phase: 'offline', serverName: null, nick: network.nick }), 'Offline');
});

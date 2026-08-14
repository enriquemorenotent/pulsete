import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makeSidebarBuffer,
  makeSidebarNetwork,
  makeSidebarRuntime,
  renderConnectionSidebar,
} from './helpers/connection-sidebar-test-helpers.js';

test('sidebar row actions are visually quiet until hover or keyboard focus', () => {
  const network = makeSidebarNetwork();
  const server = makeSidebarBuffer({ id: 'server-1' });
  const channel = makeSidebarBuffer({
    id: 'channel-1',
    kind: 'channel',
    target: '#help',
  });
  const markup = renderConnectionSidebar({
    networks: [network],
    buffers: [server, channel],
    networkStates: { [network.id]: makeSidebarRuntime({ phase: 'connected' }) },
    selection: { kind: 'buffer', bufferId: server.id },
    friends: [{ id: 'friend-1', nick: 'alice' }],
    friendPresence: { 'friend-1': 'online' },
  });

  assert.match(markup, /aria-label="Disconnect Cuff-Link"/);
  assert.match(markup, /aria-label="Close Cuff-Link"/);
  assert.match(markup, /aria-label="Close #help"/);
  assert.match(markup, /aria-label="Remove alice from watchlist"/);
  assert.match(markup, /opacity-0/);
  assert.match(markup, /absolute right-2 top-1\/2 z-20/);
  assert.match(markup, /group-hover:opacity-100/);
  assert.match(markup, /group-focus-within:opacity-100/);
  assert.doesNotMatch(markup, /group-hover:w-7/);
  assert.doesNotMatch(markup, /group-hover:mr-1\.5/);
	assert.match(markup, /focus-visible:ring-primary\/45/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makeSidebarBuffer,
  makeSidebarNetwork,
  makeSidebarRuntime,
  renderConnectionSidebar,
} from './helpers/connection-sidebar-test-helpers.js';

test('selected server rows stay prominent for non-priority unread state', () => {
  const network = makeSidebarNetwork();
  const server = makeSidebarBuffer({
    id: 'server-1',
    unread: 2,
    priorityUnread: 0,
  });
  const markup = renderConnectionSidebar({
    networks: [network],
    buffers: [server],
    networkStates: { [network.id]: makeSidebarRuntime({ phase: 'connected' }) },
    selection: { kind: 'buffer', bufferId: server.id },
  });

  assert.match(markup, /aria-label="Open Cuff-Link \(unread\)"/);
  assert.match(markup, /bg-primary/);
  assert.match(
    markup,
    /class="truncate text-\[12\.5px\] text-foreground font-semibold block min-w-0 flex-1">Cuff-Link<\/span>/,
  );
});

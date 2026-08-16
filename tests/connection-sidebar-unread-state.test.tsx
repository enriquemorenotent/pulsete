import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makeSidebarBuffer,
  makeSidebarNetwork,
  makeSidebarRuntime,
  renderConnectionSidebar,
} from './helpers/connection-sidebar-test-helpers.js';
import { connectionSidebarLabelClass } from '../web/src/connection-sidebar-label-class.js';

test('channel and direct-message labels separate selection color from unread weight', () => {
  const activeRead = connectionSidebarLabelClass(
    { hasUnread: false, priority: false },
    { selected: true },
  );
  const inactiveRead = connectionSidebarLabelClass(
    { hasUnread: false, priority: false },
    { selected: false },
  );
  const inactiveUnread = connectionSidebarLabelClass(
    { hasUnread: true, priority: false },
    { selected: false },
  );
  const activeUnread = connectionSidebarLabelClass(
    { hasUnread: true, priority: false },
    { selected: true },
  );

  assert.match(activeRead, /text-foreground/);
  assert.match(activeRead, /transition-colors/);
  assert.doesNotMatch(activeRead, /font-(?:medium|semibold)/);
  assert.match(inactiveRead, /text-muted-foreground\/88/);
  assert.doesNotMatch(inactiveRead, /(?:^|\s)text-foreground(?:\s|$)/);
  assert.doesNotMatch(inactiveRead, /font-(?:medium|semibold)/);
  assert.match(inactiveUnread, /text-foreground/);
  assert.match(inactiveUnread, /font-semibold/);
  assert.match(activeUnread, /text-foreground/);
  assert.match(activeUnread, /font-semibold/);
});

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

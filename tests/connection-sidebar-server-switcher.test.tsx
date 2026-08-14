import assert from 'node:assert/strict';
import test from 'node:test';
import type { FriendState } from '../shared/protocol-chat.js';
import {
  makeSidebarBuffer,
  makeSidebarNetwork,
  makeSidebarRuntime,
  renderConnectionSidebar,
} from './helpers/connection-sidebar-test-helpers.js';

test('connection sidebar shows all servers but only the active server tabs', () => {
  const alpha = makeSidebarNetwork({ id: 'alpha', name: 'Alpha' });
  const beta = makeSidebarNetwork({ id: 'beta', name: 'Beta' });
  const markup = renderConnectionSidebar({
    networks: [alpha, beta],
    buffers: [
      makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' }),
      makeSidebarBuffer({
        id: 'alpha-channel',
        networkId: 'alpha',
        kind: 'channel',
        target: '#alpha',
      }),
      makeSidebarBuffer({ id: 'beta-server', networkId: 'beta' }),
      makeSidebarBuffer({
        id: 'beta-channel',
        networkId: 'beta',
        kind: 'channel',
        target: '#beta',
      }),
    ],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.match(markup, /aria-label="Open Alpha"/);
  assert.match(markup, /aria-label="Open Beta"/);
  assert.match(markup, /shadow-\[inset_0_0_0_1px_#f27f68\]/);
  assert.doesNotMatch(markup, /absolute right-0\.5 top-0\.5 size-2 rounded-full bg-primary/);
  assert.doesNotMatch(markup, /rounded-r-full bg-primary/);
  assert.doesNotMatch(markup, /ring-2 ring-inset ring-primary/);
  assert.doesNotMatch(markup, /Alpha<\/h2>/);
  assert.doesNotMatch(markup, /ml-3 min-w-0 space-y-px border-l border-white\/7 pl-2/);
  assert.match(markup, /class="min-w-0 w-full"/);
  assert.match(markup, /aria-label="Connect Alpha"/);
  assert.match(markup, /lucide-plug/);
  assert.match(markup, /aria-label="Close Alpha"/);
  assert.doesNotMatch(markup, /group-hover:pointer-events-auto/);
  assert.match(markup, /aria-label="Open #alpha"/);
  assert.doesNotMatch(markup, /aria-label="Open #beta"/);
});

test('connection sidebar puts server actions in the server header', () => {
  const alpha = makeSidebarNetwork({ id: 'alpha', name: 'Alpha' });
  const markup = renderConnectionSidebar({
    networks: [alpha],
    networkStates: {
      alpha: makeSidebarRuntime({ phase: 'connected' }),
    },
    buffers: [makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' })],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.match(markup, />Connected<\/span>/);
  assert.match(markup, />Alpha<\/button>/);
  assert.match(markup, /title="Open server"/);
  assert.doesNotMatch(markup, /absolute inset-0 z-10 cursor-pointer/);
  assert.match(markup, /aria-label="Disconnect Alpha"/);
  assert.match(markup, /title="Disconnect"/);
  assert.match(markup, /lucide-unplug/);
  assert.match(markup, /aria-label="Close Alpha"/);
  assert.doesNotMatch(markup, /group-hover:pointer-events-auto/);
});

test('connection sidebar aggregates hidden child unread activity on server buttons', () => {
  const alpha = makeSidebarNetwork({ id: 'alpha', name: 'Alpha' });
  const beta = makeSidebarNetwork({ id: 'beta', name: 'Beta' });
  const markup = renderConnectionSidebar({
    networks: [alpha, beta],
    networkStates: {
      alpha: makeSidebarRuntime({ phase: 'connected' }),
      beta: makeSidebarRuntime({ phase: 'connected' }),
    },
    buffers: [
      makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' }),
      makeSidebarBuffer({ id: 'beta-server', networkId: 'beta' }),
      makeSidebarBuffer({
        id: 'beta-channel',
        networkId: 'beta',
        kind: 'channel',
        target: '#hidden',
        priorityUnread: 1,
        unread: 1,
      }),
    ],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.match(markup, /aria-label="Open Beta \(unread\)"/);
  assert.match(markup, /bg-primary/);
  assert.doesNotMatch(markup, /aria-label="Open #hidden"/);
});

test('connection sidebar keeps watchlist visible below active server tabs', () => {
  const friend: FriendState = {
    id: 'friend-1',
    nick: 'Alice',
  };
  const markup = renderConnectionSidebar({
    friends: [friend],
    friendPresence: { [friend.id]: 'online' },
    networks: [makeSidebarNetwork({ id: 'alpha', name: 'Alpha' })],
    buffers: [makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' })],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.match(markup, /Watchlist<\/h2>/);
  assert.match(markup, /aria-label="Open Alpha"/);
  assert.match(markup, /Alice/);
});

test('connection sidebar renders assigned server images when media is shown', () => {
  const markup = renderConnectionSidebar({
    networks: [
      makeSidebarNetwork({
        id: 'alpha',
        name: 'Alpha',
        iconUrl: 'https://example.test/alpha.png',
      }),
    ],
    buffers: [makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' })],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.match(markup, /src="https:\/\/example.test\/alpha.png"/);
  assert.match(markup, /class="[^"]*size-full[^"]*rounded-\[inherit\][^"]*"/);
  assert.match(markup, /class="absolute inset-0 size-full object-cover grayscale opacity-60"/);
  assert.match(markup, /aria-label="Copy server image URL"/);
  assert.match(markup, /referrerPolicy="no-referrer"/);
});

test('connection sidebar keeps the server rail and hides images when media is hidden', () => {
  const alpha = makeSidebarNetwork({
    id: 'alpha',
    name: 'Alpha',
    iconUrl: 'https://example.test/alpha.png',
  });
  const beta = makeSidebarNetwork({
    id: 'beta',
    name: 'Beta',
    iconUrl: 'https://example.test/beta.png',
  });
  const markup = renderConnectionSidebar({
    showMedia: false,
    networks: [alpha, beta],
    buffers: [
      makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' }),
      makeSidebarBuffer({
        id: 'alpha-channel',
        networkId: 'alpha',
        kind: 'channel',
        target: '#alpha',
      }),
      makeSidebarBuffer({ id: 'beta-server', networkId: 'beta' }),
      makeSidebarBuffer({
        id: 'beta-channel',
        networkId: 'beta',
        kind: 'channel',
        target: '#beta',
      }),
    ],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.match(markup, /Channels<\/h2>/);
  assert.match(markup, /aria-label="Open Alpha"/);
  assert.match(markup, /aria-label="Open #alpha"/);
  assert.doesNotMatch(markup, /aria-label="Open #beta"/);
  assert.match(markup, /class="min-w-0 w-full"/);
  assert.doesNotMatch(markup, /src="https:\/\/example.test\/alpha.png"/);
  assert.doesNotMatch(markup, /src="https:\/\/example.test\/beta.png"/);
  assert.doesNotMatch(markup, /aria-label="Copy server image URL"/);
});

test('connection sidebar uses IRCCloud avatars when no server image is set', () => {
  const markup = renderConnectionSidebar({
    externalAvatarsEnabled: true,
    networks: [
      makeSidebarNetwork({
        id: 'alpha',
        name: 'Alpha',
        username: 'uid7',
      }),
    ],
    buffers: [makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' })],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.match(markup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
  assert.match(markup, /data-network-image-source="irccloud-fallback"/);
  assert.match(markup, /class="[^"]*size-full[^"]*rounded-\[inherit\][^"]*"/);
});

test('connection sidebar does not use IRCCloud avatars when external avatars are disabled', () => {
  const markup = renderConnectionSidebar({
    externalAvatarsEnabled: false,
    networks: [
      makeSidebarNetwork({
        id: 'alpha',
        name: 'Alpha',
        username: 'uid7',
      }),
    ],
    buffers: [makeSidebarBuffer({ id: 'alpha-server', networkId: 'alpha' })],
    selection: { kind: 'buffer', bufferId: 'alpha-server' },
  });

  assert.doesNotMatch(markup, /avatar-redirect/);
  assert.doesNotMatch(markup, /data-network-image-source="irccloud-fallback"/);
});

test('connection sidebar shows connection state separately from unread activity', () => {
  const online = makeSidebarNetwork({
    id: 'online',
    name: 'Online',
    iconUrl: 'https://example.test/online.png',
  });
  const connecting = makeSidebarNetwork({
    id: 'connecting',
    name: 'Connecting',
    iconUrl: 'https://example.test/connecting.png',
  });
  const offline = makeSidebarNetwork({
    id: 'offline',
    name: 'Offline',
    iconUrl: 'https://example.test/offline.png',
  });
  const markup = renderConnectionSidebar({
    networks: [online, connecting, offline],
    networkStates: {
      online: makeSidebarRuntime({ phase: 'connected' }),
      connecting: makeSidebarRuntime({ phase: 'connecting' }),
      offline: makeSidebarRuntime({ phase: 'offline' }),
    },
    buffers: [
      makeSidebarBuffer({ id: 'online-server', networkId: 'online' }),
      makeSidebarBuffer({ id: 'connecting-server', networkId: 'connecting' }),
      makeSidebarBuffer({
        id: 'offline-server',
        networkId: 'offline',
        priorityUnread: 1,
        unread: 1,
      }),
    ],
    selection: { kind: 'buffer', bufferId: 'online-server' },
  });

  assert.doesNotMatch(markup, /shadow-\[inset_2px_0_0/);
  assert.match(markup, /grayscale opacity-60/);
  assert.match(markup, /saturate-90/);
  assert.doesNotMatch(markup, />connected<\/span>/);
  assert.match(markup, /aria-label="Open Offline \(unread\)"/);
});

test('connection sidebar applies connection image state to the active banner', () => {
  const offline = makeSidebarNetwork({
    id: 'offline',
    name: 'Offline',
    iconUrl: 'https://example.test/offline.png',
  });
  const markup = renderConnectionSidebar({
    networks: [offline],
    networkStates: {
      offline: makeSidebarRuntime({ phase: 'offline' }),
    },
    buffers: [makeSidebarBuffer({ id: 'offline-server', networkId: 'offline' })],
    selection: { kind: 'buffer', bufferId: 'offline-server' },
  });

  assert.match(markup, /class="absolute inset-0 size-full object-cover grayscale opacity-60"/);
});

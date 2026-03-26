import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionSidebar } from '../web/src/ConnectionSidebar.js';
import { buildConnectionSidebarView } from '../web/src/connection-sidebar-view.js';
import { buildConversationIndex } from '../web/src/conversation-selectors.js';
import { FRIENDS_SIDEBAR_EXPANDED_STORAGE_KEY } from '../web/src/sidebar-friends.js';
import type { BufferState, FriendState, NetworkProfile } from '../shared/protocol.js';

test('sidebar restores the persisted friends expansion preference on first render', () => {
  const originalWindow = globalThis.window;
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => (key === FRIENDS_SIDEBAR_EXPANDED_STORAGE_KEY ? 'false' : null),
        setItem: () => undefined,
      },
    },
  });

  try {
    const markup = renderToStaticMarkup(
      <ConnectionSidebar
        connections={buildConnectionSidebarView({
          networks: [] satisfies NetworkProfile[],
          conversation: buildConversationIndex({
            buffers: [] satisfies BufferState[],
            channels: [],
            pendingChannels: [],
            messages: {},
          }),
          networkStates: {},
          selection: null,
        })}
        friends={[{ id: 'friend-1', nick: 'Alice' } satisfies FriendState]}
        friendPresence={{}}
        onAddFriend={async () => true}
        onRemoveFriend={async () => true}
        onSelectFriend={async () => undefined}
        onSelectNetwork={() => undefined}
        onSelectBuffer={() => undefined}
        onSelectPendingChannel={() => undefined}
        onReconnectNetwork={() => undefined}
        onDisconnectNetwork={() => undefined}
        onCloseConnection={() => undefined}
        onCloseChannel={() => undefined}
        onCloseBuffer={() => undefined}
      />
    );

    assert.match(markup, /aria-label="Expand friends"/);
    assert.match(markup, /aria-expanded="false"/);
    assert.doesNotMatch(markup, /aria-label="Open Alice \(offline\)"/);
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: Window & typeof globalThis }).window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

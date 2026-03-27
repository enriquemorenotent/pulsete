import { memo, useEffect, useState } from 'react';
import { ConnectionSidebarConnections } from './ConnectionSidebarConnections.js';
import { ConnectionSidebarFriends } from './ConnectionSidebarFriends.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';
import {
  FRIENDS_SIDEBAR_EXPANDED_STORAGE_KEY,
  readFriendsSidebarExpanded,
} from './sidebar-friends.js';

export type { ConnectionSidebarProps } from './connection-sidebar-types.js';

export const ConnectionSidebar = memo(function ConnectionSidebar(
  props: ConnectionSidebarProps,
) {
  const [showAddFriendDialog, setShowAddFriendDialog] = useState(false);
  const [friendDraft, setFriendDraft] = useState('');
  const defaultFriendsExpanded =
    props.connections.length === 0 && props.friends.length > 0;
  const [friendsExpanded, setFriendsExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultFriendsExpanded;
    }
    return readFriendsSidebarExpanded(
      window.localStorage.getItem(FRIENDS_SIDEBAR_EXPANDED_STORAGE_KEY),
      defaultFriendsExpanded,
    );
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      FRIENDS_SIDEBAR_EXPANDED_STORAGE_KEY,
      String(friendsExpanded),
    );
  }, [friendsExpanded]);

  return (
    <aside className="flex h-full min-h-0 flex-col gap-5 overflow-hidden px-3 py-4">
      <ConnectionSidebarConnections
        connections={props.connections}
        onSelectNetwork={props.onSelectNetwork}
        onSelectBuffer={props.onSelectBuffer}
        onSelectPendingChannel={props.onSelectPendingChannel}
        onReconnectNetwork={props.onReconnectNetwork}
        onDisconnectNetwork={props.onDisconnectNetwork}
        onCloseConnection={props.onCloseConnection}
        onCloseChannel={props.onCloseChannel}
        onCloseBuffer={props.onCloseBuffer}
      />
      <ConnectionSidebarFriends
        friends={props.friends}
        friendPresence={props.friendPresence}
        onAddFriend={props.onAddFriend}
        onRemoveFriend={props.onRemoveFriend}
        onSelectFriend={props.onSelectFriend}
        expanded={friendsExpanded}
        onExpandedChange={setFriendsExpanded}
        draft={friendDraft}
        open={showAddFriendDialog}
        onDraftChange={setFriendDraft}
        onOpenChange={setShowAddFriendDialog}
      />
    </aside>
  );
});

import { useState } from 'react';
import { ConnectionSidebarConnections } from './ConnectionSidebarConnections.js';
import { ConnectionSidebarFriends } from './ConnectionSidebarFriends.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

export type { ConnectionSidebarProps } from './connection-sidebar-types.js';

export function ConnectionSidebar(props: ConnectionSidebarProps) {
  const [showAddFriendDialog, setShowAddFriendDialog] = useState(false);
  const [friendDraft, setFriendDraft] = useState('');

  return (
    <aside className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
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
        draft={friendDraft}
        open={showAddFriendDialog}
        onDraftChange={setFriendDraft}
        onOpenChange={setShowAddFriendDialog}
      />
    </aside>
  );
}

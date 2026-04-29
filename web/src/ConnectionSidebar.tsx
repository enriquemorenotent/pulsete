import { memo } from 'react';
import { ConnectionSidebarConnections } from './ConnectionSidebarConnections.js';
import { ConnectionSidebarFriends } from './ConnectionSidebarFriends.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

export type { ConnectionSidebarProps } from './connection-sidebar-types.js';

export const ConnectionSidebar = memo(function ConnectionSidebar(
	props: ConnectionSidebarProps,
) {
	return (
		<aside className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
			<ConnectionSidebarConnections
				connections={props.connections}
				nickEmojis={props.nickEmojis}
				queryPresence={props.queryPresence ?? {}}
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
				hideOfflineFriends={props.hideOfflineFriends}
				nickEmojis={props.nickEmojis}
				onRemoveFriend={props.onRemoveFriend}
				onSelectFriend={props.onSelectFriend}
				onToggleHideOfflineFriends={props.onToggleHideOfflineFriends}
			/>
		</aside>
	);
});

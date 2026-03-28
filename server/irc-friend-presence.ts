import type { IrcFriendPresenceContext } from './irc-contexts.js';
import {
	clearFriendPresenceTimer,
	ensureFriendPresenceTimer,
	handleFriendPresenceIsonReply,
	requestIsonSnapshot,
} from './irc-friend-presence-ison.js';
import {
	clearMonitorSubscriptions,
	handleFriendPresenceMonitorUpdate,
	syncMonitorSubscriptions,
} from './irc-friend-presence-monitor.js';
import {
	dedupeFriendNicks,
	filterPresenceByTrackedNicks,
	retainTrackedPresenceKeys,
	updateFriendPresenceStatuses,
} from './irc-friend-presence-snapshots.js';
import { resolveFriendPresenceTransport } from './irc-friend-presence-shared.js';

export {
	clearFriendPresenceTimer,
	ensureFriendPresenceTimer,
	handleFriendPresenceIsonReply,
	handleFriendPresenceMonitorUpdate,
	updateFriendPresenceStatuses,
};

export const setFriendNicks = (
	connection: IrcFriendPresenceContext,
	nicks: string[],
) => {
	const presence = connection.friendPresence;
	presence.nicks = dedupeFriendNicks(nicks);
	presence.resolvedNicks = retainTrackedPresenceKeys(
		presence.nicks,
		presence.resolvedNicks,
	);
	updateFriendPresenceStatuses(
		connection,
		filterPresenceByTrackedNicks(presence.nicks, presence.presenceByKey),
	);
	if (
		!connection.lifecycle.connected ||
		!connection.lifecycle.socket ||
		!presence.enabled
	) {
		presence.pendingIsonSnapshot = null;
		clearFriendPresenceTimer(connection);
		return;
	}
	syncFriendPresenceTransport(connection);
};

export const refreshFriendPresence = (
	connection: IrcFriendPresenceContext,
) => {
	const presence = connection.friendPresence;
	if (
		!connection.lifecycle.connected ||
		!connection.lifecycle.socket ||
		!presence.enabled
	) {
		presence.pendingIsonSnapshot = null;
		updateFriendPresenceStatuses(connection, new Map());
		clearFriendPresenceTimer(connection);
		return;
	}
	syncFriendPresenceTransport(connection);
};

export const setFriendPresenceMonitorSupport = (
	connection: IrcFriendPresenceContext,
	supported: boolean,
	limit: number | null,
) => {
	const presence = connection.friendPresence;
	presence.monitorSupported = supported;
	presence.monitorLimit =
		supported && typeof limit === 'number' && Number.isFinite(limit) && limit > 0
			? limit
			: null;
	if (
		!connection.lifecycle.connected ||
		!connection.lifecycle.socket ||
		!presence.enabled
	) {
		return;
	}
	syncFriendPresenceTransport(connection);
};

export const disableFriendPresence = (
	connection: IrcFriendPresenceContext,
) => {
	connection.friendPresence.enabled = false;
	connection.friendPresence.pendingIsonSnapshot = null;
	connection.friendPresence.resolvedNicks.clear();
	connection.friendPresence.monitorSupported = false;
	connection.friendPresence.monitorLimit = null;
	connection.friendPresence.activeTransport = null;
	clearMonitorSubscriptions(connection);
	clearFriendPresenceTimer(connection);
	updateFriendPresenceStatuses(connection, new Map());
};

const syncFriendPresenceTransport = (
	connection: IrcFriendPresenceContext,
) => {
	const presence = connection.friendPresence;
	const transport = resolveFriendPresenceTransport(presence);
	if (!transport) {
		if (presence.activeTransport === 'monitor') {
			clearMonitorSubscriptions(connection);
		}
		presence.activeTransport = null;
		presence.pendingIsonSnapshot = null;
		clearFriendPresenceTimer(connection);
		return;
	}
	if (presence.activeTransport === 'monitor' && transport !== 'monitor') {
		clearMonitorSubscriptions(connection);
	}
	if (transport !== 'ison') {
		presence.pendingIsonSnapshot = null;
		clearFriendPresenceTimer(connection);
	}
	presence.activeTransport = transport;
	if (transport === 'monitor') {
		syncMonitorSubscriptions(connection);
		return;
	}
	ensureFriendPresenceTimer(connection);
	requestIsonSnapshot(connection);
};

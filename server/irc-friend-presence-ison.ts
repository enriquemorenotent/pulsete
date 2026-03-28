import type { PresenceStatus } from '../shared/protocol.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { IrcFriendPresenceContext } from './irc-contexts.js';
import { createFriendPresenceIsonReplyContext } from './irc-reply-context.js';
import {
	buildCommandBatches,
	buildTrackableNickMap,
	friendPresenceRefreshMs,
} from './irc-friend-presence-shared.js';
import {
	retainTrackedPresenceKeys,
	updateFriendPresenceStatuses,
} from './irc-friend-presence-snapshots.js';

export const ensureFriendPresenceTimer = (
	connection: IrcFriendPresenceContext,
) => {
	if (connection.friendPresence.timer) {
		return;
	}
	const timer = setInterval(
		() => requestIsonSnapshot(connection),
		friendPresenceRefreshMs,
	);
	timer.unref?.();
	connection.friendPresence.timer = timer;
};

export const clearFriendPresenceTimer = (
	connection: IrcFriendPresenceContext,
) => {
	const timer = connection.friendPresence.timer;
	if (!timer) {
		return;
	}
	clearInterval(timer);
	connection.friendPresence.timer = null;
};

export const handleFriendPresenceIsonReply = (
	connection: IrcFriendPresenceContext,
	snapshotId: number,
	onlineNicks: string[] | null,
	unsupported: boolean,
) => {
	const presence = connection.friendPresence;
	const pendingSnapshot = presence.pendingIsonSnapshot;
	if (!pendingSnapshot || pendingSnapshot.id !== snapshotId) {
		return;
	}
	if (!unsupported) {
		for (const nick of onlineNicks ?? []) {
			const normalizedNick = normalizeIrcIdentifier(nick);
			if (!pendingSnapshot.requestedNickKeys.has(normalizedNick)) {
				continue;
			}
			pendingSnapshot.onlineNickKeys.add(normalizedNick);
		}
	}
	pendingSnapshot.remainingReplies -= 1;
	if (pendingSnapshot.remainingReplies > 0) {
		return;
	}
	presence.pendingIsonSnapshot = null;
	if (unsupported) {
		presence.resolvedNicks.clear();
		clearFriendPresenceTimer(connection);
		updateFriendPresenceStatuses(connection, new Map());
		return;
	}
	presence.resolvedNicks = retainTrackedPresenceKeys(
		presence.nicks,
		new Set([
			...presence.resolvedNicks,
			...pendingSnapshot.requestedNickKeys,
		]),
	);
	const nextPresenceByKey = new Map<string, PresenceStatus>();
	for (const normalizedNick of pendingSnapshot.onlineNickKeys) {
		nextPresenceByKey.set(normalizedNick, 'online');
	}
	updateFriendPresenceStatuses(connection, nextPresenceByKey);
};

export const requestIsonSnapshot = (
	connection: IrcFriendPresenceContext,
) => {
	const trackableNickMap = buildTrackableNickMap(connection.friendPresence.nicks);
	if (trackableNickMap.size === 0) {
		connection.friendPresence.pendingIsonSnapshot = null;
		return;
	}
	const snapshotId = ++connection.friendPresence.nextSnapshotId;
	connection.friendPresence.pendingIsonSnapshot = {
		id: snapshotId,
		remainingReplies: 0,
		onlineNickKeys: new Set<string>(),
		requestedNickKeys: new Set<string>(),
	};
	for (const batch of buildCommandBatches(
		Array.from(trackableNickMap.values()),
		' ',
		'ISON ',
	)) {
		if (!connection.sendRaw(`ISON ${batch.join(' ')}`)) {
			continue;
		}
		connection.queueReplyContext(
			createFriendPresenceIsonReplyContext(snapshotId),
		);
		connection.friendPresence.pendingIsonSnapshot.remainingReplies += 1;
		for (const nick of batch) {
			connection.friendPresence.pendingIsonSnapshot.requestedNickKeys.add(
				normalizeIrcIdentifier(nick),
			);
		}
	}
	if (!connection.friendPresence.pendingIsonSnapshot.remainingReplies) {
		connection.friendPresence.pendingIsonSnapshot = null;
	}
};

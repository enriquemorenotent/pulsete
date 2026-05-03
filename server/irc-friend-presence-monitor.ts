import type { PresenceStatus } from '../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { IrcFriendPresenceContext } from './irc-contexts.js';
import {
	buildCommandBatches,
	buildTrackableNickMap,
	isTrackedMonitorNick,
} from './irc-friend-presence-shared.js';
import { updateFriendPresenceStatuses } from './irc-friend-presence-snapshots.js';

export const handleFriendPresenceMonitorUpdate = (
	connection: IrcFriendPresenceContext,
	nicks: string[],
	presence: PresenceStatus,
) => {
	if (connection.friendPresence.activeTransport !== 'monitor' || nicks.length === 0) {
		return false;
	}
	let handled = false;
	for (const nick of nicks) {
		const normalizedNick = normalizeIrcIdentifier(nick);
		if (!isTrackedMonitorNick(connection.friendPresence, normalizedNick)) {
			continue;
		}
		handled = true;
		connection.friendPresence.resolvedNicks.add(normalizedNick);
		if (presence === 'online') {
			connection.friendPresence.presenceByKey.set(normalizedNick, 'online');
			continue;
		}
		connection.friendPresence.presenceByKey.delete(normalizedNick);
	}
	if (handled) {
		updateFriendPresenceStatuses(connection, connection.friendPresence.presenceByKey);
	}
	return handled;
};

export const syncMonitorSubscriptions = (
	connection: IrcFriendPresenceContext,
) => {
	const desiredMonitorNicks = buildTrackableNickMap(connection.friendPresence.nicks);
	const removedNicks = Array.from(
		connection.friendPresence.registeredMonitorNicks.entries(),
	)
		.filter(([normalizedNick]) => !desiredMonitorNicks.has(normalizedNick))
		.map(([, nick]) => nick);
	for (const batch of buildCommandBatches(
		removedNicks,
		',',
		'MONITOR - ',
	)) {
		connection.sendRaw(`MONITOR - ${batch.join(',')}`);
	}
	for (const normalizedNick of removedNicks.map(normalizeIrcIdentifier)) {
		connection.friendPresence.registeredMonitorNicks.delete(normalizedNick);
	}
	if (desiredMonitorNicks.size === 0) {
		return;
	}
	const addedNicks = Array.from(desiredMonitorNicks.entries())
		.filter(
			([normalizedNick]) =>
				!connection.friendPresence.registeredMonitorNicks.has(normalizedNick),
		)
		.map(([, nick]) => nick);
	for (const batch of buildCommandBatches(addedNicks, ',', 'MONITOR + ')) {
		if (!connection.sendRaw(`MONITOR + ${batch.join(',')}`)) {
			continue;
		}
		for (const nick of batch) {
			connection.friendPresence.registeredMonitorNicks.set(
				normalizeIrcIdentifier(nick),
				nick,
			);
		}
	}
};

export const clearMonitorSubscriptions = (
	connection: IrcFriendPresenceContext,
) => {
	if (
		connection.lifecycle.connected &&
		connection.lifecycle.socket &&
		connection.friendPresence.monitorSupported &&
		connection.friendPresence.registeredMonitorNicks.size > 0
	) {
		connection.sendRaw('MONITOR C');
	}
	connection.friendPresence.registeredMonitorNicks.clear();
};

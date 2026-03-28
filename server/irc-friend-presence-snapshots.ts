import type { PresenceStatus } from '../shared/protocol.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { IrcFriendPresenceContext } from './irc-contexts.js';
import { emitFriendPresence } from './irc-emit.js';

export const dedupeFriendNicks = (nicks: string[]) => {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const nick of nicks) {
		const normalized = normalizeIrcIdentifier(nick);
		if (seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		unique.push(nick);
	}
	return unique;
};

export const retainTrackedPresenceKeys = (
	nicks: string[],
	keys: Set<string>,
) =>
	new Set(
		nicks
			.map((nick) => normalizeIrcIdentifier(nick))
			.filter((normalizedNick) => keys.has(normalizedNick)),
	);

export const filterPresenceByTrackedNicks = (
	nicks: string[],
	presenceByKey: Map<string, PresenceStatus>,
) => {
	const nextPresenceByKey = new Map<string, PresenceStatus>();
	for (const nick of nicks) {
		const normalizedNick = normalizeIrcIdentifier(nick);
		const presence = presenceByKey.get(normalizedNick);
		if (!presence || presence === 'offline') {
			continue;
		}
		nextPresenceByKey.set(normalizedNick, presence);
	}
	return nextPresenceByKey;
};

export const updateFriendPresenceStatuses = (
	connection: IrcFriendPresenceContext,
	presenceByKey: Map<string, PresenceStatus>,
) => {
	const nextPresenceByKey = normalizePresenceMap(
		filterPresenceByTrackedNicks(connection.friendPresence.nicks, presenceByKey),
	);
	const nextSnapshotByKey = buildResolvedPresenceSnapshotByKey(
		connection.friendPresence.resolvedNicks,
		nextPresenceByKey,
	);
	connection.friendPresence.presenceByKey = nextPresenceByKey;
	if (presenceMapsEqual(connection.friendPresence.snapshotByKey, nextSnapshotByKey)) {
		return;
	}
	connection.friendPresence.snapshotByKey = nextSnapshotByKey;
	emitFriendPresence(
		connection,
		buildResolvedPresenceSnapshot(
			connection.friendPresence.nicks,
			connection.friendPresence.resolvedNicks,
			nextPresenceByKey,
		),
	);
};

const buildResolvedPresenceSnapshot = (
	nicks: string[],
	resolvedNicks: Set<string>,
	presenceByKey: Map<string, PresenceStatus>,
) =>
	Object.fromEntries(
		nicks.flatMap((nick) => {
			const normalizedNick = normalizeIrcIdentifier(nick);
			if (!resolvedNicks.has(normalizedNick)) {
				return [];
			}
			return [[nick, presenceByKey.get(normalizedNick) ?? 'offline']];
		}),
	);

const buildResolvedPresenceSnapshotByKey = (
	resolvedNicks: Set<string>,
	presenceByKey: Map<string, PresenceStatus>,
) => {
	const snapshotByKey = new Map<string, PresenceStatus>();
	for (const normalizedNick of resolvedNicks) {
		snapshotByKey.set(
			normalizedNick,
			presenceByKey.get(normalizedNick) ?? 'offline',
		);
	}
	return snapshotByKey;
};

const normalizePresenceMap = (
	presenceByKey: Map<string, PresenceStatus>,
) => {
	const nextPresenceByKey = new Map<string, PresenceStatus>();
	for (const [key, presence] of presenceByKey.entries()) {
		if (presence === 'offline') {
			continue;
		}
		nextPresenceByKey.set(key, presence);
	}
	return nextPresenceByKey;
};

const presenceMapsEqual = (
	left: Map<string, PresenceStatus>,
	right: Map<string, PresenceStatus>,
) =>
	left.size === right.size &&
	Array.from(left.entries()).every(
		([key, presence]) => right.get(key) === presence,
	);

import type { IrcCaseMapping } from '../shared/irc-server-rules.js';
import type { PresenceStatus } from '../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { IrcFriendPresenceContext } from './irc-contexts.js';
import { emitEvent, emitFriendPresence } from './irc-emit.js';

export const dedupeFriendNicks = (nicks: string[], mapping: IrcCaseMapping = 'rfc1459') => {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const nick of nicks) {
		const normalized = normalizeIrcIdentifier(nick, mapping);
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
	mapping: IrcCaseMapping = 'rfc1459',
) =>
	new Set(
		nicks
			.map((nick) => normalizeIrcIdentifier(nick, mapping))
			.filter((normalizedNick) => keys.has(normalizedNick)),
	);

export const filterPresenceByTrackedNicks = (
	nicks: string[],
	presenceByKey: Map<string, PresenceStatus>,
	mapping: IrcCaseMapping = 'rfc1459',
) => {
	const nextPresenceByKey = new Map<string, PresenceStatus>();
	for (const nick of nicks) {
		const normalizedNick = normalizeIrcIdentifier(nick, mapping);
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
	confirmed = false,
) => {
	const nextPresenceByKey = normalizePresenceMap(
		filterPresenceByTrackedNicks(connection.friendPresence.nicks, presenceByKey, connection.lifecycle.serverSupport.rules.caseMapping),
	);
	const nextSnapshotByKey = buildResolvedPresenceSnapshotByKey(
		connection.friendPresence.resolvedNicks,
		nextPresenceByKey,
	);
	connection.friendPresence.presenceByKey = nextPresenceByKey;
	if (confirmed) {
		emitEvent(connection, {
			type: 'friend-observation', networkId: connection.profile.id,
			transport: connection.friendPresence.activeTransport,
			presences: buildResolvedPresenceSnapshot(connection.friendPresence.nicks,
				connection.friendPresence.resolvedNicks, nextPresenceByKey, connection.lifecycle.serverSupport.rules.caseMapping),
		});
	}
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
			connection.lifecycle.serverSupport.rules.caseMapping,
		),
	);
};

const buildResolvedPresenceSnapshot = (
	nicks: string[],
	resolvedNicks: Set<string>,
	presenceByKey: Map<string, PresenceStatus>,
	mapping: IrcCaseMapping = 'rfc1459',
) =>
	Object.fromEntries(
		nicks.flatMap((nick) => {
			const normalizedNick = normalizeIrcIdentifier(nick, mapping);
			if (!resolvedNicks.has(normalizedNick)) {
				return [];
			}
			return [[nick, presenceByKey.get(normalizedNick) ?? 'offline']];
		}),
	);

const buildResolvedPresenceSnapshotByKey = (
	resolvedNicks: Set<string>,
	presenceByKey: Map<string, PresenceStatus>,
	mapping: IrcCaseMapping = 'rfc1459',
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
	mapping: IrcCaseMapping = 'rfc1459',
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

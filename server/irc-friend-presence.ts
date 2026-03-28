import type { PresenceStatus } from '../shared/protocol.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { IrcFriendPresenceContext } from './irc-contexts.js';
import { emitFriendPresence } from './irc-emit.js';
import { maxIrcCommandBytes } from './irc-limits.js';
import { createFriendPresenceReplyContext } from './irc-reply-context.js';

const friendPresencePollMs = 60_000;
const maxWhoNickBytes = maxIrcCommandBytes - Buffer.byteLength('WHO ', 'utf8');

export const setFriendNicks = (
	connection: IrcFriendPresenceContext,
	nicks: string[],
) => {
	const presence = connection.friendPresence;
	const lifecycle = connection.lifecycle;
	presence.nicks = dedupeFriendNicks(nicks);
	presence.resolvedNicks = retainTrackedPresenceKeys(
		presence.nicks,
		presence.resolvedNicks,
	);
	presence.presenceByKey = normalizePresenceMap(
		filterPresenceByTrackedNicks(presence.nicks, presence.presenceByKey),
	);
	presence.snapshotByKey = buildResolvedPresenceSnapshotByKey(
		presence.resolvedNicks,
		presence.presenceByKey,
	);
	if (
		!lifecycle.connected ||
		!lifecycle.socket ||
		!presence.enabled ||
		presence.nicks.length === 0
	) {
		presence.pendingPoll = null;
		clearFriendPresenceTimer(connection);
		return;
	}
	ensureFriendPresenceTimer(connection);
	pollFriendPresence(connection);
};

export const refreshFriendPresence = (connection: IrcFriendPresenceContext) => {
	const presence = connection.friendPresence;
	const lifecycle = connection.lifecycle;
	if (
		!lifecycle.connected ||
		!lifecycle.socket ||
		!presence.enabled ||
		presence.nicks.length === 0
	) {
		presence.pendingPoll = null;
		updateFriendPresenceStatuses(connection, new Map());
		clearFriendPresenceTimer(connection);
		return;
	}
	ensureFriendPresenceTimer(connection);
	pollFriendPresence(connection);
};

export const handleFriendPresence = (
	connection: IrcFriendPresenceContext,
	pollId: number,
	nick: string,
	presence: PresenceStatus | null,
	done: boolean,
) => {
	const pendingPoll = connection.friendPresence.pendingPoll;
	if (!pendingPoll || pendingPoll.id !== pollId) {
		return;
	}
	const normalizedNick = normalizeIrcIdentifier(nick);
	if (presence && presence !== 'offline') {
		pendingPoll.presenceByKey.set(normalizedNick, presence);
	}
	if (!done) {
		return;
	}
	pendingPoll.remainingReplies -= 1;
	if (pendingPoll.remainingReplies > 0) {
		return;
	}
	connection.friendPresence.pendingPoll = null;
	connection.friendPresence.resolvedNicks = retainTrackedPresenceKeys(
		connection.friendPresence.nicks,
		new Set([
			...connection.friendPresence.resolvedNicks,
			...pendingPoll.requestedNickKeys,
		]),
	);
	updateFriendPresenceStatuses(connection, pendingPoll.presenceByKey);
};

export const disableFriendPresence = (
	connection: IrcFriendPresenceContext,
) => {
	connection.friendPresence.enabled = false;
	connection.friendPresence.pendingPoll = null;
	connection.friendPresence.resolvedNicks.clear();
	connection.friendPresence.snapshotByKey.clear();
	clearFriendPresenceTimer(connection);
	updateFriendPresenceStatuses(connection, new Map());
};

export const ensureFriendPresenceTimer = (
	connection: IrcFriendPresenceContext,
) => {
	if (connection.friendPresence.timer) {
		return;
	}
	const timer = setInterval(
		() => pollFriendPresence(connection),
		friendPresencePollMs,
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

export const pollFriendPresence = (
	connection: IrcFriendPresenceContext,
) => {
	const lifecycle = connection.lifecycle;
	const presence = connection.friendPresence;
	if (
		!lifecycle.connected ||
		!lifecycle.socket ||
		!presence.enabled ||
		presence.nicks.length === 0
	) {
		return;
	}
	const pollableNicks = presence.nicks.filter(isPollableFriendNick);
	if (pollableNicks.length === 0) {
		presence.pendingPoll = null;
		updateFriendPresenceStatuses(connection, new Map());
		return;
	}
	const pollId = ++presence.nextPollId;
	presence.pendingPoll = {
		id: pollId,
		remainingReplies: 0,
		presenceByKey: new Map(),
		requestedNickKeys: new Set(),
	};
	for (const nick of pollableNicks) {
		if (!connection.sendRaw(`WHO ${nick}`)) {
			continue;
		}
		connection.queueReplyContext(createFriendPresenceReplyContext(pollId, nick));
		presence.pendingPoll.remainingReplies += 1;
		presence.pendingPoll.requestedNickKeys.add(normalizeIrcIdentifier(nick));
	}
	if (!presence.pendingPoll.remainingReplies) {
		presence.pendingPoll = null;
		updateFriendPresenceStatuses(connection, new Map());
	}
};

export const updateFriendPresenceStatuses = (
	connection: IrcFriendPresenceContext,
	presenceByKey: Map<string, PresenceStatus>,
) => {
	const nextPresenceByKey = normalizePresenceMap(
		filterPresenceByTrackedNicks(
			connection.friendPresence.nicks,
			presenceByKey,
		),
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

const dedupeFriendNicks = (nicks: string[]) => {
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

const filterPresenceByTrackedNicks = (
	nicks: string[],
	presenceByKey: Map<string, PresenceStatus>,
) => {
	const nextPresenceByKey = new Map<string, PresenceStatus>();
	for (const nick of nicks) {
		const normalized = normalizeIrcIdentifier(nick);
		const presence = presenceByKey.get(normalized);
		if (!presence || presence === 'offline') {
			continue;
		}
		nextPresenceByKey.set(normalized, presence);
	}
	return nextPresenceByKey;
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
			return [[
				nick,
				presenceByKey.get(normalizedNick) ?? 'offline',
			]];
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

const retainTrackedPresenceKeys = (
	nicks: string[],
	keys: Set<string>,
) =>
	new Set(
		nicks
			.map((nick) => normalizeIrcIdentifier(nick))
			.filter((normalizedNick) => keys.has(normalizedNick)),
	);

const normalizePresenceMap = (presenceByKey: Map<string, PresenceStatus>) => {
	const nextPresenceByKey = new Map<string, PresenceStatus>();
	for (const [key, presence] of presenceByKey.entries()) {
		if (presence === 'offline') {
			continue;
		}
		nextPresenceByKey.set(key, presence);
	}
	return nextPresenceByKey;
};

const isPollableFriendNick = (nick: string) =>
	Buffer.byteLength(nick, 'utf8') <= maxWhoNickBytes;

const presenceMapsEqual = (
	left: Map<string, PresenceStatus>,
	right: Map<string, PresenceStatus>,
) =>
	left.size === right.size &&
	Array.from(left.entries()).every(
		([key, presence]) => right.get(key) === presence,
	);

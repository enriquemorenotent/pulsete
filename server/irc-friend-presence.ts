import type { PresenceStatus } from '../shared/protocol.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { IrcFriendPresenceContext } from './irc-contexts.js';
import { emitFriendPresence } from './irc-emit.js';
import { maxIrcCommandBytes, maxIsonNickBytes } from './irc-limits.js';
import { createFriendPresenceIsonReplyContext } from './irc-reply-context.js';

const friendPresenceRefreshMs = 5 * 60_000;
const maxMonitorCommandNickBytes =
	maxIrcCommandBytes - Buffer.byteLength('MONITOR + ', 'utf8');
const maxTrackedPresenceNickBytes = Math.min(
	maxIsonNickBytes,
	maxMonitorCommandNickBytes,
);

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
	if (
		presenceMapsEqual(connection.friendPresence.snapshotByKey, nextSnapshotByKey)
	) {
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

const resolveFriendPresenceTransport = (
	presence: IrcFriendPresenceContext['friendPresence'],
) => {
	const trackableNickCount = presence.nicks.filter(isTrackablePresenceNick).length;
	if (!presence.enabled || trackableNickCount === 0) {
		return null;
	}
	if (
		presence.monitorSupported &&
		(presence.monitorLimit === null || trackableNickCount <= presence.monitorLimit)
	) {
		return 'monitor' as const;
	}
	return 'ison' as const;
};

const syncMonitorSubscriptions = (
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

const requestIsonSnapshot = (
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

const clearMonitorSubscriptions = (
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
		const normalizedNick = normalizeIrcIdentifier(nick);
		const presence = presenceByKey.get(normalizedNick);
		if (!presence || presence === 'offline') {
			continue;
		}
		nextPresenceByKey.set(normalizedNick, presence);
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

const retainTrackedPresenceKeys = (
	nicks: string[],
	keys: Set<string>,
) =>
	new Set(
		nicks
			.map((nick) => normalizeIrcIdentifier(nick))
			.filter((normalizedNick) => keys.has(normalizedNick)),
	);

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

const buildTrackableNickMap = (nicks: string[]) => {
	const trackableNicks = new Map<string, string>();
	for (const nick of nicks) {
		if (!isTrackablePresenceNick(nick)) {
			continue;
		}
		trackableNicks.set(normalizeIrcIdentifier(nick), nick);
	}
	return trackableNicks;
};

const buildCommandBatches = (
	nicks: string[],
	separator: ',' | ' ',
	prefix: string,
) => {
	const maxPayloadBytes =
		maxIrcCommandBytes - Buffer.byteLength(prefix, 'utf8');
	const separatorBytes = Buffer.byteLength(separator, 'utf8');
	const batches: string[][] = [];
	let currentBatch: string[] = [];
	let currentBytes = 0;
	for (const nick of nicks) {
		const nickBytes = Buffer.byteLength(nick, 'utf8');
		if (nickBytes > maxPayloadBytes) {
			continue;
		}
		const nextBytes =
			currentBytes +
			(currentBatch.length === 0 ? 0 : separatorBytes) +
			nickBytes;
		if (currentBatch.length > 0 && nextBytes > maxPayloadBytes) {
			batches.push(currentBatch);
			currentBatch = [nick];
			currentBytes = nickBytes;
			continue;
		}
		currentBatch.push(nick);
		currentBytes = nextBytes;
	}
	if (currentBatch.length > 0) {
		batches.push(currentBatch);
	}
	return batches;
};

const isTrackablePresenceNick = (nick: string) =>
	Buffer.byteLength(nick, 'utf8') <= maxTrackedPresenceNickBytes;

const isTrackedMonitorNick = (
	presence: IrcFriendPresenceContext['friendPresence'],
	normalizedNick: string,
) =>
	presence.registeredMonitorNicks.has(normalizedNick) ||
	presence.nicks.some(
		(nick) => normalizeIrcIdentifier(nick) === normalizedNick,
	);

const presenceMapsEqual = (
	left: Map<string, PresenceStatus>,
	right: Map<string, PresenceStatus>,
) =>
	left.size === right.size &&
	Array.from(left.entries()).every(
		([key, presence]) => right.get(key) === presence,
	);

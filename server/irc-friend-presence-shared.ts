import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { maxIrcCommandBytes, maxIsonNickBytes } from './irc-limits.js';
import type {
	FriendPresenceTransportMode,
	IrcFriendPresenceState,
} from './irc-state-types.js';

export const friendPresenceRefreshMs = 5 * 60_000;
const maxMonitorCommandNickBytes =
	maxIrcCommandBytes - Buffer.byteLength('MONITOR + ', 'utf8');
const maxTrackedPresenceNickBytes = Math.min(
	maxIsonNickBytes,
	maxMonitorCommandNickBytes,
);

export const resolveFriendPresenceTransport = (
	presence: IrcFriendPresenceState,
): FriendPresenceTransportMode | null => {
	const trackableNickCount = presence.nicks.filter(isTrackablePresenceNick).length;
	if (!presence.enabled || trackableNickCount === 0) {
		return null;
	}
	if (
		presence.monitorSupported &&
		(presence.monitorLimit === null || trackableNickCount <= presence.monitorLimit)
	) {
		return 'monitor';
	}
	return 'ison';
};

export const buildTrackableNickMap = (nicks: string[]) => {
	const trackableNicks = new Map<string, string>();
	for (const nick of nicks) {
		if (!isTrackablePresenceNick(nick)) {
			continue;
		}
		trackableNicks.set(normalizeIrcIdentifier(nick), nick);
	}
	return trackableNicks;
};

export const buildCommandBatches = (
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

export const isTrackedMonitorNick = (
	presence: IrcFriendPresenceState,
	normalizedNick: string,
) =>
	presence.registeredMonitorNicks.has(normalizedNick) ||
	presence.nicks.some(
		(nick) => normalizeIrcIdentifier(nick) === normalizedNick,
	);

const isTrackablePresenceNick = (nick: string) =>
	Buffer.byteLength(nick, 'utf8') <= maxTrackedPresenceNickBytes;

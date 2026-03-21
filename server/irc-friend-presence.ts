import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { emitFriendPresence } from './irc-emit.js';
import { maxIrcCommandBytes, maxIsonNickBytes } from './irc-limits.js';
import { createFriendPresenceReplyContext } from './irc-reply-context.js';
import type { IrcConnection } from './irc.js';

const friendPresencePollMs = 60_000;

export const setFriendNicks = (connection: IrcConnection, nicks: string[]) => {
  connection.friendNicks = dedupeFriendNicks(nicks);
  const currentOnline = connection.friendNicks.filter(
    (nick) => connection.onlineFriendKeys.has(normalizeIrcIdentifier(nick))
  );
  updateOnlineFriendKeys(connection, currentOnline);
  if (!connection.connected || !connection.socket || !connection.friendPresenceEnabled || connection.friendNicks.length === 0) {
    connection.pendingFriendPresencePoll = null;
    clearFriendPresenceTimer(connection);
    return;
  }
  ensureFriendPresenceTimer(connection);
  pollFriendPresence(connection);
};

export const refreshFriendPresence = (connection: IrcConnection) => {
  if (!connection.connected || !connection.socket || !connection.friendPresenceEnabled || connection.friendNicks.length === 0) {
    connection.pendingFriendPresencePoll = null;
    updateOnlineFriendKeys(connection, []);
    clearFriendPresenceTimer(connection);
    return;
  }
  ensureFriendPresenceTimer(connection);
  pollFriendPresence(connection);
};

export const handleFriendPresence = (connection: IrcConnection, pollId: number, onlineNicks: string[]) => {
  const pendingPoll = connection.pendingFriendPresencePoll;
  if (!pendingPoll || pendingPoll.id !== pollId) {
    return;
  }
  pendingPoll.onlineNicks = mergeUniqueNicks(pendingPoll.onlineNicks, onlineNicks);
  pendingPoll.remainingResponses -= 1;
  if (pendingPoll.remainingResponses > 0) {
    return;
  }
  connection.pendingFriendPresencePoll = null;
  updateOnlineFriendKeys(connection, pendingPoll.onlineNicks);
};

export const disableFriendPresence = (connection: IrcConnection) => {
  connection.friendPresenceEnabled = false;
  connection.pendingFriendPresencePoll = null;
  clearFriendPresenceTimer(connection);
  updateOnlineFriendKeys(connection, []);
};

export const ensureFriendPresenceTimer = (connection: IrcConnection) => {
  if (connection.friendPresenceTimer) {
    return;
  }
  const timer = setInterval(() => pollFriendPresence(connection), friendPresencePollMs);
  timer.unref?.();
  connection.friendPresenceTimer = timer;
};

export const clearFriendPresenceTimer = (connection: IrcConnection) => {
  if (!connection.friendPresenceTimer) {
    return;
  }
  clearInterval(connection.friendPresenceTimer);
  connection.friendPresenceTimer = null;
};

export const pollFriendPresence = (connection: IrcConnection) => {
  if (!connection.connected || !connection.socket || !connection.friendPresenceEnabled || connection.friendNicks.length === 0) {
    return;
  }
  const batches = splitIsonNickBatches(connection.friendNicks);
  if (batches.length === 0) {
    connection.pendingFriendPresencePoll = null;
    updateOnlineFriendKeys(connection, []);
    return;
  }
  const pollId = ++connection.nextFriendPresencePollId;
  connection.pendingFriendPresencePoll = {
    id: pollId,
    remainingResponses: batches.length,
    onlineNicks: [],
  };
  let sentBatches = 0;
  for (const batch of batches) {
    if (connection.sendRaw(`ISON ${batch.join(' ')}`)) {
      connection.queueReplyContext(createFriendPresenceReplyContext(pollId));
      sentBatches += 1;
    }
  }
  if (sentBatches === 0) {
    connection.pendingFriendPresencePoll = null;
    updateOnlineFriendKeys(connection, []);
    return;
  }
  connection.pendingFriendPresencePoll.remainingResponses = sentBatches;
};

export const updateOnlineFriendKeys = (connection: IrcConnection, onlineNicks: string[]) => {
  const nextKeys = new Set(onlineNicks.map(normalizeIrcIdentifier));
  if (setsEqual(connection.onlineFriendKeys, nextKeys)) {
    return;
  }
  connection.onlineFriendKeys = nextKeys;
  emitFriendPresence(connection, onlineNicks);
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

const mergeUniqueNicks = (current: string[], next: string[]) => {
  const seen = new Set(current.map(normalizeIrcIdentifier));
  const merged = [...current];
  for (const nick of next) {
    const normalized = normalizeIrcIdentifier(nick);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(nick);
  }
  return merged;
};

const splitIsonNickBatches = (nicks: string[]) => {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchBytes = Buffer.byteLength('ISON ', 'utf8');
  for (const nick of nicks) {
    const separatorBytes = batch.length === 0 ? 0 : 1;
    const nickBytes = Buffer.byteLength(nick, 'utf8');
    if (nickBytes > maxIsonNickBytes) {
      continue;
    }
    if (batch.length > 0 && batchBytes + separatorBytes + nickBytes > maxIrcCommandBytes) {
      batches.push(batch);
      batch = [nick];
      batchBytes = Buffer.byteLength('ISON ', 'utf8') + nickBytes;
      continue;
    }
    batch.push(nick);
    batchBytes += separatorBytes + nickBytes;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
};

const setsEqual = (left: Set<string>, right: Set<string>) =>
  left.size === right.size && Array.from(left).every((value) => right.has(value));

import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { IrcFriendPresenceContext } from './irc-contexts.js';
import { emitFriendPresence } from './irc-emit.js';
import { maxIrcCommandBytes, maxIsonNickBytes } from './irc-limits.js';
import { createFriendPresenceReplyContext } from './irc-reply-context.js';

const friendPresencePollMs = 60_000;

export const setFriendNicks = (connection: IrcFriendPresenceContext, nicks: string[]) => {
  const presence = connection.friendPresence;
  const lifecycle = connection.lifecycle;
  presence.nicks = dedupeFriendNicks(nicks);
  const currentOnline = presence.nicks.filter(
    (nick) => presence.onlineKeys.has(normalizeIrcIdentifier(nick))
  );
  updateOnlineFriendKeys(connection, currentOnline);
  if (!lifecycle.connected || !lifecycle.socket || !presence.enabled || presence.nicks.length === 0) {
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
  if (!lifecycle.connected || !lifecycle.socket || !presence.enabled || presence.nicks.length === 0) {
    presence.pendingPoll = null;
    updateOnlineFriendKeys(connection, []);
    clearFriendPresenceTimer(connection);
    return;
  }
  ensureFriendPresenceTimer(connection);
  pollFriendPresence(connection);
};

export const handleFriendPresence = (
  connection: IrcFriendPresenceContext,
  pollId: number,
  onlineNicks: string[]
) => {
  const pendingPoll = connection.friendPresence.pendingPoll;
  if (!pendingPoll || pendingPoll.id !== pollId) {
    return;
  }
  pendingPoll.onlineNicks = mergeUniqueNicks(pendingPoll.onlineNicks, onlineNicks);
  pendingPoll.remainingResponses -= 1;
  if (pendingPoll.remainingResponses > 0) {
    return;
  }
  connection.friendPresence.pendingPoll = null;
  updateOnlineFriendKeys(connection, pendingPoll.onlineNicks);
};

export const disableFriendPresence = (connection: IrcFriendPresenceContext) => {
  connection.friendPresence.enabled = false;
  connection.friendPresence.pendingPoll = null;
  clearFriendPresenceTimer(connection);
  updateOnlineFriendKeys(connection, []);
};

export const ensureFriendPresenceTimer = (connection: IrcFriendPresenceContext) => {
  if (connection.friendPresence.timer) {
    return;
  }
  const timer = setInterval(() => pollFriendPresence(connection), friendPresencePollMs);
  timer.unref?.();
  connection.friendPresence.timer = timer;
};

export const clearFriendPresenceTimer = (connection: IrcFriendPresenceContext) => {
  const timer = connection.friendPresence.timer;
  if (!timer) {
    return;
  }
  clearInterval(timer);
  connection.friendPresence.timer = null;
};

export const pollFriendPresence = (connection: IrcFriendPresenceContext) => {
  const lifecycle = connection.lifecycle;
  const presence = connection.friendPresence;
  if (!lifecycle.connected || !lifecycle.socket || !presence.enabled || presence.nicks.length === 0) {
    return;
  }
  const batches = splitIsonNickBatches(presence.nicks);
  if (batches.length === 0) {
    presence.pendingPoll = null;
    updateOnlineFriendKeys(connection, []);
    return;
  }
  const pollId = ++presence.nextPollId;
  presence.pendingPoll = {
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
    presence.pendingPoll = null;
    updateOnlineFriendKeys(connection, []);
    return;
  }
  if (presence.pendingPoll) {
    presence.pendingPoll.remainingResponses = sentBatches;
  }
};

export const updateOnlineFriendKeys = (connection: IrcFriendPresenceContext, onlineNicks: string[]) => {
  const nextKeys = new Set(onlineNicks.map(normalizeIrcIdentifier));
  if (setsEqual(connection.friendPresence.onlineKeys, nextKeys)) {
    return;
  }
  connection.friendPresence.onlineKeys = nextKeys;
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

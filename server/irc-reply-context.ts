import { isSameIrcIdentifier } from './irc-parser.js';

type ChannelReplyOperation = 'join' | 'part' | 'topic-set' | 'topic-query' | 'names';

export type PendingReplyContext =
  | { kind: 'message'; sourceTarget: string; target: string; expiresAt: number }
  | { kind: 'whois'; sourceTarget: string; nick: string; expiresAt: number }
  | { kind: 'raw-target'; sourceTarget: string; command: 'MODE'; target: string; expiresAt: number }
  | { kind: 'raw-list'; sourceTarget: string; expiresAt: number }
  | { kind: 'channel-list'; requestId: string; expiresAt: number }
  | {
      kind: 'channel';
      sourceTarget: string;
      channel: string;
      operation: ChannelReplyOperation;
      failedJoinBufferId?: string;
      requestedTopic?: string;
      expiresAt: number;
    }
  | { kind: 'nick'; sourceTarget: string; requestedNick: string; expiresAt: number }
  | { kind: 'ison'; sourceTarget: string; expiresAt: number }
  | { kind: 'friend-presence'; pollId: number; expiresAt: number };

const replyContextTtlMs = 15_000;
const messageErrorNumerics = new Set(['401', '404', '408', '411', '412', '413', '414', '716', '717']);
const whoisReplyNumerics = new Set(['301', '311', '312', '313', '317', '318', '319', '330', '338', '401', '402']);
const nickReplyNumerics = new Set(['431', '432', '433', '436', '437']);
const joinReplyNumerics = new Set(['403', '405', '437', '471', '472', '473', '474', '475', '476', '477']);
const partReplyNumerics = new Set(['442']);
const topicSetReplyNumerics = new Set(['442', '482']);
const topicQueryReplyNumerics = new Set(['331', '332']);
const namesReplyNumerics = new Set(['353', '366']);
const channelListReplyNumerics = new Set(['321', '322', '323', '263', '421', '461']);
const rawModeTargetedReplyNumerics = new Set(['401', '402']);
const rawModeUntargetedReplyNumerics = new Set(['221', '501', '502']);
const rawModeReplyNumerics = new Set([...rawModeTargetedReplyNumerics, ...rawModeUntargetedReplyNumerics]);
const fifoReplyNumerics = new Set([
  ...whoisReplyNumerics,
  ...joinReplyNumerics,
  ...partReplyNumerics,
  ...topicSetReplyNumerics,
  ...topicQueryReplyNumerics,
  ...channelListReplyNumerics,
  ...namesReplyNumerics,
  ...rawModeReplyNumerics,
]);

export const createMessageReplyContext = (sourceTarget: string, target: string): PendingReplyContext => ({
  kind: 'message',
  sourceTarget,
  target,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createWhoisReplyContext = (sourceTarget: string, nick: string): PendingReplyContext => ({
  kind: 'whois',
  sourceTarget,
  nick,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createRawTargetReplyContext = (
  sourceTarget: string,
  command: 'MODE',
  target: string
): PendingReplyContext => ({
  kind: 'raw-target',
  sourceTarget,
  command,
  target,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createRawListReplyContext = (sourceTarget: string): PendingReplyContext => ({
  kind: 'raw-list',
  sourceTarget,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createChannelListReplyContext = (requestId: string): PendingReplyContext => ({
  kind: 'channel-list',
  requestId,
  expiresAt: Number.POSITIVE_INFINITY,
});

export const createChannelReplyContext = (
  sourceTarget: string,
  channel: string,
  operation: ChannelReplyOperation,
  options: { failedJoinBufferId?: string; requestedTopic?: string } = {}
): PendingReplyContext => ({
  kind: 'channel',
  sourceTarget,
  channel,
  operation,
  failedJoinBufferId: options.failedJoinBufferId,
  requestedTopic: options.requestedTopic,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createNickReplyContext = (sourceTarget: string, requestedNick: string): PendingReplyContext => ({
  kind: 'nick',
  sourceTarget,
  requestedNick,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createIsonReplyContext = (sourceTarget: string): PendingReplyContext => ({
  kind: 'ison',
  sourceTarget,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createFriendPresenceReplyContext = (pollId: number): PendingReplyContext => ({
  kind: 'friend-presence',
  pollId,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createReplyContextFromRaw = (sourceTarget: string, raw: string): PendingReplyContext | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const [commandToken = '', ...rest] = trimmed.split(/\s+/);
  const command = commandToken.toUpperCase();

  if (command === 'PRIVMSG' && rest[0]) {
    return createMessageReplyContext(sourceTarget, rest[0]);
  }

  if (command === 'WHOIS') {
    const nick = rest.at(-1);
    return nick ? createWhoisReplyContext(sourceTarget, nick) : null;
  }

  if (command === 'ISON') {
    return createIsonReplyContext(sourceTarget);
  }

  if (command === 'LIST') {
    return createRawListReplyContext(sourceTarget);
  }

  if (command === 'TOPIC' && rest[0]) {
    return createChannelReplyContext(
      rest.length === 1 ? 'server' : sourceTarget,
      rest[0],
      rest.length === 1 ? 'topic-query' : 'topic-set',
      rest.length === 1 ? {} : { requestedTopic: rest.slice(1).join(' ').replace(/^:/, '') }
    );
  }

  if ((command === 'JOIN' || command === 'PART') && rest[0]) {
    const operation = command.toLowerCase() as 'join' | 'part';
    return createChannelReplyContext(sourceTarget, rest[0], operation);
  }

  if (command === 'MODE' && rest[0] && !isChannelTarget(rest[0])) {
    return createRawTargetReplyContext('server', 'MODE', rest[0]);
  }

  if (command === 'NAMES' && rest[0] && isChannelTarget(rest[0])) {
    return createChannelReplyContext('server', rest[0], 'names');
  }

  if (command === 'NICK' && rest[0]) {
    return createNickReplyContext(sourceTarget, rest[0]);
  }

  return null;
};

export const getLatestPendingNick = (contexts: PendingReplyContext[]) => {
  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    const context = contexts[index];
    if (context?.kind === 'nick') {
      return context.requestedNick;
    }
  }
  return null;
};

type ReplyResolution = {
  matched: boolean;
  done: boolean;
};

export const consumeReplyTarget = (
  contexts: PendingReplyContext[],
  command: string,
  params: string[],
  nick: string | null,
  rawTarget?: string
) => {
  const context = consumeReplyContext(contexts, command, params, nick, rawTarget);
  if (!context || !('sourceTarget' in context)) {
    return null;
  }
  return context.sourceTarget;
};

export const consumeReplyContext = (
  contexts: PendingReplyContext[],
  command: string,
  params: string[],
  _nick: string | null,
  _rawTarget?: string
) => {
  const now = Date.now();

  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    if (contexts[index]!.expiresAt < now) {
      contexts.splice(index, 1);
    }
  }

  const matches: Array<{ index: number; context: PendingReplyContext; resolution: ReplyResolution }> = [];
  for (let index = 0; index < contexts.length; index += 1) {
    const context = contexts[index];
    if (!context) {
      continue;
    }
    const resolution = resolveReplyContext(context, command, params);
    if (!resolution.matched) {
      continue;
    }
    matches.push({ index, context, resolution });
  }

  if (matches.length === 0) {
    return null;
  }

  const highestPriority = Math.max(...matches.map((match) => getReplyPriority(match.context)));
  const prioritized = matches.filter((match) => getReplyPriority(match.context) === highestPriority);
  if (isAmbiguousReplyMatch(prioritized, command) || shouldDiscardUntargetedRawModeMatches(prioritized, command)) {
    discardReplyContexts(contexts, prioritized);
    return null;
  }

  const selected = selectReplyContext(prioritized, command, params);
  if (!selected) {
    return null;
  }
  if (selected.resolution.done) {
    const exactDuplicateIndexes = getExactDuplicateReplyIndexes(prioritized, selected);
    if (exactDuplicateIndexes.length > 0) {
      discardReplyIndexes(contexts, exactDuplicateIndexes);
    } else {
      contexts.splice(selected.index, 1);
    }
  }
  return selected.context;
};

const resolveReplyContext = (
  context: PendingReplyContext,
  command: string,
  params: string[]
): ReplyResolution => {
  if (context.kind === 'message') {
    if (messageErrorNumerics.has(command) && isSameIrcIdentifier(params[1] ?? '', context.target)) {
      return { matched: true, done: true };
    }
    return { matched: false, done: false };
  }

  if (context.kind === 'whois') {
    if (!whoisReplyNumerics.has(command) || !isSameIrcIdentifier(params[1] ?? '', context.nick)) {
      return { matched: false, done: false };
    }
    return { matched: true, done: command === '318' || /^[45]\d{2}$/.test(command) };
  }

  if (context.kind === 'raw-target') {
    if (
      context.command !== 'MODE'
      || !rawModeReplyNumerics.has(command)
    ) {
      return { matched: false, done: false };
    }
    if (rawModeUntargetedReplyNumerics.has(command)) {
      return { matched: true, done: true };
    }
    if (!isSameIrcIdentifier(params[1] ?? '', context.target)) {
      return { matched: false, done: false };
    }
    return { matched: true, done: true };
  }

  if (context.kind === 'raw-list') {
    if (!channelListReplyNumerics.has(command)) {
      return { matched: false, done: false };
    }
    if (command === '421' || command === '461' || command === '263') {
      return (params[1] ?? '').toUpperCase() === 'LIST'
        ? { matched: true, done: true }
        : { matched: false, done: false };
    }
    return { matched: true, done: command === '323' };
  }

  if (context.kind === 'channel-list') {
    if (!channelListReplyNumerics.has(command)) {
      return { matched: false, done: false };
    }
    if (command === '421' || command === '461' || command === '263') {
      return (params[1] ?? '').toUpperCase() === 'LIST'
        ? { matched: true, done: true }
        : { matched: false, done: false };
    }
    return { matched: true, done: command === '323' };
  }

  if (context.kind === 'channel') {
    return resolveChannelReplyContext(context, command, params);
  }

  if (context.kind === 'nick') {
    return nickReplyNumerics.has(command)
      && !(command === '437' && isChannelTarget(params[1] ?? ''))
      && matchesNickReply(context, command, params)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  if (context.kind === 'ison' || context.kind === 'friend-presence') {
    return isIsonReply(command, params)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  return { matched: false, done: false };
};

const resolveChannelReplyContext = (
  context: Extract<PendingReplyContext, { kind: 'channel' }>,
  command: string,
  params: string[]
): ReplyResolution => {
  const replyChannel = getChannelReplyTarget(command, params);
  if (!replyChannel || !isSameIrcIdentifier(replyChannel, context.channel)) {
    return { matched: false, done: false };
  }

  if (context.operation === 'join') {
    return joinReplyNumerics.has(command)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  if (context.operation === 'part') {
    return partReplyNumerics.has(command)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  if (context.operation === 'topic-set') {
    return topicSetReplyNumerics.has(command)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  if (context.operation === 'topic-query') {
    return topicQueryReplyNumerics.has(command)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  if (context.operation === 'names') {
    return namesReplyNumerics.has(command)
      ? { matched: true, done: command === '366' }
      : { matched: false, done: false };
  }

  return { matched: false, done: false };
};

const getChannelReplyTarget = (command: string, params: string[]) => {
  if (command === '353') {
    return params[2] ?? '';
  }
  return params[1] ?? '';
};

const matchesNickReply = (
  context: Extract<PendingReplyContext, { kind: 'nick' }>,
  command: string,
  params: string[]
) => {
  if (command === '431') {
    return true;
  }
  return isSameIrcIdentifier(params[1] ?? '', context.requestedNick);
};

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
const selectReplyContext = (
  matches: Array<{ index: number; context: PendingReplyContext; resolution: ReplyResolution }>,
  command: string,
  params: string[]
) => {
  if (prefersFifoReplyOrder(command, params)) {
    return matches.reduce((best, candidate) => (candidate.index < best.index ? candidate : best));
  }
  return matches.reduce((best, candidate) => (candidate.index > best.index ? candidate : best));
};

const getReplyPriority = (context: PendingReplyContext) => {
  if (context.kind === 'message') {
    return 0;
  }
  if (context.kind === 'channel') {
    return 1;
  }
  if (
    context.kind === 'channel-list'
    || context.kind === 'raw-list'
    || context.kind === 'whois'
    || context.kind === 'raw-target'
    || context.kind === 'nick'
  ) {
    return 2;
  }
  return 3;
};

const isAmbiguousReplyMatch = (
  matches: Array<{ index: number; context: PendingReplyContext; resolution: ReplyResolution }>,
  command: string
) => {
  if (matches.length < 2 || command !== '442') {
    return false;
  }
  const channelMatches = matches.filter(
    (
      match
    ): match is {
      index: number;
      context: Extract<PendingReplyContext, { kind: 'channel' }>;
      resolution: ReplyResolution;
    } => match.context.kind === 'channel'
  );
  if (channelMatches.length < 2) {
    return false;
  }
  const operations = new Set(channelMatches.map((match) => match.context.operation));
  return operations.size > 1;
};

const shouldDiscardUntargetedRawModeMatches = (
  matches: Array<{ index: number; context: PendingReplyContext; resolution: ReplyResolution }>,
  command: string
) =>
  matches.length > 1
  && rawModeUntargetedReplyNumerics.has(command)
  && matches.every((match) => match.context.kind === 'raw-target');

const discardReplyContexts = (
  contexts: PendingReplyContext[],
  matches: Array<{ index: number; context: PendingReplyContext; resolution: ReplyResolution }>
) => {
  const discardIndexes = matches
    .filter((match) => match.resolution.done)
    .map((match) => match.index)
  discardReplyIndexes(contexts, discardIndexes);
};

const getExactDuplicateReplyIndexes = (
  matches: Array<{ index: number; context: PendingReplyContext; resolution: ReplyResolution }>,
  selected: { index: number; context: PendingReplyContext; resolution: ReplyResolution }
) => {
  if (selected.context.kind === 'nick') {
    const selectedContext = selected.context;
    return matches
      .filter(
        (match) =>
          match.context.kind === 'nick'
          && isSameIrcIdentifier(match.context.requestedNick, selectedContext.requestedNick)
      )
      .map((match) => match.index);
  }
  if (selected.context.kind === 'raw-target') {
    const selectedContext = selected.context;
    return matches
      .filter(
        (match) =>
          match.context.kind === 'raw-target'
          && match.context.command === selectedContext.command
          && isSameIrcIdentifier(match.context.target, selectedContext.target)
      )
      .map((match) => match.index);
  }
  if (selected.context.kind === 'channel') {
    const selectedContext = selected.context;
    return matches
      .filter(
        (match) =>
          match.context.kind === 'channel'
          && match.context.operation === selectedContext.operation
          && isSameIrcIdentifier(match.context.channel, selectedContext.channel)
          && (
            selectedContext.operation !== 'topic-set'
            || match.context.requestedTopic === selectedContext.requestedTopic
          )
      )
      .map((match) => match.index);
  }
  return [];
};

const discardReplyIndexes = (contexts: PendingReplyContext[], indexes: number[]) => {
  const discardIndexes = indexes.slice().sort((left, right) => right - left);
  for (const index of discardIndexes) {
    contexts.splice(index, 1);
  }
};

const prefersFifoReplyOrder = (command: string, params: string[]) =>
  isIsonReply(command, params) || fifoReplyNumerics.has(command);
const isIsonReply = (command: string, params: string[]) =>
  command === '303' || (command === '421' && (params[1] ?? '').toUpperCase() === 'ISON');

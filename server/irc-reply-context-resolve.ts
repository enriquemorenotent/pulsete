import { isChannelTarget, isSameIrcIdentifier } from './irc-parser.js';
import { matchesServiceTargetNick } from './irc-services.js';
import {
  commandReplyBurstIdleMs,
  type PendingReplyContext,
} from './irc-reply-context-types.js';

export type ReplyResolution = {
  matched: boolean;
  done: boolean;
};

export type ReplyMatch = {
  index: number;
  context: PendingReplyContext;
  resolution: ReplyResolution;
};

type MessageReplyContext = Extract<PendingReplyContext, { kind: 'message' }>;

const messageErrorNumerics = new Set(['401', '404', '408', '411', '412', '413', '414', '716', '717']);
const whoisReplyNumerics = new Set([
  '276',
  '301',
  '307',
  '310',
  '311',
  '312',
  '313',
  '317',
  '318',
  '319',
  '320',
  '330',
  '335',
  '338',
  '378',
  '379',
  '401',
  '402',
  '671',
]);
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
const friendPresenceIsonReplyNumerics = new Set(['303', '421']);

export const resolveReplyContext = (
  context: PendingReplyContext,
  command: string,
  params: string[],
  nick: string | null,
): ReplyResolution => {
  if (context.kind === 'message') {
    const matchesBurstReplyNick = matchesMessageReplyNick(context, nick);
    const matchesMessageTarget = !!nick
      && (
        isSameIrcIdentifier(nick, context.target)
        || matchesServiceTargetNick(nick, context.target)
      );
    if (
      command === 'NOTICE'
      && !isChannelTarget(context.target)
      && matchesMessageTarget
      && matchesBurstReplyNick
    ) {
      return { matched: true, done: context.completion !== 'burst' };
    }
    if (
      command === 'NOTICE'
      && context.commandLike
      && isChannelTarget(context.sourceTarget)
      && isChannelTarget(context.target)
      && matchesBurstReplyNick
    ) {
      return { matched: true, done: context.completion !== 'burst' };
    }
    return messageErrorNumerics.has(command) && isSameIrcIdentifier(params[1] ?? '', context.target)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }
  if (context.kind === 'whois') {
    if (!whoisReplyNumerics.has(command) || !isSameIrcIdentifier(params[1] ?? '', context.nick)) {
      return { matched: false, done: false };
    }
    return { matched: true, done: command === '318' || /^[45]\d{2}$/.test(command) };
  }
  if (context.kind === 'raw-target') {
    if (context.command !== 'MODE' || !rawModeReplyNumerics.has(command)) {
      return { matched: false, done: false };
    }
    if (rawModeUntargetedReplyNumerics.has(command)) {
      return { matched: true, done: true };
    }
    return isSameIrcIdentifier(params[1] ?? '', context.target)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }
  if (context.kind === 'raw-list' || context.kind === 'channel-list') {
    return resolveListReply(command, params, channelListReplyNumerics);
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
  if (context.kind === 'ison') {
    return isIsonReply(command, params)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }
  if (context.kind === 'friend-presence-ison') {
    if (!isIsonReply(command, params) || !friendPresenceIsonReplyNumerics.has(command)) {
      return { matched: false, done: false };
    }
    return { matched: true, done: true };
  }
  return { matched: false, done: false };
};

export const getReplyPriority = (context: PendingReplyContext) => {
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

export const isIsonReply = (command: string, params: string[]) =>
  command === '303' || (command === '421' && (params[1] ?? '').toUpperCase() === 'ISON');

export const prefersFifoReplyOrder = (command: string, params: string[]) =>
  isIsonReply(command, params) || fifoReplyNumerics.has(command);

export const rawModeUsesUntargetedReply = (command: string) => rawModeUntargetedReplyNumerics.has(command);

export const refreshReplyContextAfterMatch = (
  context: PendingReplyContext,
  nick: string | null,
) => {
  if (context.kind !== 'message' || context.completion !== 'burst') {
    return;
  }
  if (!context.replyNick && nick) {
    context.replyNick = nick;
  }
  const maxExpiresAt = context.maxExpiresAt ?? context.expiresAt;
  context.expiresAt = Math.min(Date.now() + commandReplyBurstIdleMs, maxExpiresAt);
};

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

const resolveListReply = (command: string, params: string[], numerics: Set<string>): ReplyResolution => {
  if (!numerics.has(command)) {
    return { matched: false, done: false };
  }
  if (command === '421' || command === '461' || command === '263') {
    return (params[1] ?? '').toUpperCase() === 'LIST'
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }
  return { matched: true, done: command === '323' };
};

const resolveChannelReplyContext = (
  context: Extract<PendingReplyContext, { kind: 'channel' }>,
  command: string,
  params: string[]
): ReplyResolution => {
  const replyChannel = command === '353' ? params[2] ?? '' : params[1] ?? '';
  if (!replyChannel || !isSameIrcIdentifier(replyChannel, context.channel)) {
    return { matched: false, done: false };
  }
  if (context.operation === 'join') {
    return joinReplyNumerics.has(command) ? { matched: true, done: true } : { matched: false, done: false };
  }
  if (context.operation === 'part') {
    return partReplyNumerics.has(command) ? { matched: true, done: true } : { matched: false, done: false };
  }
  if (context.operation === 'topic-set') {
    return topicSetReplyNumerics.has(command) ? { matched: true, done: true } : { matched: false, done: false };
  }
  if (context.operation === 'topic-query') {
    return topicQueryReplyNumerics.has(command) ? { matched: true, done: true } : { matched: false, done: false };
  }
  return namesReplyNumerics.has(command)
    ? { matched: true, done: command === '366' }
    : { matched: false, done: false };
};

const matchesNickReply = (
  context: Extract<PendingReplyContext, { kind: 'nick' }>,
  command: string,
  params: string[]
) => command === '431' || isSameIrcIdentifier(params[1] ?? '', context.requestedNick);

const matchesMessageReplyNick = (
  context: MessageReplyContext,
  nick: string | null,
) => !context.replyNick || (!!nick && isSameIrcIdentifier(nick, context.replyNick));

import { isSameIrcIdentifier } from './irc-parser.js';
import { isServiceNick } from './irc-services.js';

export type PendingReplyContext =
  | { kind: 'message'; sourceTarget: string; target: string; expiresAt: number }
  | { kind: 'whois'; sourceTarget: string; nick: string; expiresAt: number }
  | { kind: 'channel'; sourceTarget: string; channel: string; expiresAt: number }
  | { kind: 'nick'; sourceTarget: string; expiresAt: number }
  | { kind: 'generic'; sourceTarget: string; expiresAt: number };

const replyContextTtlMs = 15_000;
const messageErrorNumerics = new Set(['401', '404', '408', '411', '412', '413', '414', '716', '717']);
const whoisReplyNumerics = new Set(['301', '311', '312', '313', '317', '318', '319', '330', '338', '401', '402']);
const channelReplyNumerics = new Set(['403', '405', '442', '471', '472', '473', '474', '475', '476', '477', '482']);
const nickReplyNumerics = new Set(['431', '432', '433', '436', '437']);

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

export const createChannelReplyContext = (sourceTarget: string, channel: string): PendingReplyContext => ({
  kind: 'channel',
  sourceTarget,
  channel,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createNickReplyContext = (sourceTarget: string): PendingReplyContext => ({
  kind: 'nick',
  sourceTarget,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createGenericReplyContext = (sourceTarget: string): PendingReplyContext => ({
  kind: 'generic',
  sourceTarget,
  expiresAt: Date.now() + replyContextTtlMs,
});

export const createReplyContextFromRaw = (sourceTarget: string, raw: string): PendingReplyContext | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const [commandToken = '', ...rest] = trimmed.split(/\s+/);
  const command = commandToken.toUpperCase();

  if ((command === 'PRIVMSG' || command === 'NOTICE') && rest[0]) {
    return createMessageReplyContext(sourceTarget, rest[0]);
  }

  if (command === 'WHOIS') {
    const nick = rest.at(-1);
    return nick ? createWhoisReplyContext(sourceTarget, nick) : createGenericReplyContext(sourceTarget);
  }

  if ((command === 'JOIN' || command === 'PART' || command === 'TOPIC') && rest[0]) {
    return createChannelReplyContext(sourceTarget, rest[0]);
  }

  if (command === 'NICK') {
    return createNickReplyContext(sourceTarget);
  }

  return createGenericReplyContext(sourceTarget);
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
  const now = Date.now();

  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    if (contexts[index]!.expiresAt < now) {
      contexts.splice(index, 1);
    }
  }

  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    const resolution = resolveReplyContext(contexts[index]!, command, params, nick, rawTarget);
    if (!resolution.matched) {
      continue;
    }
    const sourceTarget = contexts[index]!.sourceTarget;
    if (resolution.done) {
      contexts.splice(index, 1);
    }
    return sourceTarget;
  }

  return null;
};

const resolveReplyContext = (
  context: PendingReplyContext,
  command: string,
  params: string[],
  nick: string | null,
  rawTarget?: string
): ReplyResolution => {
  if (context.kind === 'message') {
    if (messageErrorNumerics.has(command) && isSameIrcIdentifier(params[1] ?? '', context.target)) {
      return { matched: true, done: true };
    }
    if (command === 'NOTICE' && rawTarget && !isServiceNick(nick) && !isChannelTarget(rawTarget)) {
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

  if (context.kind === 'channel') {
    return channelReplyNumerics.has(command) && isSameIrcIdentifier(params[1] ?? '', context.channel)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  if (context.kind === 'nick') {
    return nickReplyNumerics.has(command)
      ? { matched: true, done: true }
      : { matched: false, done: false };
  }

  const isDirectServerNotice = command === 'NOTICE'
    && rawTarget
    && !isChannelTarget(rawTarget)
    && !isServiceNick(nick);

  return /^\d{3}$/.test(command) || isDirectServerNotice
    ? { matched: true, done: true }
    : { matched: false, done: false };
};

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

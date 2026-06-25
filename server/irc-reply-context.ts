import {
  createChannelListReplyContext,
  createChannelReplyContext,
  createFriendPresenceIsonReplyContext,
  createIsonReplyContext,
  createMessageReplyContext,
  createNickReplyContext,
  createRawListReplyContext,
  createRawTargetReplyContext,
  createReplyContextFromRaw,
  createWhoisReplyContext,
} from './irc-reply-context-create.js';
import {
  getReplyPriority,
  prefersFifoReplyOrder,
  refreshReplyContextAfterMatch,
  resolveReplyContext,
  type ReplyMatch,
} from './irc-reply-context-resolve.js';
import {
  getExactDuplicateReplyIndexes,
  isAmbiguousReplyMatch,
  selectReplyContext,
  shouldDiscardUntargetedRawModeMatches,
} from './irc-reply-context-select.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import { isChannelTarget, isSameIrcIdentifier } from './irc-parser.js';

export type { PendingReplyContext } from './irc-reply-context-types.js';
export {
  createChannelListReplyContext,
  createChannelReplyContext,
  createFriendPresenceIsonReplyContext,
  createIsonReplyContext,
  createMessageReplyContext,
  createNickReplyContext,
  createRawListReplyContext,
  createRawTargetReplyContext,
  createReplyContextFromRaw,
  createWhoisReplyContext,
};

export const consumeReplyTarget = (
  contexts: PendingReplyContext[],
  command: string,
  params: string[],
  nick: string | null,
  rawTarget?: string,
  label?: string | null
) => {
  const context = consumeReplyContext(contexts, command, params, nick, rawTarget, label);
  if (!context || !('sourceTarget' in context)) {
    return null;
  }
  return context.sourceTarget;
};

export const consumeReplyContext = (
  contexts: PendingReplyContext[],
  command: string,
  params: string[],
  nick: string | null,
  _rawTarget?: string,
  label?: string | null
) => {
  const now = Date.now();

  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    if (contexts[index]!.expiresAt < now) {
      contexts.splice(index, 1);
    }
  }

  const candidateIndexes = label
    ? contexts
      .map((context, index) => (context?.label === label ? index : -1))
      .filter((index) => index !== -1)
    : contexts.map((_context, index) => index);

  const matches: ReplyMatch[] = [];
  for (const index of candidateIndexes) {
    const context = contexts[index];
    if (!context) {
      continue;
    }
    if (label && context.label === label) {
      const labeledResolution = resolveLabeledReplyContext(context, command, params, nick);
      if (labeledResolution.matched) {
        matches.push({ index, context, resolution: labeledResolution });
        continue;
      }
    }
    const messageAwayResolution = resolveMessageAwayReplyContext(context, command, params);
    if (messageAwayResolution.matched) {
      matches.push({ index, context, resolution: messageAwayResolution });
      continue;
    }
    const resolution = resolveReplyContext(context, command, params, nick);
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

  const selected = selectReplyContext(prioritized, prefersFifoReplyOrder(command, params));
  if (selected.resolution.done) {
    const exactDuplicateIndexes = getExactDuplicateReplyIndexes(prioritized, selected);
    if (exactDuplicateIndexes.length > 0) {
      discardReplyIndexes(contexts, exactDuplicateIndexes);
    } else {
      contexts.splice(selected.index, 1);
    }
  } else {
    refreshReplyContextAfterMatch(selected.context, nick);
  }
  retargetMessageAwayContext(selected.context, command);
  return selected.context;
};

const resolveMessageAwayReplyContext = (
  context: PendingReplyContext,
  command: string,
  params: string[],
) => (
  context.kind === 'message'
  && command === '301'
  && isSameIrcIdentifier(params[1] ?? '', context.target)
    ? { matched: true, done: true }
    : { matched: false, done: false }
);

const retargetMessageAwayContext = (context: PendingReplyContext, command: string) => {
  if (context.kind === 'message' && command === '301') {
    context.sourceTarget = context.target;
  }
};

const resolveLabeledReplyContext = (
  context: PendingReplyContext,
  command: string,
  params: string[],
  nick: string | null,
) => {
  if (command === 'ACK' || command === 'FAIL' || command === 'WARN' || command === 'NOTE') {
    return { matched: true, done: true };
  }
  if (
    (command === 'PRIVMSG' || command === 'NOTICE' || command === 'TAGMSG')
    && context.kind === 'message'
  ) {
    const rawTarget = params[0] ?? '';
    const matchesDirectTarget = !isChannelTarget(context.target) && isSameIrcIdentifier(rawTarget, context.target);
    const matchesSelfEcho = isChannelTarget(context.target) && isSameIrcIdentifier(rawTarget, context.target);
    if ((matchesDirectTarget || matchesSelfEcho) && (nick || rawTarget)) {
      return { matched: true, done: true };
    }
  }
  return resolveReplyContext(context, command, params, nick);
};
const discardReplyContexts = (contexts: PendingReplyContext[], matches: ReplyMatch[]) => {
  const discardIndexes = matches
    .filter((match) => match.resolution.done)
    .map((match) => match.index);
  discardReplyIndexes(contexts, discardIndexes);
};

const discardReplyIndexes = (contexts: PendingReplyContext[], indexes: number[]) => {
  const discardIndexes = indexes.slice().sort((left, right) => right - left);
  for (const index of discardIndexes) {
    contexts.splice(index, 1);
  }
};

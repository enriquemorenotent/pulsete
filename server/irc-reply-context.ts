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
  nick: string | null,
  _rawTarget?: string
) => {
  const now = Date.now();

  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    if (contexts[index]!.expiresAt < now) {
      contexts.splice(index, 1);
    }
  }

  const matches: ReplyMatch[] = [];
  for (let index = 0; index < contexts.length; index += 1) {
    const context = contexts[index];
    if (!context) {
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
  }
  return selected.context;
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

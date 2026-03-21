import { isSameIrcIdentifier } from './irc-parser.js';
import type { PendingReplyContext } from './irc-reply-context-types.js';
import { type ReplyMatch, rawModeUsesUntargetedReply } from './irc-reply-context-resolve.js';

export const selectReplyContext = (matches: ReplyMatch[], preferFifo: boolean) =>
  matches.reduce((best, candidate) => (
    preferFifo
      ? candidate.index < best.index
      : candidate.index > best.index
  ) ? candidate : best);

export const isAmbiguousReplyMatch = (matches: ReplyMatch[], command: string) => {
  if (matches.length < 2 || command !== '442') {
    return false;
  }
  const channelMatches = matches.filter(
    (match): match is ReplyMatch & { context: Extract<PendingReplyContext, { kind: 'channel' }> } =>
      match.context.kind === 'channel'
  );
  return channelMatches.length >= 2
    && new Set(channelMatches.map((match) => match.context.operation)).size > 1;
};

export const shouldDiscardUntargetedRawModeMatches = (matches: ReplyMatch[], command: string) =>
  matches.length > 1
  && rawModeUsesUntargetedReply(command)
  && matches.every((match) => match.context.kind === 'raw-target');

export const getExactDuplicateReplyIndexes = (
  matches: ReplyMatch[],
  selected: ReplyMatch
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
  if (selected.context.kind !== 'channel') {
    return [];
  }
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
};

import { isSameIrcIdentifier } from './irc-parser.js';
import {
  consumeReplyContext,
  consumeReplyTarget,
  type PendingReplyContext,
} from './irc-reply-context.js';

type PendingChannelReplyContext = Extract<PendingReplyContext, { kind: 'channel' }>;
type PendingNickReplyContext = Extract<PendingReplyContext, { kind: 'nick' }>;

export class ReplyTracker {
  private readonly contexts: PendingReplyContext[] = [];
  private pendingNickValue: string | null = null;

  get pendingReplyContexts(): readonly PendingReplyContext[] {
    return this.contexts;
  }

  get pendingNick() {
    return this.pendingNickValue;
  }

  setPendingNick(value: string | null) {
    this.pendingNickValue = value;
  }

  clearPendingNick() {
    this.pendingNickValue = null;
  }

  reset() {
    this.contexts.length = 0;
    this.clearPendingNick();
  }

  prune() {
    const now = Date.now();
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index];
      if (!context || context.expiresAt >= now) {
        continue;
      }
      this.contexts.splice(index, 1);
    }
  }

  queue(context: PendingReplyContext) {
    this.contexts.push(context);
    if (context.kind === 'nick') {
      this.pendingNickValue = context.requestedNick;
    }
  }

  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string, label?: string | null) {
    this.prune();
    const target = consumeReplyTarget(this.contexts, command, params, nick, rawTarget, label);
    this.refreshPendingNick();
    return target;
  }

  consumeReplyContext(command: string, params: string[], nick: string | null, rawTarget?: string, label?: string | null) {
    this.prune();
    const context = consumeReplyContext(this.contexts, command, params, nick, rawTarget, label);
    this.refreshPendingNick();
    return context;
  }

  discardPendingChannelReplyContexts(
    channel: string,
    predicate?: (context: PendingChannelReplyContext) => boolean
  ) {
    const contexts: PendingChannelReplyContext[] = [];
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index];
      if (
        context?.kind === 'channel'
        && isSameIrcIdentifier(context.channel, channel)
        && (!predicate || predicate(context))
      ) {
        contexts.push(this.contexts.splice(index, 1)[0] as PendingChannelReplyContext);
      }
    }
    return contexts;
  }

  consumePendingNickReplyContexts(requestedNick: string) {
    const contexts: PendingNickReplyContext[] = [];
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index];
      if (context?.kind === 'nick' && isSameIrcIdentifier(context.requestedNick, requestedNick)) {
        contexts.push(this.contexts.splice(index, 1)[0] as PendingNickReplyContext);
      }
    }
    this.refreshPendingNick();
    return contexts;
  }

  discardPendingNickReplyContexts() {
    const contexts: PendingNickReplyContext[] = [];
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index];
      if (context?.kind === 'nick') {
        contexts.push(this.contexts.splice(index, 1)[0] as PendingNickReplyContext);
      }
    }
    this.refreshPendingNick();
    return contexts;
  }

  private refreshPendingNick() {
    this.pendingNickValue = findLatestPendingNick(this.contexts);
  }
}

const findLatestPendingNick = (contexts: readonly PendingReplyContext[]) => {
  for (let index = contexts.length - 1; index >= 0; index -= 1) {
    const context = contexts[index];
    if (context?.kind === 'nick') {
      return context.requestedNick;
    }
  }
  return null;
};

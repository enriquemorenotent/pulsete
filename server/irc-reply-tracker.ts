import { defaultIrcServerRules, type IrcServerRules } from '../shared/irc-server-rules.js';
import { canRetainLateReply } from './irc-reply-context-types.js';
import { OutgoingActions } from './irc-outgoing-actions.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import {
  consumeReplyContext,
  type PendingReplyContext,
} from './irc-reply-context.js';

type PendingChannelReplyContext = Extract<PendingReplyContext, { kind: 'channel' }>;
type PendingNickReplyContext = Extract<PendingReplyContext, { kind: 'nick' }>;

export class ReplyTracker {
  constructor(private readonly getRules: () => IrcServerRules = () => defaultIrcServerRules) {}
  readonly actions = new OutgoingActions();
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
    this.actions.disconnect();
    this.contexts.length = 0;
    this.clearPendingNick();
  }

  prune() {
    const now = Date.now();
    this.actions.expire(now);
    let changed = false;
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index];
      if (!context || context.expiresAt >= now || canRetainLateReply(context)) {
        continue;
      }
      context.action?.finish('unknown');
      this.remove(context);
      changed = true;
    }
    if (changed) {
      this.refreshPendingNick();
    }
  }

  queue(context: PendingReplyContext) {
    context.rules = this.getRules();
    this.prune();
    context.action = this.actions.start(context.expiresAt, () => {
      if (context.kind === 'message' && context.label) {
        // Only exact labels can safely resolve a late reply after a timeout.
        const retained = this.contexts.filter(entry => entry.action?.state === 'unknown');
        for (const entry of retained.slice(0, Math.max(0, retained.length - 256))) this.remove(entry);
      } else {
        this.remove(context);
      }
    });
    this.contexts.push(context);
    if (context.kind === 'nick') {
      this.pendingNickValue = context.requestedNick;
    }
  }

  consumeReplyTarget(command: string, params: string[], nick: string | null, rawTarget?: string, label?: string | null) {
    this.prune();
    const context = this.consumeReplyContext(command, params, nick, rawTarget, label);
    return context && 'sourceTarget' in context ? context.sourceTarget : null;
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
        && isSameIrcIdentifier(context.channel, channel, this.getRules().caseMapping)
        && (!predicate || predicate(context))
      ) {
        context.action?.finish('unknown');
        contexts.push(this.contexts.splice(index, 1)[0] as PendingChannelReplyContext);
      }
    }
    return contexts;
  }

  consumePendingNickReplyContexts(requestedNick: string) {
    const contexts: PendingNickReplyContext[] = [];
    for (let index = this.contexts.length - 1; index >= 0; index -= 1) {
      const context = this.contexts[index];
      if (context?.kind === 'nick' && isSameIrcIdentifier(context.requestedNick, requestedNick, this.getRules().caseMapping)) {
        context.action?.finish('confirmed');
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
        context.action?.finish('cancelled');
        contexts.push(this.contexts.splice(index, 1)[0] as PendingNickReplyContext);
      }
    }
    this.refreshPendingNick();
    return contexts;
  }

  private remove(context: PendingReplyContext) {
    const index = this.contexts.indexOf(context);
    if (index !== -1) this.contexts.splice(index, 1);
    this.refreshPendingNick();
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

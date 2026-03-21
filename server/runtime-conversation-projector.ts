import { randomUUID } from 'node:crypto';
import type { MessageKind, ServerMessage } from '../shared/protocol.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import {
  appendConversationMessage,
  upsertConversationChannel,
} from './runtime-conversation-store.js';
import type { MessageInput, Storage } from './storage.js';

export class RuntimeConversationProjector {
  constructor(private readonly store: Storage) {}

  handleStatusEvent(event: Extract<RuntimeEvent, { type: 'status' }>) {
    const kind: MessageKind = event.kind === 'error'
      ? 'error'
      : event.kind === 'notice'
        ? 'notice'
        : 'system';
    const messages = this.appendMessage({
      id: randomUUID(),
      networkId: event.networkId,
      target: this.resolveStatusTarget(event),
      nick: null,
      body: event.message,
      kind,
      self: false,
      ts: Date.now(),
    });
    if (event.kind !== 'system') {
      messages.push({
        type: event.kind === 'error' ? 'error' : 'notice',
        networkId: event.networkId,
        message: event.message,
      });
    }
    return messages;
  }

  handleMessageEvent(event: Extract<RuntimeEvent, { type: 'message' }>) {
    const removedChannel = event.message.self && event.message.kind === 'part'
      ? this.store.getChannelByName(event.message.networkId, event.message.target)
      : null;
    if (event.message.self && event.message.kind === 'part' && !removedChannel) {
      return [];
    }

    const messages = this.appendMessage(event.message);

    const closedServiceQuery = !event.message.self
      && event.message.target === 'server'
      && !!event.message.nick
      && isServiceNick(event.message.nick)
      ? this.store.getBufferByTarget(event.message.networkId, event.message.nick)
      : null;

    if (closedServiceQuery?.kind === 'query') {
      this.store.removeBuffer(closedServiceQuery.id);
      messages.push({
        type: 'buffer.remove',
        networkId: closedServiceQuery.networkId,
        bufferId: closedServiceQuery.id,
      });
    }

    if (removedChannel) {
      this.store.deleteChannelByName(event.message.networkId, event.message.target);
      messages.push({ type: 'buffer.remove', networkId: removedChannel.networkId, bufferId: removedChannel.id });
    }
    return messages;
  }

  handleChannelEvent(event: Extract<RuntimeEvent, { type: 'channel' }>) {
    const { buffer, channel } = upsertConversationChannel(this.store, event);
    return [
      { type: 'buffer.upsert', buffer },
      { type: 'channel.snapshot', channel },
    ] satisfies ServerMessage[];
  }

  private appendMessage(message: MessageInput) {
    const { saved, bufferUpdate } = appendConversationMessage(this.store, message);
    const messages: ServerMessage[] = [{ type: 'message.append', message: saved }];

    if (bufferUpdate) {
      messages.push({ type: 'buffer.upsert', buffer: bufferUpdate });
    }
    return messages;
  }

  private resolveStatusTarget(event: Extract<RuntimeEvent, { type: 'status' }>) {
    if (!event.target || event.target === 'server') {
      return 'server';
    }
    const boundTarget = this.store.getBufferByTarget(event.networkId, event.target)?.target;
    if (boundTarget) {
      return boundTarget;
    }
    if (isChannelTarget(event.target) || event.requireBoundTarget) {
      return 'server';
    }
    return event.target;
  }
}

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

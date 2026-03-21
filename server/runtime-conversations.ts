import { randomUUID } from 'node:crypto';
import type { BufferState, MessageKind, ServerMessage } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import type { MessageInput, Storage } from './storage.js';

type RuntimeConversationsOptions = {
  store: Storage;
  send(message: ServerMessage): void;
};

export class RuntimeConversations {
  private readonly store: Storage;
  private readonly send: RuntimeConversationsOptions['send'];

  constructor(options: RuntimeConversationsOptions) {
    this.store = options.store;
    this.send = options.send;
  }

  openQuery(networkId: string, target: string) {
    const buffer = this.store.upsertQuery(networkId, target);
    this.send({ type: 'buffer.upsert', buffer });
    return buffer;
  }

  closeQueryBuffer(bufferId: string) {
    const buffer = this.getRequiredBuffer(bufferId);
    if (buffer.kind !== 'query') {
      throw badRequest('Only private message buffers can be closed');
    }
    const removedBuffer = this.store.removeBuffer(bufferId) ?? buffer;
    this.send({ type: 'buffer.remove', networkId: removedBuffer.networkId, bufferId: removedBuffer.id });
    return removedBuffer;
  }

  markBufferRead(bufferId: string) {
    const buffer = this.getRequiredBuffer(bufferId);
    if (buffer.unread === 0) {
      return buffer;
    }
    this.store.markBufferRead(bufferId);
    const updatedBuffer = this.getRequiredBuffer(bufferId);
    this.send({ type: 'buffer.upsert', buffer: updatedBuffer });
    return updatedBuffer;
  }

  listBufferHistory(bufferId: string, limit: number) {
    const buffer = this.getRequiredBuffer(bufferId);
    return this.store.listMessages(buffer.networkId, buffer.target, limit);
  }

  handleStatusEvent(event: Extract<RuntimeEvent, { type: 'status' }>) {
    const kind: MessageKind = event.kind === 'error'
      ? 'error'
      : event.kind === 'notice'
        ? 'notice'
        : 'system';
    this.appendMessage({
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
      this.send({
        type: event.kind === 'error' ? 'error' : 'notice',
        networkId: event.networkId,
        message: event.message,
      });
    }
  }

  handleMessageEvent(event: Extract<RuntimeEvent, { type: 'message' }>) {
    const removedChannel = event.message.self && event.message.kind === 'part'
      ? this.store.getChannelByName(event.message.networkId, event.message.target)
      : null;
    if (event.message.self && event.message.kind === 'part' && !removedChannel) {
      return;
    }

    this.appendMessage(event.message);

    const closedServiceQuery = !event.message.self
      && event.message.target === 'server'
      && !!event.message.nick
      && isServiceNick(event.message.nick)
      ? this.store.getBufferByTarget(event.message.networkId, event.message.nick)
      : null;

    if (closedServiceQuery?.kind === 'query') {
      this.store.removeBuffer(closedServiceQuery.id);
      this.send({ type: 'buffer.remove', networkId: closedServiceQuery.networkId, bufferId: closedServiceQuery.id });
    }

    if (removedChannel) {
      this.store.deleteChannelByName(event.message.networkId, event.message.target);
      this.send({ type: 'buffer.remove', networkId: removedChannel.networkId, bufferId: removedChannel.id });
    }
  }

  handleChannelEvent(event: Extract<RuntimeEvent, { type: 'channel' }>) {
    const channel = this.store.upsertChannel({
      id: this.store.getChannelByName(event.networkId, event.channel)?.id ?? randomUUID(),
      networkId: event.networkId,
      name: event.channel,
      topic: event.topic,
      users: event.users,
    });
    this.send({ type: 'buffer.upsert', buffer: this.store.getBuffer(channel.id)! });
    this.send({ type: 'channel.snapshot', channel });
  }

  private appendMessage(message: MessageInput) {
    const bufferUpdate = this.resolveMessageBuffer(message);
    const saved = this.store.appendMessage(message);

    this.send({ type: 'message.append', message: saved });
    if (bufferUpdate) {
      this.send({ type: 'buffer.upsert', buffer: bufferUpdate });
    }
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

  private resolveMessageBuffer(message: MessageInput) {
    const existing = this.store.getBufferByTarget(message.networkId, message.target);
    const created = existing ?? this.createMessageBuffer(message);
    if (!created) {
      return null;
    }

    const unread = shouldIncrementUnread(message) ? created.unread + 1 : created.unread;
    if (unread === created.unread) {
      return created;
    }
    this.store.setBufferUnread(created.id, unread);
    return this.store.getBuffer(created.id);
  }

  private createMessageBuffer(message: MessageInput): BufferState | null {
    if (message.target === 'server') {
      return this.store.getServerBuffer(message.networkId)
        ?? this.store.upsertBuffer({ networkId: message.networkId, kind: 'server', target: 'server' });
    }
    if (isChannelTarget(message.target)) {
      if (message.self && message.kind === 'part') {
        return null;
      }
      return this.store.upsertBuffer({ networkId: message.networkId, kind: 'channel', target: message.target });
    }
    if (message.kind === 'line') {
      return this.store.upsertBuffer({ networkId: message.networkId, kind: 'query', target: message.target });
    }
    return null;
  }

  private getRequiredBuffer(bufferId: string) {
    const buffer = this.store.getBuffer(bufferId);
    if (!buffer) {
      throw notFound('Buffer not found');
    }
    return buffer;
  }
}

const shouldIncrementUnread = (message: MessageInput) =>
  !message.self && (message.target === 'server' || message.kind !== 'system');

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

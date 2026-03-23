import { randomUUID } from 'node:crypto';
import type { MessageKind, ServerMessage } from '../shared/protocol.js';
import { normalizeQueryTarget } from './irc-validate.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import {
  appendConversationMessage,
  closeConversationQueryBuffer,
  listConversationBufferHistory,
  markConversationBufferRead,
  openConversationQuery,
  upsertConversationChannel,
} from './runtime-conversation-store.js';
import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';
import type { MessageInput } from './storage-types.js';

type RuntimeConversationServiceOptions = {
  conversations: RuntimeConversationStore;
  networks: Pick<RuntimeNetworkStore, 'get'>;
};

export class RuntimeConversationService {
  constructor(private readonly options: RuntimeConversationServiceOptions) {}

  openQuery(networkId: string, target: string) {
    requireStoredNetwork(this.options.networks, networkId);
    const buffer = openConversationQuery(this.options.conversations, networkId, normalizeQueryTarget(target));
    const messages = [{ type: 'buffer.upsert', buffer } satisfies ServerMessage];
    return { buffer, messages };
  }

  closeQueryBuffer(bufferId: string) {
    const removedBuffer = closeConversationQueryBuffer(this.options.conversations, bufferId);
    const messages = [{
      type: 'buffer.remove',
      networkId: removedBuffer.networkId,
      bufferId: removedBuffer.id,
    } satisfies ServerMessage];
    return { buffer: removedBuffer, messages };
  }

  markBufferRead(bufferId: string) {
    const updatedBuffer = markConversationBufferRead(this.options.conversations, bufferId);
    const messages = [{ type: 'buffer.upsert', buffer: updatedBuffer } satisfies ServerMessage];
    return { buffer: updatedBuffer, messages };
  }

  listBufferHistory(bufferId: string, limit: number) {
    return listConversationBufferHistory(this.options.conversations, bufferId, limit);
  }

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
      ? this.options.conversations.getChannelByName(event.message.networkId, event.message.target)
      : null;
    if (event.message.self && event.message.kind === 'part' && !removedChannel) {
      return [];
    }

    const messages = this.appendMessage(event.message);

    const closedServiceQuery = !event.message.self
      && event.message.target === 'server'
      && !!event.message.nick
      && isServiceNick(event.message.nick)
      ? this.options.conversations.getBufferByTarget(event.message.networkId, event.message.nick)
      : null;

    if (closedServiceQuery?.kind === 'query') {
      this.options.conversations.removeBuffer(closedServiceQuery.id);
      messages.push({
        type: 'buffer.remove',
        networkId: closedServiceQuery.networkId,
        bufferId: closedServiceQuery.id,
      });
    }

    if (removedChannel) {
      this.options.conversations.deleteChannelByName(event.message.networkId, event.message.target);
      messages.push({ type: 'buffer.remove', networkId: removedChannel.networkId, bufferId: removedChannel.id });
    }
    return messages;
  }

  handleChannelEvent(event: Extract<RuntimeEvent, { type: 'channel' }>) {
    const { buffer, channel } = upsertConversationChannel(this.options.conversations, event);
    return [
      { type: 'buffer.upsert', buffer },
      { type: 'channel.snapshot', channel },
    ] satisfies ServerMessage[];
  }

  private appendMessage(message: MessageInput) {
    const { saved, bufferUpdate } = appendConversationMessage(this.options.conversations, message);
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
    const boundTarget = this.options.conversations.getBufferByTarget(event.networkId, event.target)?.target;
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

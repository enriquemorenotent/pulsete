import type { BufferState, ChatMessage } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';

export const matchesBufferMessage = (buffer: BufferState, message: ChatMessage) =>
  message.networkId === buffer.networkId && isSameIrcIdentifier(message.target, buffer.target);

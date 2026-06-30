import { badRequest, notFound } from './app-error.js';
import { aiAssistantMessageLimit } from '../shared/protocol-ai.js';
import type { AiAssistantContext } from '../shared/protocol-ai.js';
import type { ChatMessage } from '../shared/protocol-chat.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';

export const buildAiAssistantContext = (
  conversations: RuntimeConversationStore,
  bufferId: string,
): AiAssistantContext => {
  const buffer = conversations.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  if (buffer.kind === 'server') {
    throw badRequest('Assistant is available in channels and private messages');
  }
  return {
    buffer: {
      id: buffer.id,
      kind: buffer.kind,
      networkId: buffer.networkId,
      target: buffer.target,
    },
    messages: conversations.listRecentMessagesForBuffer(
      buffer.networkId,
      buffer.target,
      aiAssistantMessageLimit,
    ),
  };
};

export const renderAiAssistantMessages = (messages: readonly ChatMessage[]) =>
  messages.map(renderAiAssistantMessage).join('\n');

const renderAiAssistantMessage = (message: ChatMessage) => {
  const nick = message.speakerNick ?? message.nick ?? (message.self ? 'me' : 'unknown');
  return `[${new Date(message.ts).toISOString()}] ${nick}: ${message.body}`;
};

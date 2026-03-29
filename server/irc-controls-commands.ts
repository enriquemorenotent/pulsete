import { hasNegotiatedCapability } from './irc-capabilities.js';
import { createSelfActionMessage, createSelfMessage, sendTrackedRaw } from './irc-connection-io.js';
import { emitMessage, emitStatus } from './irc-emit.js';
import { createChannelReplyContext, createMessageReplyContext } from './irc-reply-context.js';
import type { IrcConnectionState } from './irc-types.js';

const isCommandLikeMessage = (text: string) => text.trimStart().startsWith('!');

export const createIrcCommandControls = (connection: IrcConnectionState) => ({
  join: (channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) => {
    if (!connection.lifecycle.connected) {
      emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!connection.sendRaw(`JOIN ${channel}`, sourceTarget)) {
      return false;
    }
    const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
    connection.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
    return true;
  },
  part: (channel: string, reason = 'Leaving', sourceTarget = channel) => {
    if (connection.getChannelSession(channel)?.phase === 'joined') {
      connection.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
    }
    return sendTrackedRaw(connection, `PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
  },
  say: (target: string, text: string, sourceTarget = target) => {
    const useEchoMessage = hasNegotiatedCapability(connection.lifecycle.capabilities, 'echo-message');
    const selfMessage = useEchoMessage ? null : createSelfMessage(connection, target, text);
    if (sendTrackedRaw(
      connection,
      `PRIVMSG ${target} :${text}`,
      sourceTarget,
      createMessageReplyContext(sourceTarget, target, selfMessage?.id, 'PRIVMSG', isCommandLikeMessage(text)),
    ) && selfMessage) {
      emitMessage(connection, selfMessage);
    }
  },
  action: (target: string, text: string, sourceTarget = target) => {
    const useEchoMessage = hasNegotiatedCapability(connection.lifecycle.capabilities, 'echo-message');
    const selfMessage = useEchoMessage ? null : createSelfActionMessage(connection, target, text);
    if (
      sendTrackedRaw(
        connection,
        `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`,
        sourceTarget,
        createMessageReplyContext(sourceTarget, target, selfMessage?.id),
      )
      && selfMessage
    ) {
      emitMessage(connection, selfMessage);
    }
  },
});

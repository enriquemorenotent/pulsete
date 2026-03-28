import { randomUUID } from 'node:crypto';
import type { IrcClientIoContext, IrcRawIoContext } from './irc-contexts.js';
import { emitStatus } from './irc-emit.js';
import { handleIrcLine } from './irc-handle-line.js';
import { maxBufferedIrcBytes, maxIrcCommandBytes } from './irc-limits.js';
import { createReplyContextFromRaw, type PendingReplyContext } from './irc-reply-context.js';
import type { IrcConnectionState } from './irc-types.js';
import { resolveRuntimeMessageAttribution } from './message-attribution.js';
import { hasNegotiatedCapability } from './irc-capabilities.js';
import { encodeIrcMessageTags, parseIrcMessageTags } from './irc-message-tags.js';
import type { MessageInput } from './storage-types.js';
import { parseRawIrcClientCommand } from '../shared/irc-client-command.js';

export const sendRaw = (connection: IrcRawIoContext, raw: string, statusTarget?: string) => {
  const lifecycle = connection.lifecycle;
  if (!lifecycle.socket) {
    emitStatus(connection, 'Not connected', 'error', statusTarget);
    return false;
  }
  if (Buffer.byteLength(raw, 'utf8') > maxIrcCommandBytes) {
    emitStatus(connection, `IRC command exceeds the ${maxIrcCommandBytes}-byte limit`, 'error', statusTarget);
    return false;
  }
  try {
    lifecycle.socket.write(`${raw}\r\n`);
  } catch {
    lifecycle.lastFailureMessage = 'Connection is no longer writable';
    emitStatus(connection, lifecycle.lastFailureMessage, 'error', statusTarget);
    lifecycle.socket.destroy();
    return false;
  }
  return true;
};

export const sendClientRaw = (connection: IrcClientIoContext, raw: string, sourceTarget = 'server'): boolean => {
  connection.prunePendingReplyContexts();
  const parsed = parseRawIrcClientCommand(raw);
  if (!parsed) {
    return false;
  }
  if (parsed.name === 'join' && parsed.args[0]) {
    return connection.join(parsed.args[0], sourceTarget, { visiblePending: true });
  }
  if (parsed.name === 'part' && parsed.args[0]) {
    return connection.part(
      parsed.args[0],
      parsed.args.slice(1).join(' ').replace(/^:/, '') || 'Leaving',
      sourceTarget
    );
  }
  const replyContext = createReplyContextFromRaw(sourceTarget, raw);
  if (parsed.name === 'list') {
    if (connection.isChannelListPending()) {
      emitStatus(connection, connection.getChannelListRequestFailureMessage(), 'error', sourceTarget);
      return false;
    }
    if (!connection.lifecycle.connected) {
      emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
      return false;
    }
    if (!sendRaw(connection, raw, sourceTarget)) {
      return false;
    }
    connection.startChannelList('raw', { sourceTarget });
    return true;
  }
  return sendTrackedRaw(connection, raw, sourceTarget, replyContext);
};

export const consume = (connection: IrcConnectionState, chunk: string) => {
  connection.lifecycle.buffer += chunk;
  let newlineIndex = connection.lifecycle.buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = connection.lifecycle.buffer.slice(0, newlineIndex).replace(/\r$/, '');
    connection.lifecycle.buffer = connection.lifecycle.buffer.slice(newlineIndex + 1);
    if (Buffer.byteLength(line, 'utf8') > maxBufferedIrcBytes) {
      handleOversizedServerLine(connection);
      return;
    }
    if (line.length > 0) {
      handleIrcLine(connection, line);
    }
    newlineIndex = connection.lifecycle.buffer.indexOf('\n');
  }
  if (Buffer.byteLength(connection.lifecycle.buffer, 'utf8') > maxBufferedIrcBytes) {
    handleOversizedServerLine(connection);
  }
};

export const createSelfMessage = (
  connection: IrcRawIoContext,
  target: string,
  body: string,
  id = randomUUID()
): MessageInput => {
  const message: MessageInput = {
    id,
    networkId: connection.profile.id,
    target,
    nick: connection.lifecycle.currentNick,
    body,
    kind: 'line',
    self: true,
    ts: Date.now(),
  };
  return {
    ...message,
    ...resolveRuntimeMessageAttribution(message),
  };
};

export const createSelfActionMessage = (
  connection: IrcRawIoContext,
  target: string,
  body: string,
  id = randomUUID()
): MessageInput => {
  const message: MessageInput = {
    id,
    networkId: connection.profile.id,
    target,
    nick: connection.lifecycle.currentNick,
    body,
    kind: 'action',
    self: true,
    ts: Date.now(),
  };
  return {
    ...message,
    ...resolveRuntimeMessageAttribution(message),
  };
};

export const sendTrackedRaw = (
  connection: IrcClientIoContext,
  raw: string,
  sourceTarget: string,
  replyContext: PendingReplyContext | null
) => {
  if (!connection.lifecycle.connected) {
    emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
    return false;
  }
  const labeledReplyContext = replyContext ? attachReplyLabel(connection, raw, replyContext) : null;
  const outgoingRaw = labeledReplyContext?.raw ?? raw;
  if (!sendRaw(connection, outgoingRaw, sourceTarget)) {
    return false;
  }
  if (labeledReplyContext?.context) {
    connection.queueReplyContext(labeledReplyContext.context);
  } else if (replyContext) {
    connection.queueReplyContext(replyContext);
  }
  return true;
};

const handleOversizedServerLine = (connection: IrcRawIoContext) => {
  connection.lifecycle.buffer = '';
  connection.lifecycle.lastFailureMessage = 'Server sent an oversized IRC line';
  emitStatus(connection, connection.lifecycle.lastFailureMessage, 'error');
  connection.lifecycle.socket?.destroy();
};

const attachReplyLabel = (
  connection: Pick<IrcConnectionState, 'lifecycle'>,
  raw: string,
  replyContext: PendingReplyContext,
) => {
  if (!hasNegotiatedCapability(connection.lifecycle.capabilities, 'labeled-response')) {
    return null;
  }
  const label = `lr${(connection.lifecycle.capabilities.nextLabelId += 1).toString(36)}`;
  return {
    raw: applyLabelToRaw(raw, label),
    context: {
      ...replyContext,
      label,
    },
  };
};

const applyLabelToRaw = (raw: string, label: string) => {
  const match = raw.match(/^@([^ ]+)\s+(.*)$/);
  if (!match) {
    return `@label=${label} ${raw}`;
  }
  const tags = parseIrcMessageTags(match[1] ?? '');
  tags.label ??= label;
  return `@${encodeIrcMessageTags(tags)} ${match[2] ?? ''}`.trimEnd();
};

import { randomUUID } from 'node:crypto';
import {
  isSameIrcIdentifier,
  normalizeIrcIdentifier,
} from '../shared/irc-identifiers.js';
import type {
  BufferHistoryImportSummary,
  HistoryImportFormat,
  HistoryImportTextFile,
} from '../shared/protocol.js';
import type { BufferState, ChatMessage } from '../shared/protocol.js';
import { badRequest } from './app-error.js';
import {
  matchesNickAlias,
  normalizeNickAliases,
  resolveImportedChannelAttribution,
  resolveImportedSpeakerAttribution,
} from './message-attribution.js';
import {
  parseHexChatLogFile,
  type ParsedLogMessage,
  type ParserResult,
} from './history-import-hexchat.js';
import type { MessageInput } from './storage-types.js';

type ImportLogFilesParams = {
  buffer: BufferState;
  existingMessages: ChatMessage[];
  files: HistoryImportTextFile[];
  selfNicks: string[];
  importBatchId?: string | null;
};

type ImportedMessage = MessageInput & {
  order: number;
};

type Parser = (file: HistoryImportTextFile) => ParserResult;

const logParsers: Parser[] = [parseHexChatLogFile];

export const importLogFiles = ({
  buffer,
  existingMessages,
  files,
  selfNicks,
  importBatchId = null,
}: ImportLogFilesParams): {
  messages: MessageInput[];
  summary: BufferHistoryImportSummary;
} => {
  let skippedCount = 0;
  let currentOrder = 0;
  let detectedFormat: HistoryImportFormat | null = null;
  const parsedMessages: ParsedLogMessage[] = [];

  for (const file of files) {
    const parsed = parseLogFile(file);
    if (!detectedFormat) {
      detectedFormat = parsed.format;
    }
    parsedMessages.push(
      ...parsed.messages.map((message) => ({
        ...message,
        order: currentOrder + message.order,
      }))
    );
    currentOrder += parsed.messages.length;
  }

  const normalizedSelfNicks = normalizeNickAliases(selfNicks);
  const existingKeys = new Set(existingMessages.map(toDedupKey));
  const importedMessages: ImportedMessage[] = [];
  let duplicateCount = 0;

  for (const parsed of parsedMessages.sort(compareImportedMessages)) {
    const normalized = normalizeParsedMessage(buffer, normalizedSelfNicks, parsed, importBatchId);
    if (!normalized) {
      skippedCount += 1;
      continue;
    }
    const dedupKey = toDedupKey(normalized);
    if (existingKeys.has(dedupKey)) {
      duplicateCount += 1;
      continue;
    }
    existingKeys.add(dedupKey);
    importedMessages.push(normalized);
  }

  return {
    messages: importedMessages.map(({ order: _order, ...message }) => message),
    summary: {
      format: detectedFormat ?? 'hexchat',
      importedCount: importedMessages.length,
      duplicateCount,
      skippedCount,
    },
  };
};

const parseLogFile = (file: HistoryImportTextFile) => {
  for (const parser of logParsers) {
    const result = parser(file);
    if (result.recognized) {
      return result;
    }
  }
  throw badRequest(`Unsupported log format for ${file.name}. Only HexChat text logs are supported right now.`);
};

const normalizeParsedMessage = (
  buffer: BufferState,
  selfNickKeys: Set<string>,
  message: ParsedLogMessage,
  importBatchId: string | null,
): ImportedMessage | null => {
  if (buffer.kind === 'query' && !isQueryParticipant(message.nick, buffer.target, selfNickKeys)) {
    return null;
  }
  const attribution = buffer.kind === 'query'
    ? resolveImportedSpeakerAttribution({
        nick: message.nick,
        target: buffer.target,
        selfNickKeys,
      })
    : resolveImportedChannelAttribution({
        nick: message.nick,
        selfNickKeys,
      });
  return {
    id: randomUUID(),
    networkId: buffer.networkId,
    target: buffer.target,
    nick: message.nick,
    speakerRole: attribution.speakerRole,
    speakerNick: attribution.speakerNick,
    attributionSource: attribution.attributionSource,
    attributionConfidence: attribution.attributionConfidence,
    importBatchId,
    body: message.body.trim(),
    kind: message.kind,
    self: attribution.self,
    ts: message.ts,
    order: message.order,
  };
};

const isQueryParticipant = (nick: string, target: string, selfNickKeys: Set<string>) =>
  isSameIrcIdentifier(nick, target) || matchesNickAlias(nick, selfNickKeys);

const toDedupKey = (
  message: Pick<ChatMessage, 'ts' | 'kind' | 'nick' | 'self' | 'body'>
  | Pick<MessageInput, 'ts' | 'kind' | 'nick' | 'self' | 'body'>
) => JSON.stringify([
  message.ts,
  message.kind,
  message.nick ? normalizeIrcIdentifier(message.nick) : null,
  message.body.trim(),
]);

const compareImportedMessages = (left: ParsedLogMessage, right: ParsedLogMessage) =>
  left.ts - right.ts || left.order - right.order;

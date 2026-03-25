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
import { matchesNickAlias, normalizeNickAliases, resolveImportedSpeakerAttribution } from './message-attribution.js';
import type { MessageInput } from './storage-types.js';

type ParsedLogMessage = {
  ts: number;
  nick: string;
  body: string;
  kind: 'line' | 'action';
  order: number;
};

type ParserResult = {
  format: HistoryImportFormat;
  messages: ParsedLogMessage[];
  recognized: boolean;
};

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

const timedLinePattern = /^(?<month>\S+)\s+(?<day>\d{1,2})\s+(?<time>\d{2}:\d{2}:\d{2})\s+(?<rest>.*)$/;
const userMessagePattern = /^<(?<nick>[^>]+)>\s*(?<body>.*)$/;
const actionMessagePattern = /^\*\s+(?<nick>\S+)(?:\s+(?<body>.*))?$/;
const beginLoggingPattern = /^\*{4} BEGIN LOGGING AT .+ (?<year>\d{4})$/;
const endLoggingPattern = /^\*{4} ENDING LOGGING AT .+ (?<year>\d{4})$/;

const monthIndexes = new Map([
  ['jan', 0],
  ['feb', 1],
  ['mar', 2],
  ['mär', 2],
  ['maerz', 2],
  ['apr', 3],
  ['may', 4],
  ['mai', 4],
  ['jun', 5],
  ['jul', 6],
  ['aug', 7],
  ['sep', 8],
  ['sept', 8],
  ['oct', 9],
  ['okt', 9],
  ['nov', 10],
  ['dec', 11],
  ['dez', 11],
]);

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

function parseHexChatLogFile(file: HistoryImportTextFile): ParserResult {
  let currentYear: number | null = null;
  let recognized = false;
  const messages: ParsedLogMessage[] = [];
  const lines = file.text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const beginLogging = line.match(beginLoggingPattern);
    if (beginLogging?.groups?.year) {
      currentYear = Number(beginLogging.groups.year);
      recognized = true;
      continue;
    }
    const endLogging = line.match(endLoggingPattern);
    if (endLogging?.groups?.year) {
      currentYear = Number(endLogging.groups.year);
      recognized = true;
      continue;
    }

    const timedLine = line.match(timedLinePattern);
    if (!timedLine?.groups) {
      continue;
    }

    const monthIndex = parseMonthToken(timedLine.groups.month, file.name);
    const day = Number(timedLine.groups.day);
    const timeParts = timedLine.groups.time.split(':').map(Number);
    recognized = true;
    if (currentYear === null) {
      throw badRequest(`Could not determine a year for HexChat log ${file.name}.`);
    }

    const messageLine = timedLine.groups.rest.match(userMessagePattern);
    if (messageLine?.groups?.nick) {
      const body = messageLine.groups.body.trim();
      if (!body) {
        continue;
      }
      messages.push({
        ts: buildLocalTimestamp(currentYear, monthIndex, day, timeParts, file.name),
        nick: messageLine.groups.nick,
        body,
        kind: 'line',
        order: messages.length,
      });
      continue;
    }

    const actionLine = timedLine.groups.rest.match(actionMessagePattern);
    if (actionLine?.groups?.nick) {
      const body = actionLine.groups.body?.trim() ?? '';
      if (!body || shouldSkipHexChatAction(actionLine.groups.nick, body)) {
        continue;
      }
      messages.push({
        ts: buildLocalTimestamp(currentYear, monthIndex, day, timeParts, file.name),
        nick: actionLine.groups.nick,
        body,
        kind: 'action',
        order: messages.length,
      });
    }
  }

  return {
    format: 'hexchat',
    messages,
    recognized,
  };
}

const parseMonthToken = (token: string, fileName: string) => {
  const normalized = token.replace(/\.$/, '').toLowerCase();
  const monthIndex = monthIndexes.get(normalized);
  if (monthIndex === undefined) {
    throw badRequest(`Unsupported HexChat month token "${token}" in ${fileName}.`);
  }
  return monthIndex;
};

const buildLocalTimestamp = (
  year: number,
  monthIndex: number,
  day: number,
  timeParts: number[],
  fileName: string,
) => {
  const [hours, minutes, seconds] = timeParts;
  const date = new Date(year, monthIndex, day, hours, minutes, seconds, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
    || date.getHours() !== hours
    || date.getMinutes() !== minutes
    || date.getSeconds() !== seconds
  ) {
    throw badRequest(`Invalid HexChat timestamp in ${fileName}.`);
  }
  return date.getTime();
};

const shouldSkipHexChatAction = (nick: string, body: string) => {
  if (
    !nick
    || nick === 'Disconnected'
    || nick.startsWith('[')
    || nick.endsWith(']')
    || nick.endsWith(':')
  ) {
    return true;
  }
  return /^(?:has (?:quit|left)\b|is offline\b|is online\b|disconnected\b)/i.test(body);
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
    : {
        speakerRole: matchesNickAlias(message.nick, selfNickKeys) ? 'self' as const : 'other' as const,
        speakerNick: message.nick,
        attributionSource: matchesNickAlias(message.nick, selfNickKeys) ? 'import-alias' as const : 'unknown' as const,
        attributionConfidence: matchesNickAlias(message.nick, selfNickKeys) ? 'high' as const : 'low' as const,
        self: matchesNickAlias(message.nick, selfNickKeys),
      };
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

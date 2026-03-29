import type { HistoryImportFormat, HistoryImportTextFile } from '../shared/protocol.js';
import { badRequest } from './app-error.js';

export type ParsedLogMessage = {
  ts: number;
  nick: string;
  body: string;
  kind: 'line' | 'action';
  order: number;
};

export type ParserResult = {
  format: HistoryImportFormat;
  messages: ParsedLogMessage[];
  recognized: boolean;
};

const timedLinePattern =
  /^(?<month>\S+)\s+(?<day>\d{1,2})\s+(?<time>\d{2}:\d{2}:\d{2})\s+(?<rest>.*)$/;
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

export const parseHexChatLogFile = (
  file: HistoryImportTextFile,
): ParserResult => {
  let currentYear: number | null = null;
  let recognized = false;
  const messages: ParsedLogMessage[] = [];

  for (const line of file.text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const loggedYear = matchLoggingYear(line);
    if (loggedYear !== null) {
      currentYear = loggedYear;
      recognized = true;
      continue;
    }
    const timedLine = line.match(timedLinePattern);
    if (!timedLine?.groups) {
      continue;
    }
    recognized = true;
    if (currentYear === null) {
      throw badRequest(`Could not determine a year for HexChat log ${file.name}.`);
    }
    const monthIndex = parseMonthToken(timedLine.groups.month, file.name);
    const day = Number(timedLine.groups.day);
    const timeParts = timedLine.groups.time.split(':').map(Number);
    const message = parseTimedMessage({
      fileName: file.name,
      monthIndex,
      day,
      timeParts,
      currentYear,
      rest: timedLine.groups.rest,
      order: messages.length,
    });
    if (message) {
      messages.push(message);
    }
  }

  return { format: 'hexchat', messages, recognized };
};

const matchLoggingYear = (line: string) =>
  Number(
    line.match(beginLoggingPattern)?.groups?.year
    ?? line.match(endLoggingPattern)?.groups?.year
    ?? NaN,
  ) || null;

const parseTimedMessage = (input: {
  fileName: string;
  monthIndex: number;
  day: number;
  timeParts: number[];
  currentYear: number;
  rest: string;
  order: number;
}): ParsedLogMessage | null => {
  const ts = buildLocalTimestamp(
    input.currentYear,
    input.monthIndex,
    input.day,
    input.timeParts,
    input.fileName,
  );
  const messageLine = input.rest.match(userMessagePattern);
  if (messageLine?.groups?.nick) {
    const body = messageLine.groups.body.trim();
    return body
      ? {
          ts,
          nick: messageLine.groups.nick,
          body,
          kind: 'line',
          order: input.order,
        }
      : null;
  }
  const actionLine = input.rest.match(actionMessagePattern);
  if (!actionLine?.groups?.nick) {
    return null;
  }
  const body = actionLine.groups.body?.trim() ?? '';
  if (!body || shouldSkipHexChatAction(actionLine.groups.nick, body)) {
    return null;
  }
  return {
    ts,
    nick: actionLine.groups.nick,
    body,
    kind: 'action',
    order: input.order,
  };
};

const parseMonthToken = (token: string, fileName: string) => {
  const monthIndex = monthIndexes.get(token.replace(/\.$/, '').toLowerCase());
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

const shouldSkipHexChatAction = (nick: string, body: string) =>
  !nick
  || nick === 'Disconnected'
  || nick.startsWith('[')
  || nick.endsWith(']')
  || nick.endsWith(':')
  || /^(?:has (?:quit|left)\b|is offline\b|is online\b|disconnected\b)/i.test(body);

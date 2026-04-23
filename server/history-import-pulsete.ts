import type { HistoryImportTextFile } from '../shared/protocol.js';
import { badRequest } from './app-error.js';
import type { ParserResult } from './history-import-hexchat.js';

const pulseteHeaderPattern = /^Buffer:\s+/;
const pulseteTimestampPattern = /^\[(?<stamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s+(?<rest>.*)$/;
const pulseteActionPattern = /^\*\s+(?<nick>\S+)(?:\s+(?<body>.*))?$/;
const pulseteLinePattern = /^(?<nick>.+?):\s(?<body>.*)$/;
const pulseteEventPattern = /^\((?:join|part|quit|system)\)\s+/;

export const parsePulseteHistoryFile = (
  file: HistoryImportTextFile,
): ParserResult => {
  const lines = file.text.split(/\r?\n/);
  if (!looksLikePulseteHistory(lines)) {
    return { format: 'pulsete', messages: [], recognized: false };
  }

  const bodyStartIndex = lines.findIndex((line, index) => index >= 4 && !line.trim());
  if (bodyStartIndex === -1) {
    throw badRequest(`Malformed Pulsete history export in ${file.name}.`);
  }

  const messages = [];
  for (const line of lines.slice(bodyStartIndex + 1)) {
    if (!line.trim() || line === '(no messages available)') {
      continue;
    }
    const timedLine = line.match(pulseteTimestampPattern);
    if (!timedLine?.groups) {
      continue;
    }
    const ts = parsePulseteTimestamp(timedLine.groups.stamp, file.name);
    const rest = timedLine.groups.rest;
    const actionLine = rest.match(pulseteActionPattern);
    if (actionLine?.groups?.nick) {
      const body = actionLine.groups.body?.trim() ?? '';
      if (!body) {
        continue;
      }
      messages.push({
        ts,
        nick: actionLine.groups.nick,
        body,
        kind: 'action' as const,
        order: messages.length,
      });
      continue;
    }
    if (pulseteEventPattern.test(rest)) {
      continue;
    }
    const messageLine = rest.match(pulseteLinePattern);
    if (!messageLine?.groups?.nick) {
      continue;
    }
    const body = messageLine.groups.body.trim();
    if (!body) {
      continue;
    }
    messages.push({
      ts,
      nick: messageLine.groups.nick.trim(),
      body,
      kind: 'line' as const,
      order: messages.length,
    });
  }

  return { format: 'pulsete', messages, recognized: true };
};

const looksLikePulseteHistory = (lines: string[]) =>
  pulseteHeaderPattern.test(lines[0] ?? '')
  && lines.some((line) => line.startsWith('Exported at: '))
  && lines.some((line) => line.startsWith('Total messages: '));

const parsePulseteTimestamp = (stamp: string, fileName: string) => {
  const ts = Date.parse(stamp.replace(' ', 'T') + ':00Z');
  if (Number.isNaN(ts)) {
    throw badRequest(`Invalid Pulsete timestamp in ${fileName}.`);
  }
  return ts;
};

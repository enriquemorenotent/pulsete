import type { BufferState, ChatMessage } from '../shared/protocol.js';
import { formatMessage, formatTimestamp } from './assistant-history-context.js';

export const renderBufferHistoryDownload = ({
  buffer,
  messages,
  networkName,
}: {
  buffer: BufferState;
  messages: ChatMessage[];
  networkName: string;
}) => {
  const lines = [
    `Buffer: ${buffer.target}`,
    `Type: ${buffer.kind}`,
    `Network: ${networkName}`,
    `Exported at: ${formatTimestamp(Date.now())} UTC`,
    `Total messages: ${messages.length}`,
  ];
  if (messages.length > 0) {
    lines.push(`History range: ${formatTimestamp(messages[0]!.ts)} UTC to ${formatTimestamp(messages.at(-1)!.ts)} UTC`);
  }
  lines.push('', messages.length > 0 ? messages.map(formatMessage).join('\n') : '(no messages available)');
  return `${lines.join('\n')}\n`;
};

export const buildHistoryDownloadName = (networkName: string, target: string) =>
  `history-${sanitizeFileNameSegment(networkName)}-${sanitizeFileNameSegment(target)}.txt`;

const sanitizeFileNameSegment = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'buffer';

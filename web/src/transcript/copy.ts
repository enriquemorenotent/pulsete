import type { ClipboardEvent } from 'react';
import type { ChatMessage } from '../../../shared/protocol-chat.js';
import { formatMessageTime } from '../chat-pane-message-utils.js';

export const formatTranscriptMessageForCopy = (
  message: ChatMessage,
  senderLabel = message.nick,
  displayText = message.body,
) => {
  const prefix = `[${formatMessageTime(message.ts)}]`;
  return senderLabel
    ? `${prefix} ${senderLabel}: ${displayText}`
    : `${prefix} ${displayText}`;
};

export const handleTranscriptCopy = (event: ClipboardEvent<HTMLElement>) => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return;
  }

  const ranges = Array.from(
    { length: selection.rangeCount },
    (_, index) => selection.getRangeAt(index),
  );
  const selectedLines = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[data-transcript-copy-text]'),
  ).filter((element) => ranges.some((range) => range.intersectsNode(element)));

  // Keep normal browser behavior for small selections within a single message.
  if (selectedLines.length < 2) {
    return;
  }

  const plainText = selectedLines
    .map((element) => element.dataset.transcriptCopyText)
    .filter((line): line is string => line != null)
    .join('\n');
  if (!plainText) {
    return;
  }

  event.preventDefault();
  event.clipboardData.setData('text/plain', plainText);
};

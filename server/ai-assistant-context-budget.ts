import type { ChatMessage } from '../shared/protocol-chat.js';

export const limitAssistantMessages = (messages: readonly ChatMessage[], maxBytes: number) => {
  const selected: ChatMessage[] = [];
  let remaining = maxBytes;
  let truncated = false;
  for (const message of [...messages].reverse()) {
    // Include IDs, timestamps and speaker names in the budget, not just message bodies.
    const overhead = Buffer.byteLength(JSON.stringify({ id: message.id, nick: message.speakerNick ?? message.nick,
      ts: message.ts, body: '' })) + 80;
    if (remaining <= overhead) { truncated = true; break; }
    const bodyLimit = Math.min(2_000, remaining - overhead);
    const body = clipUtf8(message.body, bodyLimit);
    truncated ||= body !== message.body;
    selected.push({ ...message, body });
    remaining -= overhead + Buffer.byteLength(body);
  }
  return { messages: selected.reverse(), truncated: truncated || selected.length < messages.length };
};

const clipUtf8 = (text: string, maxBytes: number) => {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const suffix = '… [message shortened]';
  const buffer = Buffer.from(text);
  let end = Math.max(0, maxBytes - Buffer.byteLength(suffix));
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString('utf8') + suffix;
};

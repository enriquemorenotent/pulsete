import type { BufferState, ServerMessage } from '../../shared/protocol.js';
import type { ApplyServerMessages } from './app-actions-types.js';

type MarkBufferRead = (
  bufferId: string,
  init?: Pick<RequestInit, 'signal'>,
) => Promise<{ buffer: BufferState; messages: ServerMessage[] }>;

type MarkSelectedBufferReadParams = {
  bufferId: string;
  applyServerMessages: ApplyServerMessages;
  markBufferRead: MarkBufferRead;
  signal: AbortSignal;
  isCurrentRequest: () => boolean;
  onSettled: () => void;
};

export async function markSelectedBufferRead({
  bufferId,
  applyServerMessages,
  markBufferRead,
  signal,
  isCurrentRequest,
  onSettled,
}: MarkSelectedBufferReadParams) {
  try {
    const payload = await markBufferRead(bufferId, { signal });
    if (isCurrentRequest()) {
      applyServerMessages(payload.messages);
    }
  } catch {
    // Read receipts are opportunistic; connection failures are reflected by the gateway state.
  } finally {
    if (isCurrentRequest()) {
      onSettled();
    }
  }
}

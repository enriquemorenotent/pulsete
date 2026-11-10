import type { MessageArrival, ServerMessage } from '../../shared/protocol-messages.js';
import type { StateRevision } from '../../shared/protocol-sync.js';
import type { AppStoreApi } from './app-store.js';
import type { Action } from './app-types.js';
import { dispatchInboundServerMessage } from './server-message-actions.js';

type ServerMessageBridgeOptions = {
  onMessageArrival?: (arrival: MessageArrival) => void;
  requestSnapshot?: () => boolean;
  recoverRejectedDraft?: (bufferId: string, body: string) => 'restored' | 'history';
};
type DispatchTarget = ((action: Action) => void) | Pick<AppStoreApi, 'batch' | 'dispatch'>;

// These are private replies, not changes in the shared state stream.
const isPrivateReply = (message: ServerMessage) =>
  message.type === 'notice' || message.type === 'error' || message.type.startsWith('channel.list.');

export const createServerMessageBridge = (target: DispatchTarget, options: ServerMessageBridgeOptions = {}) => {
  const dispatch = typeof target === 'function' ? target : target.dispatch;
  const batch = (callback: () => void) => typeof target === 'function' ? callback() : target.batch(callback);
  let current: StateRevision | null = null;
  let recovering = false;
  let snapshotRequested = false;

  const recover = () => {
    recovering = true;
    if (!snapshotRequested) snapshotRequested = options.requestSnapshot?.() ?? false;
  };
  const dispatchMessage = (message: ServerMessage) => {
    if (message.type === 'error' && message.retryDraft && options.recoverRejectedDraft) {
      const result = options.recoverRejectedDraft(message.retryDraft.bufferId, message.retryDraft.body);
      message = { ...message, message: `${message.message}. ${result === 'restored'
        ? 'Message restored to its conversation draft.'
        : 'Your newer draft was kept. Press Up in the original conversation to recover the rejected message.'}` };
    }
    dispatchInboundServerMessage(message, dispatch);
    if (message.type === 'message.append' && message.arrival) {
      options.onMessageArrival?.({ message: message.message, buffer: message.arrival.buffer });
    }
  };

  const accept = (message: ServerMessage, source: 'socket' | 'http') => {
    if (message.type === 'state.ready') {
      // Only the active websocket may establish a runtime epoch or replace state.
      if (source !== 'socket') return;
      const sync = message.snapshot.sync;
      if (!sync) { if (!current) dispatchMessage(message); return; }
      snapshotRequested = false;
      if (current?.epoch === sync.epoch && sync.revision < current.revision) {
        recover();
        return;
      }
      current = sync;
      recovering = false;
      dispatchMessage(message);
      return;
    }
    const sync = message.sync;
    if (!sync) {
      if (!current || (source === 'socket' && isPrivateReply(message))) dispatchMessage(message);
      return;
    }
    if (!current) { recover(); return; }
    if (sync.epoch !== current.epoch) {
      // A late HTTP response from a previous runtime must not restart recovery.
      if (source === 'socket') recover();
      return;
    }
    if (sync.revision <= current.revision) return;
    if (recovering || sync.revision !== current.revision + 1) { recover(); return; }
    current = sync;
    dispatchMessage(message);
  };

  return {
    applyMutationMessages: (messages: readonly ServerMessage[]) => batch(() => {
      for (const message of messages) accept(message, 'http');
    }),
    applySocketMessage: (message: ServerMessage) => batch(() => accept(message, 'socket')),
  };
};

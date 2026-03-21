import type { BufferState, ClientMessage, NetworkProfile } from '../../shared/protocol.js';
import { createConversationQueries } from './conversation-selectors.js';
import type { Action, State } from './app-types.js';
import type { SocketHandle } from './client.js';
import type { WorkspaceView } from './workspace-types.js';

export type MutableRef<T> = { current: T };

export type AppActionParams = {
  state: State;
  draft: string;
  workspace: WorkspaceView;
  dispatch: (action: Action) => void;
  socketRef: MutableRef<SocketHandle | null>;
  setDraft: (value: string) => void;
  recordComposerEntry: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type GatewayActions = {
  getGatewaySocket: (showBanner?: boolean) => SocketHandle | null;
  sendGatewayMessage: (message: ClientMessage, showBanner?: boolean) => boolean;
};

export type ConversationActions = {
  joinChannel: (networkId: string, channel: string, sourceBufferId?: string) => boolean;
  openOrSelectQueryBuffer: (network: NetworkProfile, nick: string) => Promise<BufferState>;
  openChannelListForNetwork: (networkId: string) => Promise<void>;
};

export type AppActionContext = AppActionParams & GatewayActions & ConversationActions & {
  conversation: ReturnType<typeof createConversationQueries>;
};

export const selectBuffer = (dispatch: (action: Action) => void, buffer: BufferState) =>
  dispatch({ type: 'select', selection: { kind: 'buffer', bufferId: buffer.id } });

export const selectPendingChannel = (dispatch: (action: Action) => void, networkId: string, channel: string) =>
  dispatch({ type: 'select', selection: { kind: 'pending-channel', networkId, channel } });

import type {
  BufferHistorySearchPayload,
  BufferState,
  LogHistorySearchFilters,
  LogHistorySearchPayload,
  LogSourceListFilters,
  LogSourceListPayload,
  NetworkProfile,
} from '../../shared/protocol-chat.js';
import type { BufferHistoryPayload } from './client.js';
import type { ClientMessage, ServerMessage } from '../../shared/protocol-messages.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { selectConversation, selectWorkspace } from './app-selectors.js';
import type { ConversationModel } from './conversation-model.js';
import type { Action } from './app-types.js';
import type { SocketHandle } from './client.js';
import type { WorkspaceView } from './workspace-types.js';

export type MutableRef<T> = { current: T };

export type AppDispatch = (action: Action) => void;

export type AppStateGetter = () => import('./app-types.js').State;
export type ApplyServerMessages = (messages: readonly ServerMessage[]) => void;

export type AppActionContext = {
  getConversation?: () => ConversationModel;
  getState: AppStateGetter;
  getDraft: (contextKey: string | null) => string;
  getWorkspace?: () => WorkspaceView;
  applyServerMessages: ApplyServerMessages;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: (value: string, contextKey?: string | null) => void;
  setDraft: (value: string, contextKey?: string | null) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type BannerActions = {
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type GatewayActionParams = BannerActions & {
  getState: AppStateGetter;
  socketRef: MutableRef<SocketHandle | null>;
};

export type GatewayActions = {
  getGatewaySocket: (showBanner?: boolean) => SocketHandle | null;
  sendGatewayMessage: (message: ClientMessage, showBanner?: boolean) => boolean;
};

export type ConversationActions = {
  joinChannel: (
    networkId: string,
    channel: string,
    sourceBufferId?: string,
  ) => boolean;
  clearBufferHistory: (buffer: BufferState) => Promise<boolean>;
  downloadBufferHistory: (bufferId: string) => Promise<boolean>;
  searchBufferHistory: (
    bufferId: string,
    query: string,
    init?: Pick<RequestInit, 'signal'>,
  ) => Promise<BufferHistorySearchPayload>;
  searchLogs: (
    query: string,
    filters?: LogHistorySearchFilters,
    init?: Pick<RequestInit, 'signal'>,
  ) => Promise<LogHistorySearchPayload>;
  listLogSources: (
    filters?: LogSourceListFilters,
    init?: Pick<RequestInit, 'signal'>,
  ) => Promise<LogSourceListPayload>;
  loadBufferHistory: (
    bufferId: string,
    beforeMessageId?: string,
    init?: Pick<RequestInit, 'signal'>,
  ) => Promise<BufferHistoryPayload>;
  saveBufferNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
  openOrSelectQueryBuffer: (
    network: NetworkProfile,
    nick: string,
    peerIdentity?: NetworkUserIdentity | null,
  ) => Promise<BufferState>;
  openChannelListForNetwork: (networkId: string) => Promise<void>;
};

export const selectBuffer = (dispatch: AppDispatch, buffer: BufferState) =>
  dispatch({
    type: 'select',
    selection: { kind: 'buffer', bufferId: buffer.id },
  });

export const selectPendingChannel = (
  dispatch: AppDispatch,
  networkId: string,
  channel: string,
) =>
  dispatch({
    type: 'select',
    selection: { kind: 'pending-channel', networkId, channel },
  });

export const getConversation = (getState: AppStateGetter) =>
  selectConversation(getState());

export const getWorkspace = (getState: AppStateGetter) =>
  selectWorkspace(getState());

export const readConversation = (
  getState: AppStateGetter,
  getConversationOverride?: () => ConversationModel,
) => getConversationOverride?.() ?? getConversation(getState);

export const readWorkspace = (
  getState: AppStateGetter,
  getWorkspaceOverride?: () => WorkspaceView,
) => getWorkspaceOverride?.() ?? getWorkspace(getState);

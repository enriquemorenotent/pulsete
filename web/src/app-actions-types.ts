import type {
  BufferHistoryImportRequest,
  BufferState,
  ClientMessage,
  NetworkProfile,
  ServerMessage,
} from '../../shared/protocol.js';
import type { Action } from './app-types.js';
import type { AppSessionSnapshot } from './app-session.js';
import type { SocketHandle } from './client.js';

export type MutableRef<T> = { current: T };

export type AppDispatch = (action: Action) => void;

export type AppSessionGetter = () => AppSessionSnapshot;
export type ApplyServerMessages = (messages: readonly ServerMessage[]) => void;

export type AppActionContext = {
  getSession: AppSessionGetter;
  applyServerMessages: ApplyServerMessages;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  recordComposerEntry: (value: string) => void;
  setDraft: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type BannerActions = {
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type GatewayActionParams = BannerActions & {
  getSession: AppSessionGetter;
  socketRef: MutableRef<SocketHandle | null>;
};

export type GatewayActions = {
  getGatewaySocket: (showBanner?: boolean) => SocketHandle | null;
  sendGatewayMessage: (message: ClientMessage, showBanner?: boolean) => boolean;
};

export type ConversationActions = {
  joinChannel: (networkId: string, channel: string, sourceBufferId?: string) => boolean;
  clearBufferHistory: (bufferId: string) => Promise<boolean>;
  downloadBufferHistory: (bufferId: string) => Promise<boolean>;
  importBufferHistory: (bufferId: string, input: BufferHistoryImportRequest) => Promise<boolean>;
  openOrSelectQueryBuffer: (network: NetworkProfile, nick: string) => Promise<BufferState>;
  openChannelListForNetwork: (networkId: string) => Promise<void>;
};

export const selectBuffer = (dispatch: AppDispatch, buffer: BufferState) =>
  dispatch({ type: 'select', selection: { kind: 'buffer', bufferId: buffer.id } });

export const selectPendingChannel = (dispatch: AppDispatch, networkId: string, channel: string) =>
  dispatch({ type: 'select', selection: { kind: 'pending-channel', networkId, channel } });

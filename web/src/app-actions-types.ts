import type { BufferState, ClientMessage, NetworkProfile, ServerMessage } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import type { AppSessionSnapshot } from './app-session.js';
import type { SocketHandle } from './client.js';

export type MutableRef<T> = { current: T };
export type ValueReader<T> = () => T;

export type AppDispatch = (action: Action) => void;

export type AppSessionReader = ValueReader<AppSessionSnapshot>;
export type ApplyServerMessages = (messages: readonly ServerMessage[]) => void;
export type DraftReader = ValueReader<AppSessionSnapshot['draft']>;
export type WorkspaceReader = ValueReader<AppSessionSnapshot['workspace']>;
export type ConversationReader = ValueReader<AppSessionSnapshot['conversation']>;
export type GatewayStatusReader = ValueReader<State['domain']['gatewayStatus']>;
export type ChannelListReader = ValueReader<State['transient']['channelList']>;
export type NetworksReader = ValueReader<State['domain']['networks']>;
export type NetworkStatesReader = ValueReader<State['domain']['networkStates']>;
export type FriendSelectionReader = ValueReader<{
  buffers: State['domain']['buffers'];
  networkStates: State['domain']['networkStates'];
  workspace: AppSessionSnapshot['workspace'];
}>;

export type BannerActions = {
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type DraftActions = {
  draft: string;
  setDraft: (value: string) => void;
  recordComposerEntry: (value: string) => void;
};

export type GatewayActionParams = BannerActions & {
  readGatewayStatus: GatewayStatusReader;
  socketRef: MutableRef<SocketHandle | null>;
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

export const selectBuffer = (dispatch: AppDispatch, buffer: BufferState) =>
  dispatch({ type: 'select', selection: { kind: 'buffer', bufferId: buffer.id } });

export const selectPendingChannel = (dispatch: AppDispatch, networkId: string, channel: string) =>
  dispatch({ type: 'select', selection: { kind: 'pending-channel', networkId, channel } });

export const constantReader = <T,>(value: T): ValueReader<T> => () => value;

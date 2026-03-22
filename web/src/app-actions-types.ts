import type { BufferState, ClientMessage, NetworkProfile } from '../../shared/protocol.js';
import type { Action, AppDomainState, AppTransientState, GatewayStatus } from './app-types.js';
import type { SocketHandle } from './client.js';
import type { WorkspaceView } from './workspace-types.js';

export type MutableRef<T> = { current: T };
export type ValueReader<T> = () => T;

export type AppDispatch = (action: Action) => void;

export type BannerActions = {
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type DraftActions = {
  draft: string;
  setDraft: (value: string) => void;
  recordComposerEntry: (value: string) => void;
};

export type GatewayActionParams = BannerActions & {
  getGatewayStatus: ValueReader<GatewayStatus>;
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

export type WorkspaceActions = {
  getWorkspace: ValueReader<WorkspaceView>;
};

export type AppActionState = {
  getBuffers: ValueReader<AppDomainState['buffers']>;
  getChannelList: ValueReader<AppTransientState['channelList']>;
  getGatewayStatus: ValueReader<AppDomainState['gatewayStatus']>;
  getNetworks: ValueReader<AppDomainState['networks']>;
  getNetworkStates: ValueReader<AppDomainState['networkStates']>;
};

export const selectBuffer = (dispatch: AppDispatch, buffer: BufferState) =>
  dispatch({ type: 'select', selection: { kind: 'buffer', bufferId: buffer.id } });

export const selectPendingChannel = (dispatch: AppDispatch, networkId: string, channel: string) =>
  dispatch({ type: 'select', selection: { kind: 'pending-channel', networkId, channel } });

export const constantReader = <T,>(value: T): ValueReader<T> => () => value;

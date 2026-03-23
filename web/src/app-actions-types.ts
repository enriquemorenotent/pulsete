import type { BufferState, ClientMessage, NetworkProfile } from '../../shared/protocol.js';
import type { Action, AppDomainState, AppTransientState } from './app-types.js';
import type { SocketHandle } from './client.js';
import type { ConversationIndex } from './conversation-selectors.js';
import type { WorkspaceView } from './workspace-types.js';

export type MutableRef<T> = { current: T };
export type ValueReader<T> = () => T;

export type AppDispatch = (action: Action) => void;

export type AppActionSnapshot = {
  buffers: AppDomainState['buffers'];
  channelList: AppTransientState['channelList'];
  conversation: ConversationIndex;
  draft: string;
  gatewayStatus: AppDomainState['gatewayStatus'];
  networks: AppDomainState['networks'];
  networkStates: AppDomainState['networkStates'];
  workspace: WorkspaceView;
};

export type AppStateReader = ValueReader<AppActionSnapshot>;

export type BannerActions = {
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export type DraftActions = {
  draft: string;
  setDraft: (value: string) => void;
  recordComposerEntry: (value: string) => void;
};

export type GatewayActionParams = BannerActions & {
  readState: AppStateReader;
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

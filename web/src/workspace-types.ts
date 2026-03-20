import type { BufferState, ChannelState, NetworkProfile } from '../../shared/protocol.js';

export type NetworkRuntimeState = {
  connected: boolean;
  connecting: boolean;
  serverName: string | null;
  nick: string;
};

export type SelectedBuffer = {
  bufferId: string;
};

export type WorkspaceMode =
  | 'empty'
  | 'server-offline'
  | 'server-connecting'
  | 'server-connected'
  | 'channel-offline'
  | 'channel-connecting'
  | 'channel-pending'
  | 'channel-connected'
  | 'query-offline'
  | 'query-connecting'
  | 'query-connected';

export type ComposerMode = 'hidden' | 'commands' | 'normal';

export type WorkspaceView = {
  mode: WorkspaceMode;
  selection: SelectedBuffer | null;
  connectionInstances: NetworkProfile[];
  selectedNetwork: NetworkProfile | null;
  selectedRuntime: NetworkRuntimeState | null;
  selectedBuffer: BufferState | null;
  selectedChannel: ChannelState | null;
  headerTitle: string;
  headerSubtitle: string;
  composerMode: ComposerMode;
  composerPlaceholder: string;
  emptyBody: string;
  showNicklist: boolean;
};

import type { ChannelState, NetworkProfile, QueryBuffer } from '../../shared/protocol.js';

export type NetworkRuntimeState = {
  connected: boolean;
  connecting: boolean;
  serverName: string | null;
  nick: string;
};

export type SelectedBuffer = {
  networkId: string;
  target: string;
  channelId: string | null;
};

export type WorkspaceMode =
  | 'empty'
  | 'server-offline'
  | 'server-connecting'
  | 'server-connected'
  | 'channel-pending'
  | 'channel-connected'
  | 'query-connected';

export type ComposerMode = 'hidden' | 'commands' | 'normal';

export type WorkspaceView = {
  mode: WorkspaceMode;
  selection: SelectedBuffer | null;
  connectionInstances: NetworkProfile[];
  selectedNetwork: NetworkProfile | null;
  selectedRuntime: NetworkRuntimeState | null;
  selectedChannel: ChannelState | null;
  selectedQuery: QueryBuffer | null;
  headerTitle: string;
  headerSubtitle: string;
  statusLabel: 'Offline' | 'Connecting' | 'Connected';
  composerMode: ComposerMode;
  composerPlaceholder: string;
  emptyBody: string;
  showNicklist: boolean;
};

import type { BufferState, ChannelState, NetworkProfile, PendingChannelState } from '../../shared/protocol.js';

export type NetworkRuntimeState = {
  connected: boolean;
  connecting: boolean;
  serverName: string | null;
  nick: string;
};

export type SelectedBuffer =
  | {
      kind: 'buffer';
      bufferId: string;
    }
  | {
      kind: 'pending-channel';
      networkId: string;
      channel: string;
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
  selectedPendingChannel: PendingChannelState | null;
  headerTitle: string;
  headerSubtitle: string;
  composerMode: ComposerMode;
  composerPlaceholder: string;
  emptyBody: string;
  showNicklist: boolean;
};

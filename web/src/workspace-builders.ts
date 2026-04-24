import type { NetworkProfile } from '../../shared/protocol.js';
import { selectionFor } from './conversation-model.js';
import type { WorkspaceView } from './workspace-types.js';
import {
  getReadOnlyEmptyBody,
  getReadOnlySubtitle,
  type ResolvedWorkspace,
} from './workspace-resolve.js';

export const buildEmptyWorkspace = (workspaceNetworks: NetworkProfile[]): WorkspaceView => ({
  mode: 'empty',
  selection: null,
  workspaceNetworks,
  selectedNetwork: null,
  selectedRuntime: null,
  selectedBuffer: null,
  selectedChannel: null,
  selectedPendingChannel: null,
  headerTitle: 'No active connection',
  headerSubtitle: '',
  composerMode: 'hidden',
  composerPlaceholder: '',
  emptyBody: 'Open Network Manager to connect a network.',
  showNicklist: false,
});

export const buildResolvedWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (!resolved.serverBuffer) {
    return buildServerBufferTransition(resolved);
  }
  if (resolved.activePendingChannel) {
    return buildPendingChannelWorkspace(resolved);
  }
  if (resolved.connectionStatus === 'offline') {
    return buildOfflineWorkspace(resolved);
  }
  if (resolved.connectionStatus === 'connecting') {
    return buildConnectingWorkspace(resolved);
  }
  return buildConnectedWorkspace(resolved);
};

const createWorkspace = (
  resolved: ResolvedWorkspace,
  overrides: Partial<WorkspaceView> & Pick<WorkspaceView, 'mode'>
): WorkspaceView => ({
  selection: resolved.activeSelection,
  workspaceNetworks: resolved.workspaceNetworks,
  selectedNetwork: resolved.selectedNetwork,
  selectedRuntime: resolved.selectedRuntime,
  selectedBuffer: resolved.activeBuffer,
  selectedChannel: resolved.selectedChannel,
  selectedPendingChannel: null,
  headerTitle: '',
  headerSubtitle: '',
  composerMode: 'hidden',
  composerPlaceholder: '',
  emptyBody: '',
  showNicklist: false,
  ...overrides,
});

const buildServerBufferTransition = (resolved: ResolvedWorkspace): WorkspaceView =>
  createWorkspace(resolved, {
    mode:
      resolved.connectionStatus === 'connected'
        ? 'server-connected'
        : resolved.connectionStatus === 'connecting'
          ? 'server-connecting'
          : 'server-offline',
    selection: null,
    selectedBuffer: null,
    selectedChannel: null,
    headerSubtitle: resolved.connectionStatus === 'connected' ? resolved.connectedSubtitle : '',
    emptyBody:
      resolved.connectionStatus === 'connected'
        ? 'Loading the server buffer for this connection.'
        : resolved.connectionStatus === 'connecting'
          ? 'Starting the connection view. Wait for the server buffer to load.'
          : 'Restoring the server buffer for this connection.',
  });

const buildPendingChannelWorkspace = (resolved: ResolvedWorkspace): WorkspaceView =>
  createWorkspace(resolved, {
    mode: 'channel-pending',
    selection: resolved.inputSelection,
    selectedBuffer: null,
    selectedChannel: null,
    selectedPendingChannel: resolved.activePendingChannel,
    headerTitle: resolved.activePendingChannel?.channel ?? '',
    headerSubtitle:
      resolved.connectionStatus === 'connected'
        ? resolved.connectedSubtitle
        : 'Waiting for the connection to become available again.',
    emptyBody: 'Joining channel. Wait for the server to confirm the membership.',
  });

const buildOfflineWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (resolved.activeBuffer?.kind === 'channel') {
    return createWorkspace(resolved, {
      mode: 'channel-offline',
      headerTitle: resolved.selectedChannel?.name ?? resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('offline'),
      emptyBody: getReadOnlyEmptyBody('channel', 'offline'),
    });
  }
  if (resolved.activeBuffer?.kind === 'query') {
    return createWorkspace(resolved, {
      mode: 'query-offline',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('offline'),
      emptyBody: getReadOnlyEmptyBody('query', 'offline'),
    });
  }
  return createWorkspace(resolved, {
    mode: 'server-offline',
    selection: selectionFor(resolved.serverBuffer),
    selectedBuffer: resolved.serverBuffer,
    emptyBody: 'Reconnect to restore channels and private messages.',
  });
};

const buildConnectingWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (resolved.activeBuffer?.kind === 'channel') {
    return createWorkspace(resolved, {
      mode: 'channel-connecting',
      headerTitle: resolved.selectedChannel?.name ?? resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('connecting'),
      emptyBody: getReadOnlyEmptyBody('channel', 'connecting'),
    });
  }
  if (resolved.activeBuffer?.kind === 'query') {
    return createWorkspace(resolved, {
      mode: 'query-connecting',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('connecting'),
      emptyBody: getReadOnlyEmptyBody('query', 'connecting'),
    });
  }
  return createWorkspace(resolved, {
    mode: 'server-connecting',
    selection: selectionFor(resolved.serverBuffer),
    selectedBuffer: resolved.serverBuffer,
    emptyBody: 'Waiting for the server connection to finish.',
  });
};

const buildConnectedWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (resolved.activeBuffer?.kind === 'channel' && resolved.selectedChannel) {
    return createWorkspace(resolved, {
      mode: 'channel-connected',
      headerTitle: resolved.selectedChannel.name,
      headerSubtitle: resolved.connectedSubtitle,
      composerMode: 'normal',
      composerPlaceholder: `Message ${resolved.selectedChannel.name} or /command`,
      emptyBody: 'Wait for activity or send a message.',
      showNicklist: true,
    });
  }
  if (resolved.activeBuffer?.kind === 'query') {
    return createWorkspace(resolved, {
      mode: 'query-connected',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: resolved.connectedSubtitle,
      composerMode: 'normal',
      composerPlaceholder: `Message ${resolved.activeBuffer.target} or /command`,
      emptyBody: 'Wait for a reply or send a message.',
    });
  }
  if (resolved.activeBuffer?.kind === 'channel') {
    return createWorkspace(resolved, {
      mode: 'channel-offline',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: 'Not joined. History stays available until you rejoin this channel.',
      emptyBody: 'Use /join to re-enter this channel before sending messages.',
    });
  }
  return createWorkspace(resolved, {
    mode: 'server-connected',
    selection: selectionFor(resolved.serverBuffer),
    selectedBuffer: resolved.serverBuffer,
    headerSubtitle: resolved.connectedSubtitle,
    composerMode: 'commands',
    composerPlaceholder: 'Use /join #channel or another /command',
    emptyBody: 'Use /join #channel to enter a channel.',
  });
};

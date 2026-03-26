import { useMemo } from 'react';
import type { BufferState, NetworkProfile } from '../../shared/protocol.js';
import { resolveCurrentChannelAutoJoinState } from './channel-autojoin.js';
import {
  buildCommandPaletteEntrySpecs,
  runCommandPaletteAction,
  type CommandPaletteActionHandlers,
} from './command-palette.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppUiState } from './useAppUiState.js';
import type { AppActions } from './useAppActions.js';
import type { WorkspaceView } from './workspace-types.js';

type DesktopCommandPaletteModelParams = {
  actions: Pick<
    AppActions,
    | 'clearBufferHistory'
    | 'downloadBufferHistory'
    | 'openChannelList'
    | 'selectFriend'
    | 'selectNetworkBuffer'
    | 'selectPendingTab'
    | 'selectTabBuffer'
    | 'toggleCurrentChannelAutoJoin'
  >;
  dispatch: (action: Action) => void;
  friends: State['domain']['friends'];
  networks: State['domain']['networks'];
  sidebarConnections: SidebarConnectionView[];
  ui: Pick<
    AppUiState,
    | 'closeCommandPalette'
    | 'commandPaletteOpen'
    | 'openBufferToolDialog'
    | 'openCommandPalette'
    | 'openPreferences'
  >;
  workspace: WorkspaceView;
};

export function useDesktopCommandPaletteModel({
  actions,
  dispatch,
  friends,
  networks,
  sidebarConnections,
  ui,
  workspace,
}: DesktopCommandPaletteModelParams): DesktopShellModel['commandPalette'] {
  const selectableBuffersById = useMemo(() => {
    const next = new Map<string, BufferState>();
    for (const connection of sidebarConnections) {
      if (connection.serverBuffer) {
        next.set(connection.serverBuffer.id, connection.serverBuffer);
      }
      for (const child of connection.childBuffers) {
        next.set(child.buffer.id, child.buffer);
      }
    }
    return next;
  }, [sidebarConnections]);

  const selectableNetworksById = useMemo(() => {
    const next = new Map<string, NetworkProfile>();
    for (const connection of sidebarConnections) {
      next.set(connection.network.id, connection.network);
    }
    return next;
  }, [sidebarConnections]);

  const friendsById = useMemo(
    () => new Map(friends.map((friend) => [friend.id, friend])),
    [friends],
  );

  const selectedBufferKind = workspace.selectedBuffer?.kind ?? null;
  const selectedBufferId = workspace.selectedBuffer?.id ?? null;
  const selectedBufferLabel = workspace.selectedBuffer?.target ?? null;
  const canUseBufferHistoryTools =
    selectedBufferKind === 'channel' || selectedBufferKind === 'query';
  const channelAutoJoin = resolveCurrentChannelAutoJoinState(networks, workspace);

  const entrySpecs = useMemo(
    () => buildCommandPaletteEntrySpecs({
      connections: sidebarConnections,
      friends,
      selectedBuffer: {
        id: selectedBufferId,
        label: selectedBufferLabel,
      },
      selectedNetwork: {
        available: workspace.selectedNetwork !== null,
        label: workspace.selectedNetwork?.name ?? null,
      },
      actions: {
        canToggleChannelAutoJoin: channelAutoJoin.available,
        channelAutoJoinActive: channelAutoJoin.active,
        canClearHistory: canUseBufferHistoryTools,
        canDownloadHistory: canUseBufferHistoryTools,
        canImportHistory: canUseBufferHistoryTools,
        canOpenSelfAliases: canUseBufferHistoryTools,
      },
    }),
    [
      canUseBufferHistoryTools,
      channelAutoJoin.active,
      channelAutoJoin.available,
      friends,
      selectedBufferId,
      selectedBufferKind,
      selectedBufferLabel,
      sidebarConnections,
      workspace.selectedNetwork,
    ],
  );

  const actionHandlers = useMemo<CommandPaletteActionHandlers>(
    () => ({
      selectNetwork: (networkId) => {
        const network = selectableNetworksById.get(networkId);
        if (network) {
          actions.selectNetworkBuffer(network);
        }
      },
      selectBuffer: (bufferId) => {
        const buffer = selectableBuffersById.get(bufferId);
        if (buffer) {
          actions.selectTabBuffer(buffer);
        }
      },
      selectPendingChannel: (networkId, channel) => {
        actions.selectPendingTab(networkId, channel);
      },
      selectFriend: async (friendId) => {
        const friend = friendsById.get(friendId);
        if (friend) {
          await actions.selectFriend(friend);
        }
      },
      openPreferences: ui.openPreferences,
      openNetworkManager: () => dispatch({ type: 'open-network-manager' }),
      openChannelList: () => { void actions.openChannelList(); },
      toggleCurrentChannelAutoJoin: () => { void actions.toggleCurrentChannelAutoJoin(); },
      clearBufferHistory: (bufferId) => { void actions.clearBufferHistory(bufferId); },
      downloadBufferHistory: (bufferId) => { void actions.downloadBufferHistory(bufferId); },
      openHistoryImport: (bufferId) => ui.openBufferToolDialog('history-import', bufferId),
      openSelfAliases: (bufferId) => ui.openBufferToolDialog('self-aliases', bufferId),
    }),
    [
      actions.clearBufferHistory,
      actions.downloadBufferHistory,
      actions.openChannelList,
      actions.selectFriend,
      actions.selectNetworkBuffer,
      actions.selectPendingTab,
      actions.selectTabBuffer,
      actions.toggleCurrentChannelAutoJoin,
      dispatch,
      friendsById,
      selectableBuffersById,
      selectableNetworksById,
      ui.openBufferToolDialog,
      ui.openPreferences,
    ],
  );

  const entries = useMemo(
    () => entrySpecs.map((entry) => ({
      ...entry,
      onSelect: () => runCommandPaletteAction(entry.action, actionHandlers),
    })),
    [actionHandlers, entrySpecs],
  );

  return useMemo(
    () => ({
      open: ui.commandPaletteOpen,
      entries,
      onOpen: ui.openCommandPalette,
      onClose: ui.closeCommandPalette,
    }),
    [entries, ui.closeCommandPalette, ui.commandPaletteOpen, ui.openCommandPalette],
  );
}

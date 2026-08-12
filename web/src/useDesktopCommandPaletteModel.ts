import { useMemo } from 'react';
import type { BufferState, NetworkProfile } from '../../shared/protocol-chat.js';
import { resolveCurrentChannelAutoJoinState } from './channel-autojoin.js';
import {
  buildCommandPaletteEntrySpecs,
  runCommandPaletteAction,
  type CommandPaletteActionHandlers,
  type CommandPaletteEntry,
} from './command-palette.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { Action, State } from './app-types.js';
import type { MediaVisibilityPolicy } from './media-visibility-settings.js';
import type { AppUiState } from './useAppUiState.js';
import type { AppActions } from './useAppActions.js';
import type { WorkspaceView } from './workspace-types.js';
import {
  useQueryAvatarOverrides,
  useUserAvatarOverrides,
} from './user-avatars/query-overrides.js';

type DesktopCommandPaletteModelParams = {
  actions: Pick<
    AppActions,
    | 'downloadBufferHistory'
    | 'openChannelList'
    | 'selectFriend'
    | 'selectNetworkBuffer'
    | 'selectPendingTab'
    | 'selectTabBuffer'
    | 'toggleCurrentChannelAutoJoin'
  >;
  dispatch: (action: Action) => void;
  externalAvatarsEnabled: boolean;
  friends: State['domain']['friends'];
  mediaPolicy: MediaVisibilityPolicy;
  nickEmojis: State['domain']['nickEmojis'];
  networks: State['domain']['networks'];
  sidebarConnections: SidebarConnectionView[];
  ui: Pick<
    AppUiState,
    | 'closeCommandPalette'
    | 'commandPaletteOpen'
    | 'openLogInspector'
    | 'openCommandPalette'
    | 'openPreferences'
  >;
  workspace: WorkspaceView;
};

export function useDesktopCommandPaletteModel({
  actions,
  dispatch,
  externalAvatarsEnabled,
  friends,
  mediaPolicy,
  nickEmojis,
  networks,
  sidebarConnections,
  ui,
  workspace,
}: DesktopCommandPaletteModelParams): {
  open: boolean;
  entries: CommandPaletteEntry[];
  onOpen: () => void;
  onClose: () => void;
} {
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
  const queryAvatarOverrides = useQueryAvatarOverrides();
  const userAvatarOverrides = useUserAvatarOverrides();
  const canUseBufferHistoryTools =
    selectedBufferKind === 'channel' || selectedBufferKind === 'query';
  const channelAutoJoin = resolveCurrentChannelAutoJoinState(networks, workspace);

  const entrySpecs = useMemo(
    () => buildCommandPaletteEntrySpecs({
      connections: sidebarConnections,
      friends,
      nickEmojis,
      selectedBuffer: {
        id: selectedBufferId,
        label: selectedBufferLabel,
      },
      selectedNetwork: {
        available: workspace.selectedNetwork !== null,
        id: workspace.selectedNetwork?.id ?? null,
        label: workspace.selectedNetwork?.name ?? null,
      },
      actions: {
        canToggleChannelAutoJoin: channelAutoJoin.available,
        channelAutoJoinActive: channelAutoJoin.active,
        canDownloadHistory: canUseBufferHistoryTools,
      },
      externalAvatarsEnabled,
      mediaPolicy,
      queryAvatarOverrides,
      userAvatarOverrides,
    }),
    [
      canUseBufferHistoryTools,
      channelAutoJoin.active,
      channelAutoJoin.available,
      externalAvatarsEnabled,
      friends,
      mediaPolicy,
      nickEmojis,
      queryAvatarOverrides,
      selectedBufferId,
      selectedBufferKind,
      selectedBufferLabel,
      sidebarConnections,
      userAvatarOverrides,
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
      openLogInspector: ui.openLogInspector,
      openNetworkManager: () => dispatch({ type: 'open-network-manager' }),
      openChannelList: () => { void actions.openChannelList(); },
      toggleCurrentChannelAutoJoin: () => { void actions.toggleCurrentChannelAutoJoin(); },
      downloadBufferHistory: (bufferId) => { void actions.downloadBufferHistory(bufferId); },
    }),
    [
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
      ui.openPreferences,
      ui.openLogInspector,
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

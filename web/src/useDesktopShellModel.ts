import { useMemo } from 'react';
import type { Action, State } from './app-types.js';
import type { AppModel } from './app-model.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';
import type { ComposerController } from './composer-history.js';
import { useNetworkEditorController } from './useNetworkEditorController.js';
import { useNetworkManagerController } from './useNetworkManagerController.js';

type DesktopShellModelParams = {
  actions: AppActions;
  composer: ComposerController;
  dispatch: (action: Action) => void;
  model: AppModel;
  transient: State['transient'];
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  ui: Pick<AppUiState, 'messageDisplayMode' | 'scrollRef' | 'setMessageDisplayMode'>;
};

export function useDesktopShellModel({
  actions,
  composer,
  dispatch,
  model,
  transient,
  friends,
  friendPresence,
  ui,
}: DesktopShellModelParams): DesktopShellModel {
  const header = useMemo(() => ({
    messageDisplayMode: ui.messageDisplayMode,
    showMessageDisplayModeToggle: import.meta.env.DEV,
    onMessageDisplayModeChange: ui.setMessageDisplayMode,
    onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
  }), [dispatch, ui.messageDisplayMode, ui.setMessageDisplayMode]);

  const sidebar = useMemo(() => ({
    connections: model.sidebarConnections,
    friends,
    friendPresence,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectFriend: actions.selectFriend,
    onSelectNetwork: actions.selectNetworkBuffer,
    onSelectBuffer: actions.selectTabBuffer,
    onSelectPendingChannel: actions.selectPendingTab,
    onReconnectNetwork: actions.reconnectNetwork,
    onDisconnectNetwork: actions.disconnectNetwork,
    onCloseConnection: actions.closeConnection,
    onCloseChannel: actions.closeChannel,
    onCloseBuffer: actions.closeBuffer,
  }), [
    actions.addFriend,
    actions.closeBuffer,
    actions.closeChannel,
    actions.closeConnection,
    actions.disconnectNetwork,
    actions.reconnectNetwork,
    actions.removeFriend,
    actions.selectFriend,
    actions.selectNetworkBuffer,
    actions.selectPendingTab,
    actions.selectTabBuffer,
    friendPresence,
    friends,
    model.sidebarConnections,
  ]);

  const chat = useMemo(() => ({
    workspace: model.workspace,
    friends,
    selectedMessages: model.selectedMessages,
    draft: composer.draft,
    messageDisplayMode: ui.messageDisplayMode,
    scrollRef: ui.scrollRef,
    onDraftChange: composer.setDraft,
    onRecallOlderDraft: composer.recallOlderDraft,
    onRecallNewerDraft: composer.recallNewerDraft,
    onSend: actions.sendComposer,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    channelList: transient.channelList,
    channelListNetwork: model.channelListNetwork,
    onCloseChannelList: actions.closeChannelList,
    onJoinChannelFromList: actions.joinChannelFromList,
    onOpenMentionedChannel: actions.openMentionedChannel,
    onOpenChannelList: actions.openChannelList,
    onCloseChannel: actions.closeChannel,
    onCloseBuffer: actions.closeBuffer,
  }), [
    actions.addFriend,
    actions.closeBuffer,
    actions.closeChannel,
    actions.closeChannelList,
    actions.joinChannelFromList,
    actions.openChannelList,
    actions.openMentionedChannel,
    actions.removeFriend,
    actions.sendComposer,
    composer.draft,
    composer.recallNewerDraft,
    composer.recallOlderDraft,
    composer.setDraft,
    friends,
    model.channelListNetwork,
    model.selectedMessages,
    model.workspace,
    transient.channelList,
    ui.messageDisplayMode,
    ui.scrollRef,
  ]);

  const nicklist = useMemo(() => ({
    friends,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectNick: actions.selectPrivateBuffer,
  }), [actions.addFriend, actions.removeFriend, actions.selectPrivateBuffer, friends]);

  return {
    workspace: model.workspace,
    header,
    sidebar,
    chat,
    nicklist,
    networkManager: useNetworkManagerController({
      actions,
      dispatch,
      hiddenManagedNetworkName: model.hiddenManagedNetworkName,
      managedRuntime: model.managedRuntime,
      networkManager: transient.networkManager,
      visibleManagedNetwork: model.visibleManagedNetwork,
      visibleNetworks: model.visibleNetworks,
    }),
    networkEditor: useNetworkEditorController({
      actions,
      dispatch,
      editor: transient.networkManager.editor,
      mode: transient.networkManager.mode,
    }),
  };
}

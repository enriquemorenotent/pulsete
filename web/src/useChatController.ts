import { useMemo } from 'react';
import type { AppModel } from './app-model.js';
import type { State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppActions } from './useAppActions.js';
import type { useAppUiState } from './useAppUiState.js';
import type { useComposerHistory } from './composer-history.js';

type ChatControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  composer: ReturnType<typeof useComposerHistory>;
  model: AppModel;
  state: State;
  ui: ReturnType<typeof useAppUiState>;
};

export function useChatController({
  actions,
  composer,
  model,
  state,
  ui,
}: ChatControllerParams): DesktopShellProps['chat'] {
  return useMemo(() => ({
    workspace: model.workspace,
    friends: state.domain.friends,
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
    channelList: state.transient.channelList,
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
    model.channelListNetwork,
    model.selectedMessages,
    model.workspace,
    state.domain.friends,
    state.transient.channelList,
    ui.messageDisplayMode,
    ui.scrollRef,
  ]);
}

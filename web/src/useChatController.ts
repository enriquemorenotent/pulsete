import { useMemo } from 'react';
import type { AppModel } from './app-model.js';
import type { AppUiState } from './useAppUiState.js';
import type { ComposerController } from './composer-history.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { ChatActionSet } from './useAppActions.js';

type ChatControllerParams = {
  actions: ChatActionSet;
  channelList: DesktopShellModel['chat']['channelList'];
  channelListNetwork: AppModel['channelListNetwork'];
  composer: Pick<ComposerController, 'draft' | 'recallNewerDraft' | 'recallOlderDraft' | 'setDraft'>;
  friends: DesktopShellModel['chat']['friends'];
  messageDisplayMode: AppUiState['messageDisplayMode'];
  scrollRef: AppUiState['scrollRef'];
  selectedMessages: AppModel['selectedMessages'];
  workspace: AppModel['workspace'];
};

export function useChatController({
  actions,
  channelList,
  channelListNetwork,
  composer,
  friends,
  messageDisplayMode,
  scrollRef,
  selectedMessages,
  workspace,
}: ChatControllerParams): DesktopShellModel['chat'] {
  return useMemo(() => ({
    workspace,
    friends,
    selectedMessages,
    draft: composer.draft,
    messageDisplayMode,
    scrollRef,
    onDraftChange: composer.setDraft,
    onRecallOlderDraft: composer.recallOlderDraft,
    onRecallNewerDraft: composer.recallNewerDraft,
    onSend: actions.sendComposer,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    channelList,
    channelListNetwork,
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
    channelList,
    channelListNetwork,
    friends,
    messageDisplayMode,
    scrollRef,
    selectedMessages,
    workspace,
  ]);
}

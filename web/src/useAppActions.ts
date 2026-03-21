import type { State } from './app-types.js';
import type { ConversationIndex } from './conversation-selectors.js';
import { createChatActions } from './app-actions-chat.js';
import { createConversationActions } from './app-actions-conversation.js';
import { createFriendActions } from './app-actions-friends.js';
import { createGatewayActions } from './app-actions-gateway.js';
import { createNetworkActions } from './app-actions-networks.js';
import type { AppDispatch, DraftActions, MutableRef, WorkspaceActions } from './app-actions-types.js';
import type { SocketHandle } from './client.js';

type UseAppActionsParams = DraftActions & WorkspaceActions & {
  conversation: ConversationIndex;
  dispatch: AppDispatch;
  socketRef: MutableRef<SocketHandle | null>;
  state: State;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export function useAppActions(params: UseAppActionsParams) {
  const gateway = createGatewayActions({
    gatewayStatus: params.state.domain.gatewayStatus,
    socketRef: params.socketRef,
    updateBanner: params.updateBanner,
  });
  const conversation = createConversationActions({
    channelList: params.state.transient.channelList,
    conversation: params.conversation,
    dispatch: params.dispatch,
    networkStates: params.state.domain.networkStates,
    updateBanner: params.updateBanner,
    ...gateway,
  });
  return {
    ...createNetworkActions({
      conversation: params.conversation,
      dispatch: params.dispatch,
      updateBanner: params.updateBanner,
    }),
    ...createFriendActions({
      buffers: params.state.domain.buffers,
      dispatch: params.dispatch,
      networkStates: params.state.domain.networkStates,
      updateBanner: params.updateBanner,
      workspace: params.workspace,
      ...conversation,
    }),
    ...createChatActions({
      channelList: params.state.transient.channelList,
      conversation: params.conversation,
      dispatch: params.dispatch,
      networks: params.state.domain.networks,
      updateBanner: params.updateBanner,
      workspace: params.workspace,
      draft: params.draft,
      setDraft: params.setDraft,
      recordComposerEntry: params.recordComposerEntry,
      ...gateway,
      ...conversation,
    }),
  };
}
